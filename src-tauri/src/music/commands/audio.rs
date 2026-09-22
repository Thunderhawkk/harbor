use super::super::{audio::MusicAudioSettings, MusicState};

#[tauri::command]
pub async fn music_audio_devices(
    state: tauri::State<'_, MusicState>,
) -> Result<Vec<crate::mpv::AudioDevice>, String> {
    state.engine.audio_devices().await
}

#[tauri::command]
pub fn music_audio_settings_get(
    state: tauri::State<'_, MusicState>,
) -> Result<MusicAudioSettings, String> {
    state.engine.audio_settings()
}

#[tauri::command]
pub async fn music_audio_settings_set(
    state: tauri::State<'_, MusicState>,
    settings: MusicAudioSettings,
) -> Result<MusicAudioSettings, String> {
    state.engine.set_audio_settings(settings).await
}

#[tauri::command]
pub async fn music_audio_meter_set_enabled(
    state: tauri::State<'_, MusicState>,
    enabled: bool,
) -> Result<(), String> {
    state.engine.set_meter_enabled(enabled).await
}

#[tauri::command]
pub async fn music_audio_meter_snapshot(
    state: tauri::State<'_, MusicState>,
) -> Result<Option<super::super::engine::MusicMeterSnapshot>, String> {
    Ok(state.engine.meter_snapshot().await)
}
