use super::audio::MusicAudioSettings;
use super::{MusicStream, MusicTrack};
use libmpv2::events::{Event, EventContext, PropertyData};
use libmpv2::mpv_node::MpvNode;
use libmpv2::{Format, Mpv};
use lofty::file::AudioFile;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[path = "telemetry.rs"]
mod telemetry;
#[path = "spectrum.rs"]
mod spectrum;
pub use telemetry::MusicMeterSnapshot;

// MPV_FORMAT_FLAG writes a C int. libmpv2 4.1's GetData for bool uses
// a one-byte Rust bool buffer, so read into an i32-backed value instead.
#[repr(transparent)]
struct NativeFlag(i32);

unsafe impl libmpv2::GetData for NativeFlag {
    fn get_format() -> Format {
        Format::Flag
    }
}

struct MusicSession {
    mpv: Arc<Mpv>,
    track_id: String,
    connector_id: Option<String>,
    spectrum: Arc<std::sync::Mutex<spectrum::Spectrum>>,
}

pub struct MusicEngine {
    inner: Arc<Mutex<Option<MusicSession>>>,
    generation: Arc<AtomicU64>,
    paused_for_video: AtomicBool,
    audio: std::sync::Mutex<MusicAudioSettings>,
    audio_path: std::sync::Mutex<Option<PathBuf>>,
    meter_enabled: AtomicBool,
}

impl MusicEngine {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            generation: Arc::new(AtomicU64::new(0)),
            paused_for_video: AtomicBool::new(false),
            audio: std::sync::Mutex::new(MusicAudioSettings::default()),
            audio_path: std::sync::Mutex::new(None),
            meter_enabled: AtomicBool::new(false),
        }
    }

    pub async fn play(
        &self,
        app: AppHandle,
        stream: MusicStream,
        track: MusicTrack,
        volume: f64,
    ) -> Result<(), String> {
        stream.request_headers()?;
        let url = &stream.url;
        if url.trim().is_empty() {
            return Err("Music stream URL is empty".to_string());
        }
        let mut slot = self.inner.lock().await;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.paused_for_video.store(false, Ordering::SeqCst);
        retire_session(&mut slot).await?;

        force_c_numeric_locale();
        let mpv = Mpv::with_initializer(|init| {
            for (name, value) in [
                ("title", "Harbor Music"),
                ("audio-client-name", "Harbor Music"),
                ("terminal", "no"),
                ("video", "no"),
                ("vo", "null"),
                ("force-window", "no"),
                ("idle", "yes"),
                ("keep-open", "yes"),
                ("ytdl", "no"),
                ("volume-max", "600"),
            ] {
                init.set_property(name, value)?;
            }
            Ok(())
        })
        .map_err(|error| format!("music mpv init: {error}"))?;
        apply_stream_headers(&mpv, &stream)?;
        let _ = mpv.set_property("cache", "yes");
        let _ = mpv.set_property("cache-secs", "30");
        let _ = mpv.set_property("cache-pause", "yes");
        let _ = mpv.set_property("network-timeout", "30");
        let audio = self.audio_settings()?;
        let available = read_music_audio_devices(&mpv).unwrap_or_default();
        let device_available =
            audio.device == "auto" || available.iter().any(|device| device.name == audio.device);
        apply_music_audio(
            &mpv,
            &audio,
            if device_available {
                &audio.device
            } else {
                "auto"
            },
            self.meter_enabled.load(Ordering::SeqCst),
        )?;
        let volume = audio.clamp_volume(volume);
        let _ = mpv.set_property(
            "volume",
            if device_available {
                volume
            } else {
                volume.min(1.0)
            } * 100.0,
        );

        let mpv = Arc::new(mpv);
        let spectrum = Arc::new(std::sync::Mutex::new(spectrum::Spectrum::default()));
        telemetry::request_logs(&mpv, self.meter_enabled.load(Ordering::SeqCst));
        let event_context = EventContext::new(mpv.ctx);
        for (name, format, id) in [
            ("time-pos", Format::Double, 1),
            ("duration", Format::Double, 2),
            ("pause", Format::Flag, 3),
            ("volume", Format::Double, 4),
            ("eof-reached", Format::Flag, 5),
        ] {
            event_context
                .observe_property(name, format, id)
                .map_err(|error| format!("observe music property {name}: {error}"))?;
        }
        // The string-command wrapper splits paths containing spaces. Share the
        // argument-vector command used by the main player instead.
        crate::mpv::mpv_argv_command(&mpv, &["loadfile", url.as_str(), "replace"])
            .map_err(|error| format!("music loadfile: {error}"))?;
        let started_at = unix_seconds();
        let local_path = (track.connector_id.as_deref() == Some("local")
            && Path::new(url).is_absolute())
        .then(|| PathBuf::from(url));
        let track_id = track.id.clone();
        let connector_id = track.connector_id.clone();
        spawn_event_loop(
            app,
            mpv.clone(),
            event_context,
            self.generation.clone(),
            generation,
            track,
            started_at,
            local_path,
            spectrum.clone(),
        );
        *slot = Some(MusicSession {
            mpv,
            track_id,
            connector_id,
            spectrum,
        });
        Ok(())
    }

    pub async fn pause_for_video(&self) -> Result<bool, String> {
        let slot = self.inner.lock().await;
        let Some(session) = slot.as_ref() else {
            return Ok(false);
        };
        let paused = session
            .mpv
            .get_property::<NativeFlag>("pause")
            .map_err(|error| format!("read music pause state: {error}"))?;
        if paused.0 != 0 {
            self.paused_for_video.store(false, Ordering::SeqCst);
            return Ok(false);
        }
        session
            .mpv
            .set_property("pause", true)
            .map_err(|error| format!("pause music for video: {error}"))?;
        self.paused_for_video.store(true, Ordering::SeqCst);
        Ok(true)
    }

    pub async fn set_paused(&self, paused: bool) -> Result<(), String> {
        self.paused_for_video.store(false, Ordering::SeqCst);
        let slot = self.inner.lock().await;
        let Some(session) = slot.as_ref() else {
            return Ok(());
        };
        if !paused
            && session
                .mpv
                .get_property::<NativeFlag>("eof-reached")
                .is_ok_and(|value| value.0 != 0)
            && !session
                .mpv
                .get_property::<NativeFlag>("seeking")
                .is_ok_and(|value| value.0 != 0)
        {
            // keep-open holds a finished file in a paused EOF state. Unpausing
            // alone cannot restart it; an explicit Play begins the track again.
            session
                .mpv
                .command("seek", &["0", "absolute+exact"])
                .map_err(|error| format!("music restart after end: {error}"))?;
        }
        session
            .mpv
            .set_property("pause", paused)
            .map_err(|error| format!("music pause: {error}"))
    }

    pub async fn seek(&self, position: f64) -> Result<(), String> {
        if !position.is_finite() {
            return Err("Music seek position is invalid".to_string());
        }
        let slot = self.inner.lock().await;
        let Some(session) = slot.as_ref() else {
            return Ok(());
        };
        let position = position.max(0.0).to_string();
        session
            .mpv
            .command("seek", &[position.as_str(), "absolute"])
            .map_err(|error| format!("music seek: {error}"))
    }

    pub async fn set_volume(&self, volume: f64) -> Result<(), String> {
        let volume = self.audio_settings()?.clamp_volume(volume);
        let slot = self.inner.lock().await;
        let Some(session) = slot.as_ref() else {
            return Ok(());
        };
        session
            .mpv
            .set_property("volume", volume * 100.0)
            .map_err(|error| format!("music volume: {error}"))
    }

    pub fn initialize_audio(&self, path: PathBuf) {
        let settings = std::fs::read(&path)
            .ok()
            .filter(|data| data.len() <= 8192)
            .and_then(|data| serde_json::from_slice::<MusicAudioSettings>(&data).ok())
            .unwrap_or_default()
            .normalized();
        if let Ok(mut current) = self.audio.lock() {
            *current = settings;
        }
        if let Ok(mut current) = self.audio_path.lock() {
            *current = Some(path);
        }
    }

    pub fn audio_settings(&self) -> Result<MusicAudioSettings, String> {
        self.audio
            .lock()
            .map(|settings| settings.clone())
            .map_err(|_| "Music audio settings are unavailable".into())
    }

    pub async fn audio_devices(&self) -> Result<Vec<crate::mpv::AudioDevice>, String> {
        let slot = self.inner.lock().await;
        if let Some(session) = slot.as_ref() {
            return read_music_audio_devices(&session.mpv);
        }
        force_c_numeric_locale();
        let mpv = Mpv::with_initializer(|init| {
            init.set_property("video", "no")?;
            init.set_property("vo", "null")?;
            init.set_property("terminal", "no")?;
            let _ = init.set_property("media-controls", "no");
            Ok(())
        })
        .map_err(|error| format!("Music output detection: {error}"))?;
        read_music_audio_devices(&mpv)
    }

    pub async fn set_audio_settings(
        &self,
        settings: MusicAudioSettings,
    ) -> Result<MusicAudioSettings, String> {
        let settings = settings.normalized();
        if settings.device != "auto"
            && !self
                .audio_devices()
                .await?
                .iter()
                .any(|device| device.name == settings.device)
        {
            return Err("Selected music output is unavailable".into());
        }
        let previous = self.audio_settings()?;
        let slot = self.inner.lock().await;
        let meter_enabled = self.meter_enabled.load(Ordering::SeqCst);
        if let Some(session) = slot.as_ref() {
            // A higher ceiling never turns the volume up. A new device starts at unity or below.
            let current = session.mpv.get_property::<f64>("volume").unwrap_or(82.0);
            let ceiling = if settings.device != previous.device {
                100.0
            } else {
                settings.volume_limit * 100.0
            };
            if current > ceiling {
                session
                    .mpv
                    .set_property("volume", ceiling)
                    .map_err(|error| error.to_string())?;
            }
            if let Err(error) =
                apply_music_audio(&session.mpv, &settings, &settings.device, meter_enabled)
            {
                let _ = apply_music_audio(&session.mpv, &previous, &previous.device, meter_enabled);
                return Err(error);
            }
        }
        let persist = (|| -> Result<(), String> {
            let path = self
                .audio_path
                .lock()
                .map_err(|_| "Music audio settings are unavailable")?
                .clone()
                .ok_or("Music storage is not ready")?;
            let data = serde_json::to_vec(&settings).map_err(|error| error.to_string())?;
            let temporary = path.with_extension("json.tmp");
            std::fs::write(&temporary, data)
                .map_err(|error| format!("Save music audio settings: {error}"))?;
            std::fs::rename(&temporary, &path)
                .map_err(|error| format!("Save music audio settings: {error}"))?;
            Ok(())
        })();
        if let Err(error) = persist {
            if let Some(session) = slot.as_ref() {
                let _ = apply_music_audio(&session.mpv, &previous, &previous.device, meter_enabled);
            }
            return Err(error);
        }
        *self
            .audio
            .lock()
            .map_err(|_| "Music audio settings are unavailable")? = settings.clone();
        Ok(settings)
    }

    pub async fn set_meter_enabled(&self, enabled: bool) -> Result<(), String> {
        let slot = self.inner.lock().await;
        if self.meter_enabled.load(Ordering::SeqCst) == enabled {
            if enabled {
                if let Some(session) = slot.as_ref() {
                    if telemetry::ensure_enabled(&session.mpv)? {
                        if let Ok(mut spectrum) = session.spectrum.lock() { spectrum.clear(); }
                    }
                }
            }
            return Ok(());
        }
        if let Some(session) = slot.as_ref() {
            telemetry::set_enabled(&session.mpv, enabled)?;
            if let Ok(mut spectrum) = session.spectrum.lock() { spectrum.clear(); }
        }
        self.meter_enabled.store(enabled, Ordering::SeqCst);
        Ok(())
    }

    pub async fn meter_snapshot(&self) -> Option<MusicMeterSnapshot> {
        let slot = self.inner.lock().await;
        if !self.meter_enabled.load(Ordering::SeqCst) {
            return None;
        }
        slot.as_ref().map(|session| {
            let mut snapshot = telemetry::snapshot(
                &session.mpv,
                &session.track_id,
                session.connector_id.as_deref(),
            );
            if snapshot.active {
                if let (Ok(spectrum), Ok(position)) = (session.spectrum.lock(), session.mpv.get_property::<f64>("time-pos")) {
                    snapshot.spectrum_db = spectrum.at(position);
                }
            }
            snapshot
        })
    }

    pub async fn stop(&self, unpause: bool) -> Result<(), String> {
        if unpause {
            if !self.paused_for_video.swap(false, Ordering::SeqCst) {
                return Ok(());
            }
            let slot = self.inner.lock().await;
            let Some(session) = slot.as_ref() else {
                return Ok(());
            };
            return session
                .mpv
                .set_property("pause", false)
                .map_err(|error| format!("resume music: {error}"));
        }
        self.paused_for_video.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        let mut slot = self.inner.lock().await;
        retire_session(&mut slot).await?;
        Ok(())
    }

    pub fn shutdown(&self) {
        self.paused_for_video.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut slot) = self.inner.try_lock() {
            if let Some(session) = slot.take() {
                let _ = session.mpv.command("quit", &[]);
            }
        }
    }
}

/// libmpv teardown resets FFmpeg's process-wide log callback. Every owner of the
/// outgoing context must drain before the next context initializes that callback.
async fn retire_session(slot: &mut Option<MusicSession>) -> Result<(), String> {
    let Some(mut previous) = slot.take() else { return Ok(()); };
    let _ = previous.mpv.command("quit", &[]);
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match Arc::try_unwrap(previous.mpv) {
            Ok(mpv) => {
                tokio::task::spawn_blocking(move || drop(mpv)).await
                    .map_err(|error| format!("music player teardown: {error}"))?;
                return Ok(());
            }
            Err(mpv) => {
                previous.mpv = mpv;
                if Instant::now() >= deadline {
                    // Keep ownership: another play attempt must finish this teardown,
                    // never initialize a successor while old worker references remain.
                    *slot = Some(previous);
                    return Err("Music player is still shutting down. Try again.".to_string());
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        }
    }
}

fn spawn_event_loop(
    app: AppHandle,
    mpv: Arc<Mpv>,
    mut context: EventContext,
    active_generation: Arc<AtomicU64>,
    generation: u64,
    track: MusicTrack,
    started_at: u64,
    local_path: Option<PathBuf>,
    spectrum: Arc<std::sync::Mutex<spectrum::Spectrum>>,
) {
    std::thread::spawn(move || {
        let mut last_position_event = Instant::now() - Duration::from_secs(1);
        let mut previous_position = None;
        let mut listened_seconds = 0.0;
        let mut duration_seconds = track.duration_seconds as f64;
        let mut scrobble_started = false;
        let mut quality_started = false;
        let mut eof_signaled = false;
        loop {
            if active_generation.load(Ordering::SeqCst) != generation {
                break;
            }
            match context.wait_event(0.25) {
                Some(Ok(event)) => {
                    if let Event::LogMessage { prefix, text, .. } = &event {
                        if *prefix == "ffmpeg" {
                            if let Ok(mut spectrum) = spectrum.lock() { spectrum.ingest(text); }
                        }
                        continue;
                    }
                    if matches!(event, Event::Seek) {
                        if let Ok(mut spectrum) = spectrum.lock() { spectrum.clear(); }
                    }
                    if matches!(event, Event::FileLoaded) && !quality_started {
                        quality_started = true;
                        let quality_app = app.clone();
                        let quality_mpv = mpv.clone();
                        let quality_generation = active_generation.clone();
                        let quality_track = track.clone();
                        let quality_path = local_path.clone();
                        // File properties are read once, away from both UI and mpv event delivery.
                        std::thread::spawn(move || {
                            let quality = audio_quality(&quality_mpv, quality_path.as_deref());
                            if quality_generation.load(Ordering::SeqCst) == generation {
                                let _ = quality_app.emit(
                                    "music://event",
                                    json!({
                                        "event": "audio-quality",
                                        "trackId": quality_track.id,
                                        "connectorId": quality_track.connector_id,
                                        "quality": quality,
                                    }),
                                );
                            }
                        });
                    }
                    let mut natural_eof = false;
                    if let Event::PropertyChange { name, change, .. } = &event {
                        if *name == "time-pos" {
                            if let PropertyData::Double(position) = change {
                                listened_seconds +=
                                    listened_increment(previous_position, *position);
                                previous_position = Some(*position);
                            }
                            if last_position_event.elapsed() < Duration::from_millis(200) {
                                continue;
                            }
                            last_position_event = Instant::now();
                        } else if *name == "duration" {
                            if let PropertyData::Double(duration) = change {
                                if duration.is_finite() && *duration > 0.0 {
                                    duration_seconds = *duration;
                                }
                            }
                        } else if *name == "eof-reached" {
                            if let PropertyData::Flag(reached) = change {
                                if *reached && !eof_signaled {
                                    eof_signaled = true;
                                    natural_eof = true;
                                } else if !*reached {
                                    eof_signaled = false;
                                }
                            }
                        }
                    }
                    if (matches!(event, Event::EndFile(_)) || natural_eof)
                        && !scrobble_started
                        && should_scrobble(listened_seconds, duration_seconds)
                    {
                        scrobble_started = true;
                        let scrobble_app = app.clone();
                        let scrobble_track = track.clone();
                        tauri::async_runtime::spawn(async move {
                            match super::commands::scrobble_track(
                                &scrobble_app,
                                &scrobble_track,
                                started_at,
                            )
                            .await
                            {
                                Ok(true) => {
                                    let _ = scrobble_app
                                        .emit("music://lastfm", json!({ "status": "scrobbled" }));
                                }
                                Ok(false) => {}
                                Err(error) => {
                                    eprintln!("[harbor::music] Last.fm scrobble failed: {error}");
                                    let _ = scrobble_app.emit(
                                        "music://lastfm",
                                        json!({ "status": "error", "message": error }),
                                    );
                                }
                            }
                        });
                    }
                    let shutdown = matches!(event, Event::Shutdown);
                    if let Some(mut payload) = event_payload(event) {
                        payload["trackId"] = json!(track.id);
                        payload["connectorId"] = json!(track.connector_id);
                        let _ = app.emit("music://event", payload);
                    }
                    if natural_eof {
                        let _ = app.emit(
                            "music://event",
                            json!({ "event": "end-file", "reason": "eof", "trackId": track.id, "connectorId": track.connector_id }),
                        );
                    }
                    if shutdown {
                        break;
                    }
                }
                Some(Err(error)) => {
                    let _ = app.emit(
                        "music://event",
                        json!({ "event": "player-failure", "reason": error.to_string(), "trackId": track.id, "connectorId": track.connector_id }),
                    );
                    break;
                }
                None => {}
            }
        }
        drop(mpv);
    });
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioQuality {
    #[serde(skip_serializing_if = "Option::is_none")]
    codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sample_rate_hz: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bit_depth: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bitrate_kbps: Option<f64>,
}

fn audio_quality(mpv: &Mpv, local_path: Option<&Path>) -> AudioQuality {
    let mut quality = AudioQuality {
        codec: mpv
            .get_property::<String>("current-tracks/audio/codec")
            .ok()
            .filter(|value| !value.is_empty() && value.len() <= 80),
        sample_rate_hz: mpv
            .get_property::<i64>("audio-params/samplerate")
            .ok()
            .and_then(|value| u32::try_from(value).ok())
            .filter(|value| *value > 0 && *value <= 3_072_000),
        bitrate_kbps: mpv
            .get_property::<f64>("audio-bitrate")
            .ok()
            .filter(|value| value.is_finite() && *value > 0.0 && *value <= 100_000_000.0)
            .map(|value| value / 1000.0),
        ..AudioQuality::default()
    };
    if let Some(path) = local_path {
        if let Some(properties) = local_audio_properties(path) {
            // audio-params/format describes decoder packing (e.g. s32 for 24-bit
            // FLAC), so only file properties may supply the source bit depth.
            quality.bit_depth = properties
                .bit_depth()
                .filter(|value| *value > 0 && *value <= 64);
            quality.sample_rate_hz = quality.sample_rate_hz.or(properties
                .sample_rate()
                .filter(|value| *value > 0 && *value <= 3_072_000));
            quality.bitrate_kbps = quality.bitrate_kbps.or(properties
                .audio_bitrate()
                .filter(|value| *value > 0 && *value <= 100_000)
                .map(f64::from));
        }
    }
    quality
}

fn local_audio_properties(path: &Path) -> Option<lofty::properties::FileProperties> {
    let tagged = lofty::probe::Probe::open(path)
        .ok()?
        .guess_file_type()
        .ok()?
        .options(
            lofty::config::ParseOptions::new()
                .read_tags(false)
                .read_cover_art(false),
        )
        .read()
        .ok()?;
    Some(tagged.properties().clone())
}

fn event_payload(event: Event) -> Option<Value> {
    match event {
        Event::PropertyChange { name, change, .. } => {
            let data = match change {
                PropertyData::Str(value) => Value::String(value.to_string()),
                PropertyData::OsdStr(value) => Value::String(value.to_string()),
                PropertyData::Flag(value) => Value::Bool(value),
                PropertyData::Int64(value) => json!(value),
                PropertyData::Double(value) => json!(value),
                PropertyData::Node(_) => return None,
            };
            Some(json!({ "event": "property-change", "name": name, "data": data }))
        }
        Event::EndFile(reason) => Some(json!({
            "event": "end-file",
            "reason": match reason {
                0 => "eof",
                2 => "stop",
                3 => "quit",
                4 => "error",
                5 => "redirect",
                _ => "other",
            }
        })),
        Event::FileLoaded => Some(json!({ "event": "file-loaded" })),
        Event::PlaybackRestart => Some(json!({ "event": "playback-restart" })),
        Event::Seek => Some(json!({ "event": "seek" })),
        Event::Shutdown => Some(json!({ "event": "shutdown" })),
        _ => None,
    }
}

fn read_music_audio_devices(mpv: &Mpv) -> Result<Vec<crate::mpv::AudioDevice>, String> {
    let node = mpv
        .get_property::<MpvNode>("audio-device-list")
        .map_err(|error| format!("Read music outputs: {error}"))?;
    let mut devices = Vec::new();
    if let Some(entries) = node.array() {
        for entry in entries.take(128) {
            let mut name = String::new();
            let mut description = String::new();
            if let Some(fields) = entry.map() {
                for (key, value) in fields {
                    match key.as_str() {
                        "name" => name = value.str().unwrap_or_default().to_string(),
                        "description" => description = value.str().unwrap_or_default().to_string(),
                        _ => {}
                    }
                }
            }
            if !name.is_empty() && name != "auto" {
                devices.push(crate::mpv::AudioDevice { name, description });
            }
        }
    }
    Ok(devices)
}

fn apply_stream_headers(mpv: &Mpv, stream: &MusicStream) -> Result<(), String> {
    use libmpv2_sys::{
        mpv_format_MPV_FORMAT_NODE, mpv_format_MPV_FORMAT_NODE_ARRAY, mpv_format_MPV_FORMAT_STRING,
        mpv_node, mpv_node__bindgen_ty_1, mpv_node_list,
    };
    use std::ffi::CString;

    let mut fields = Vec::new();
    for (name, value) in &stream.http_headers {
        if name.eq_ignore_ascii_case("user-agent") {
            mpv.set_property("user-agent", value.as_str())
                .map_err(|_| "Music could not apply the source user agent".to_string())?;
        } else {
            fields.push(
                CString::new(format!("{name}: {value}"))
                    .map_err(|_| "Music source returned invalid request headers".to_string())?,
            );
        }
    }
    // Supply a native string array. The string-list parser treats commas and
    // backslashes differently, so serializing these headers can alter their values.
    let mut values: Vec<mpv_node> = fields
        .iter()
        .map(|field| mpv_node {
            u: mpv_node__bindgen_ty_1 {
                string: field.as_ptr().cast_mut(),
            },
            format: mpv_format_MPV_FORMAT_STRING,
        })
        .collect();
    let mut list = mpv_node_list {
        num: values.len() as i32,
        values: if values.is_empty() {
            std::ptr::null_mut()
        } else {
            values.as_mut_ptr()
        },
        keys: std::ptr::null_mut(),
    };
    let mut node = mpv_node {
        u: mpv_node__bindgen_ty_1 { list: &mut list },
        format: mpv_format_MPV_FORMAT_NODE_ARRAY,
    };
    // SAFETY: The strings, values, list, and node remain alive for this synchronous
    // call. mpv copies the input; it does not take ownership of these Rust buffers.
    let status = unsafe {
        libmpv2_sys::mpv_set_property(
            mpv.ctx.as_ptr(),
            b"http-header-fields\0".as_ptr().cast(),
            mpv_format_MPV_FORMAT_NODE,
            (&mut node as *mut mpv_node).cast(),
        )
    };
    if status < 0 {
        Err("Music could not apply the source request headers".to_string())
    } else {
        Ok(())
    }
}

fn apply_music_audio(
    mpv: &Mpv,
    settings: &MusicAudioSettings,
    device: &str,
    meter_enabled: bool,
) -> Result<(), String> {
    let replay_gain = if settings.replay_gain == "off" || settings.dsp_bypass {
        "no"
    } else {
        &settings.replay_gain
    };
    for (name, value) in [
        ("replaygain", replay_gain),
        ("replaygain-clip", "no"),
        ("replaygain-preamp", "0"),
        ("replaygain-fallback", "0"),
    ] {
        mpv.set_property(name, value)
            .map_err(|error| format!("Music ReplayGain: {error}"))?;
    }
    mpv.set_property("volume-max", settings.volume_limit * 100.0)
        .map_err(|error| format!("Music volume ceiling: {error}"))?;
    mpv.set_property(
        "af",
        telemetry::audio_filters(&settings.filter(), meter_enabled).as_str(),
    )
    .map_err(|error| format!("Music equalizer: {error}"))?;
    mpv.set_property("audio-exclusive", if settings.exclusive { "yes" } else { "no" })
        .map_err(|error| format!("Music exclusive output: {error}"))?;
    mpv.set_property("audio-samplerate", i64::from(settings.sample_rate))
        .map_err(|error| format!("Music sample rate: {error}"))?;
    mpv.set_property("audio-device", device)
        .map_err(|error| format!("Music output: {error}"))?;
    Ok(())
}

pub(super) fn listened_increment(previous: Option<f64>, current: f64) -> f64 {
    let Some(previous) = previous else {
        return 0.0;
    };
    let delta = current - previous;
    if current.is_finite() && delta.is_finite() && delta > 0.0 && delta <= 2.0 {
        delta
    } else {
        0.0
    }
}

pub(super) fn should_scrobble(listened_seconds: f64, duration_seconds: f64) -> bool {
    let threshold = if duration_seconds.is_finite() && duration_seconds > 0.0 {
        (duration_seconds * 0.5).min(240.0)
    } else {
        240.0
    };
    listened_seconds >= threshold
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(unix)]
fn force_c_numeric_locale() {
    unsafe {
        libc::setlocale(libc::LC_NUMERIC, b"C\0".as_ptr() as *const libc::c_char);
    }
}

#[cfg(not(unix))]
fn force_c_numeric_locale() {}

#[cfg(test)]
mod tests {
    use super::*;

    async fn wait_for_native(condition: impl Fn() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !condition() && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(condition(), "native playback state did not settle");
    }

    #[tokio::test]
    async fn native_meter_reads_real_stereo_preserves_processing_and_disables() {
        force_c_numeric_locale();
        let path = std::env::temp_dir().join(format!("harbor-meter-{}.wav", uuid::Uuid::new_v4()));
        let mut writer = hound::WavWriter::create(
            &path,
            hound::WavSpec {
                channels: 2,
                sample_rate: 48000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .expect("synthetic stereo fixture");
        for i in 0..48000 * 8 {
            let sine = (2.0 * std::f64::consts::PI * 1000.0 * f64::from(i) / 48000.0).sin();
            writer.write_sample((16384.0 * sine) as i16).unwrap();
            writer.write_sample((8192.0 * sine) as i16).unwrap();
        }
        writer.finalize().unwrap();
        let mpv = Arc::new(
            Mpv::with_initializer(|init| {
                for (key, value) in [
                    ("ao", "null"),
                    ("vo", "null"),
                    ("terminal", "no"),
                    ("idle", "yes"),
                    ("keep-open", "yes"),
                ] {
                    init.set_property(key, value)?;
                }
                Ok(())
            })
            .expect("isolated null-output player"),
        );
        apply_music_audio(&mpv, &MusicAudioSettings::default(), "auto", false).unwrap();
        let mut events = EventContext::new(mpv.ctx);
        crate::mpv::mpv_argv_command(&mpv, &["loadfile", path.to_str().unwrap(), "replace"])
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if matches!(events.wait_event(0.0), Some(Ok(Event::FileLoaded))) {
                break;
            }
            assert!(Instant::now() < deadline, "meter fixture did not load");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let engine = MusicEngine::new();
        let settings_path = path.with_extension("audio.json");
        engine.initialize_audio(settings_path.clone());
        *engine.inner.lock().await = Some(MusicSession {
            mpv: mpv.clone(),
            track_id: "meter-fixture".into(),
            connector_id: Some("local".into()),
            spectrum: Arc::new(std::sync::Mutex::new(spectrum::Spectrum::default())),
        });
        assert!(engine.meter_snapshot().await.is_none());
        engine
            .set_meter_enabled(true)
            .await
            .expect("append opt-in analysis");
        wait_for_native(|| {
            telemetry::snapshot(&mpv, "meter-fixture", Some("local"))
                .channels
                .len()
                == 2
        })
        .await;
        let measured = engine.meter_snapshot().await.unwrap();
        assert_eq!(measured.track_id, "meter-fixture");
        assert_eq!(measured.output_sample_rate_hz, Some(48000));
        assert_eq!(measured.output_backend.as_deref(), Some("null"));
        assert!((measured.channels[0].rms_db + 9.03).abs() < 0.3);
        assert!((measured.channels[1].rms_db + 15.05).abs() < 0.3);
        assert!((measured.channels[0].peak_db + 6.02).abs() < 0.1);
        engine.set_volume(0.5).await.unwrap();
        let settings = MusicAudioSettings {
            balance: -1.0,
            replay_gain: "album".into(),
            ..MusicAudioSettings::default()
        };
        engine
            .set_audio_settings(settings)
            .await
            .expect("audio settings retain meter");
        wait_for_native(|| {
            telemetry::snapshot(&mpv, "meter-fixture", Some("local"))
                .channels
                .get(1)
                .is_some_and(|channel| channel.rms_db < -100.0)
        })
        .await;
        assert!((mpv.get_property::<f64>("volume").unwrap() - 50.0).abs() < 0.1);
        assert_eq!(mpv.get_property::<String>("replaygain").unwrap(), "album");
        engine.set_paused(true).await.unwrap();
        assert!(!engine.meter_snapshot().await.unwrap().active);
        engine
            .set_meter_enabled(false)
            .await
            .expect("remove analysis only");
        assert!(engine.meter_snapshot().await.is_none());
        let filters = mpv.get_property::<String>("af").unwrap();
        assert!(filters.contains("pan="));
        assert!(!filters.contains("astats"));
        assert_ne!(mpv.get_property::<NativeFlag>("pause").unwrap().0, 0);
        engine.stop(false).await.unwrap();
        drop(events);
        drop(mpv);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_file(settings_path).unwrap();
    }

    #[tokio::test]
    async fn native_seek_to_end_can_resume_and_paused_seeks_keep_their_position() {
        force_c_numeric_locale();
        let path =
            std::env::temp_dir().join(format!("harbor-seek-resume-{}.wav", uuid::Uuid::new_v4()));
        let mut writer = hound::WavWriter::create(
            &path,
            hound::WavSpec {
                channels: 1,
                sample_rate: 8000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .expect("silent seek fixture");
        for _ in 0..80000 {
            writer.write_sample(0_i16).expect("silent sample");
        }
        writer.finalize().expect("finish seek fixture");
        let mpv = Arc::new(
            Mpv::with_initializer(|init| {
                for (name, value) in [
                    ("ao", "null"),
                    ("vo", "null"),
                    ("keep-open", "yes"),
                    ("pause", "yes"),
                    ("idle", "yes"),
                ] {
                    init.set_property(name, value)?;
                }
                Ok(())
            })
            .expect("silent native instance"),
        );
        let mut events = EventContext::new(mpv.ctx);
        crate::mpv::mpv_argv_command(
            &mpv,
            &["loadfile", path.to_str().expect("fixture path"), "replace"],
        )
        .expect("load fixture");
        // Duration appears while the file is still opening. The real engine admits
        // seek controls after FileLoaded, so wait for that same readiness boundary.
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if matches!(events.wait_event(0.0), Some(Ok(Event::FileLoaded))) {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "seek fixture did not finish loading"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let engine = MusicEngine::new();
        *engine.inner.lock().await = Some(MusicSession {
            mpv: mpv.clone(),
            track_id: "seek-fixture".into(),
            connector_id: Some("local".into()),
            spectrum: Arc::new(std::sync::Mutex::new(spectrum::Spectrum::default())),
        });

        engine.seek(3.0).await.expect("seek while paused");
        wait_for_native(|| mpv.get_property::<f64>("time-pos").unwrap_or(0.0) >= 3.0).await;
        assert_ne!(
            mpv.get_property::<NativeFlag>("pause")
                .expect("pause state")
                .0,
            0
        );
        engine
            .set_paused(false)
            .await
            .expect("resume at chosen position");
        wait_for_native(|| mpv.get_property::<f64>("time-pos").unwrap_or(0.0) > 3.1).await;

        engine.seek(10.0).await.expect("seek to end");
        wait_for_native(|| {
            mpv.get_property::<NativeFlag>("eof-reached")
                .is_ok_and(|value| value.0 != 0)
        })
        .await;
        engine
            .set_paused(false)
            .await
            .expect("Play after seeking to end");
        wait_for_native(|| {
            let position = mpv.get_property::<f64>("time-pos").unwrap_or(10.0);
            position > 0.05 && position < 1.0
        })
        .await;
        assert_eq!(
            mpv.get_property::<NativeFlag>("pause")
                .expect("resumed state")
                .0,
            0
        );
        assert_eq!(
            mpv.get_property::<NativeFlag>("eof-reached")
                .expect("EOF cleared")
                .0,
            0
        );

        engine.seek(10.0).await.expect("seek to end again");
        wait_for_native(|| {
            mpv.get_property::<NativeFlag>("eof-reached")
                .is_ok_and(|value| value.0 != 0)
        })
        .await;
        engine.seek(4.0).await.expect("seek back from end");
        engine
            .set_paused(false)
            .await
            .expect("immediately resume the selected position");
        wait_for_native(|| {
            mpv.get_property::<f64>("time-pos")
                .is_ok_and(|position| position > 4.05 && position < 5.0)
        })
        .await;
        engine.stop(false).await.expect("stop isolated player");
        drop(mpv);
        std::fs::remove_file(path).expect("remove silent fixture");
    }

    #[test]
    fn native_stream_headers_preserve_commas_and_backslashes() {
        force_c_numeric_locale();
        let mpv = Mpv::with_initializer(|init| {
            for (name, value) in [("ao", "null"), ("vo", "null"), ("idle", "yes")] {
                init.set_property(name, value)?;
            }
            Ok(())
        })
        .expect("silent native instance");
        let stream = MusicStream {
            url: String::new(),
            mime_type: String::new(),
            bitrate: 0,
            http_headers: [
                ("User-Agent".into(), "provided agent".into()),
                (
                    "Accept".into(),
                    "text/html,application/xhtml+xml,*/*;q=0.8".into(),
                ),
                ("X-Fixture".into(), r"one\two,three".into()),
                ("X-Both".into(), r"one\,two".into()),
                ("X-Trailing".into(), "one\\".into()),
            ]
            .into(),
        };
        stream.request_headers().expect("valid headers");
        apply_stream_headers(&mpv, &stream).expect("apply actual helper");
        assert_eq!(
            mpv.get_property::<String>("user-agent")
                .expect("user agent"),
            "provided agent"
        );
        let node = mpv
            .get_property::<MpvNode>("http-header-fields")
            .expect("native header list");
        let fields: Vec<String> = node
            .array()
            .expect("header array")
            .map(|value| value.str().expect("header string").to_string())
            .collect();
        assert_eq!(
            fields,
            vec![
                "Accept: text/html,application/xhtml+xml,*/*;q=0.8",
                r"X-Both: one\,two",
                r"X-Fixture: one\two,three",
                "X-Trailing: one\\"
            ]
        );
        let empty = MusicStream {
            http_headers: Default::default(),
            ..stream
        };
        apply_stream_headers(&mpv, &empty).expect("clear source headers");
        assert_eq!(
            mpv.get_property::<MpvNode>("http-header-fields")
                .expect("empty native header list")
                .array()
                .expect("header array")
                .count(),
            0
        );
    }

    #[test]
    fn native_load_preserves_spaces_in_local_filenames() {
        force_c_numeric_locale();
        let directory =
            std::env::temp_dir().join(format!("harbor music load {}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("01 - First Light.wav");
        // A short original silent PCM fixture; no audio device or remote source needed.
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&160036u32.to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&8000u32.to_le_bytes());
        wav.extend_from_slice(&16000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&160000u32.to_le_bytes());
        wav.resize(160044, 0);
        std::fs::write(&path, wav).unwrap();
        let mpv = Mpv::with_initializer(|init| {
            for (name, value) in [
                ("keep-open", "yes"),
                ("ao", "null"),
                ("vo", "null"),
                ("pause", "yes"),
                ("idle", "yes"),
            ] {
                init.set_property(name, value)?;
            }
            Ok(())
        })
        .unwrap();
        crate::mpv::mpv_argv_command(&mpv, &["loadfile", path.to_str().unwrap(), "replace"])
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while mpv.get_property::<f64>("duration").unwrap_or(0.0) <= 0.0 && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(20));
        }
        let duration = mpv.get_property::<f64>("duration").unwrap_or(0.0);
        let quality = audio_quality(&mpv, Some(&path));
        assert_eq!(quality.codec.as_deref(), Some("pcm_s16le"));
        assert_eq!(quality.sample_rate_hz, Some(8000));
        assert_eq!(quality.bit_depth, Some(16));
        assert!(quality.bitrate_kbps.is_some());
        let streamed_quality = audio_quality(&mpv, None);
        assert_eq!(
            streamed_quality.bit_depth, None,
            "decoder packing is not source bit depth"
        );
        assert_eq!(
            std::mem::size_of::<NativeFlag>(),
            std::mem::size_of::<std::os::raw::c_int>()
        );
        for paused in [true, false, true, false] {
            mpv.set_property("pause", paused).unwrap();
            assert_eq!(
                mpv.get_property::<NativeFlag>("pause").unwrap().0 != 0,
                paused
            );
        }
        drop(mpv);
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&directory).unwrap();
        assert!(
            (duration - 10.0).abs() < 0.02,
            "fixture did not decode: {duration}"
        );
    }

    #[test]
    fn volume_is_bounded_for_native_mpv() {
        let settings = MusicAudioSettings::default();
        assert_eq!(settings.clamp_volume(-1.0), 0.0);
        assert_eq!(settings.clamp_volume(2.0), 1.0);
        assert_eq!(settings.clamp_volume(f64::NAN), 0.82);
    }

    #[test]
    fn scrobble_threshold_uses_half_or_four_minutes() {
        assert!(!should_scrobble(149.0, 300.0));
        assert!(should_scrobble(150.0, 300.0));
        assert!(!should_scrobble(239.0, 900.0));
        assert!(should_scrobble(240.0, 900.0));
    }

    #[test]
    fn listened_time_ignores_seek_jumps() {
        assert_eq!(listened_increment(Some(10.0), 10.5), 0.5);
        assert_eq!(listened_increment(Some(10.0), 120.0), 0.0);
        assert_eq!(listened_increment(Some(10.0), 9.0), 0.0);
    }
}
