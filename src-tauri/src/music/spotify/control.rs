use super::super::MusicTrack;
use super::{player, Account, SpotifyState};
use std::sync::atomic::Ordering;

const DEFAULT_VOLUME: f64 = 0.82;
const CONNECT_BEFORE_PLAY: &str = "Connect Spotify Premium before playing this source";

impl SpotifyState {
    pub async fn play(&self, track: MusicTrack, volume: f64) -> Result<(), String> {
        let slot = self.runtime.lock().await;
        let runtime = slot
            .as_ref()
            .filter(|runtime| !runtime.session.is_invalid())
            .ok_or_else(|| CONNECT_BEFORE_PLAY.to_string())?;
        runtime.audio.mixer.set_volume(volume_to_u16(volume));
        player::play(&runtime.audio, track)?;
        self.paused.store(false, Ordering::SeqCst);
        self.paused_for_video.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub async fn set_paused(&self, paused: bool) -> Result<(), String> {
        let slot = self.runtime.lock().await;
        if let Some(runtime) = slot.as_ref() {
            if paused {
                runtime.audio.player.pause();
            } else {
                runtime.audio.player.play();
            }
        }
        self.paused.store(paused, Ordering::SeqCst);
        self.paused_for_video.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub async fn pause_for_video(&self) -> Result<bool, String> {
        if self.paused.load(Ordering::SeqCst) {
            return Ok(false);
        }
        let slot = self.runtime.lock().await;
        let Some(runtime) = slot.as_ref() else {
            return Ok(false);
        };
        runtime.audio.player.pause();
        self.paused.store(true, Ordering::SeqCst);
        self.paused_for_video.store(true, Ordering::SeqCst);
        Ok(true)
    }

    pub async fn seek(&self, position: f64) -> Result<(), String> {
        if !position.is_finite() {
            return Err("Music seek position is invalid".to_string());
        }
        let slot = self.runtime.lock().await;
        if let Some(runtime) = slot.as_ref() {
            runtime
                .audio
                .player
                .seek((position.max(0.0) * 1000.0).min(u32::MAX as f64) as u32);
        }
        Ok(())
    }

    pub async fn set_volume(&self, volume: f64) -> Result<(), String> {
        let slot = self.runtime.lock().await;
        if let Some(runtime) = slot.as_ref() {
            runtime.audio.mixer.set_volume(volume_to_u16(volume));
        }
        Ok(())
    }

    pub async fn stop(&self, resume: bool) -> Result<(), String> {
        if resume {
            if !self.paused_for_video.swap(false, Ordering::SeqCst) {
                return Ok(());
            }
            let slot = self.runtime.lock().await;
            if let Some(runtime) = slot.as_ref() {
                runtime.audio.player.play();
                self.paused.store(false, Ordering::SeqCst);
            }
            return Ok(());
        }
        let slot = self.runtime.lock().await;
        if let Some(runtime) = slot.as_ref() {
            runtime.audio.player.stop();
            *runtime.audio.current.write() = None;
        }
        self.paused.store(true, Ordering::SeqCst);
        self.paused_for_video.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub fn shutdown(&self) {
        if let Ok(mut slot) = self.runtime.try_lock() {
            if let Some(runtime) = slot.take() {
                runtime.audio.player.stop();
                runtime.session.shutdown();
                std::thread::spawn(move || drop(runtime));
            }
        }
        *self.account.write() = Account::empty();
    }
}

fn volume_to_u16(volume: f64) -> u16 {
    let clamped = if volume.is_finite() {
        volume.clamp(0.0, 1.0)
    } else {
        DEFAULT_VOLUME
    };
    (clamped * u16::MAX as f64).round() as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spotify_volume_is_bounded() {
        assert_eq!(volume_to_u16(-1.0), 0);
        assert_eq!(volume_to_u16(1.0), u16::MAX);
        assert_eq!(volume_to_u16(f64::NAN), 53_739);
    }

    #[tokio::test]
    async fn playback_without_a_session_asks_for_a_premium_sign_in() {
        let state = SpotifyState::new();
        let error = state
            .play(
                MusicTrack {
                    explicit: None,
                    version: None,
                    media_kind: None,
                    id: "spotify:track:one".to_string(),
                    connector_id: Some("spotify".to_string()),
                    source_id: Some("spotify:track:one".to_string()),
                    playback_url: None,
                    title: "Hysteria".to_string(),
                    artist: "Muse".to_string(),
                    album: None,
                    artwork: String::new(),
                    duration_seconds: 227,
                    duration_label: "3:47".to_string(),
                },
                0.5,
            )
            .await
            .expect_err("no session");
        assert_eq!(error, CONNECT_BEFORE_PLAY);
        assert!(!state.pause_for_video().await.expect("pause"));
    }
}
