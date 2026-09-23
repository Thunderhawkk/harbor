use super::super::{
    library, m3u, MusicState, MusicTrack, ACTIVE_NONE, ACTIVE_SPOTIFY, ACTIVE_STREAM,
};
use super::search::resolve_track;

#[tauri::command]
pub async fn music_play_track(
    app: tauri::AppHandle,
    state: tauri::State<'_, MusicState>,
    track: MusicTrack,
    volume: Option<f64>,
) -> Result<(), String> {
    let request = state.begin_play_request();
    let volume = volume.unwrap_or(0.82);
    if track.connector_id.as_deref() == Some("spotify") {
        let _commit = state.play_commit.lock().await;
        if !state.is_current_play_request(request) {
            return Ok(());
        }
        state.engine.stop(false).await?;
        if !state.is_current_play_request(request) {
            return Ok(());
        }
        state.spotify.play(track, volume).await?;
        state.set_active_engine(ACTIVE_SPOTIFY);
        return Ok(());
    }
    let stream = resolve_track(&app, state.inner(), &track).await;
    if !state.is_current_play_request(request) {
        return Ok(());
    }
    let stream = stream?;
    let _commit = state.play_commit.lock().await;
    if !state.is_current_play_request(request) {
        return Ok(());
    }
    state.spotify.stop(false).await?;
    if !state.is_current_play_request(request) {
        return Ok(());
    }
    state.engine.play(app, stream, track, volume).await?;
    state.set_active_engine(ACTIVE_STREAM);
    Ok(())
}

#[tauri::command]
pub async fn music_engine_pause(
    state: tauri::State<'_, MusicState>,
    paused: bool,
) -> Result<(), String> {
    match state.active_engine() {
        ACTIVE_SPOTIFY => state.spotify.set_paused(paused).await,
        ACTIVE_STREAM => state.engine.set_paused(paused).await,
        _ => Ok(()),
    }
}

#[tauri::command]
pub async fn music_engine_seek(
    state: tauri::State<'_, MusicState>,
    position: f64,
) -> Result<(), String> {
    match state.active_engine() {
        ACTIVE_SPOTIFY => state.spotify.seek(position).await,
        ACTIVE_STREAM => state.engine.seek(position).await,
        _ => Ok(()),
    }
}

#[tauri::command]
pub async fn music_engine_set_volume(
    state: tauri::State<'_, MusicState>,
    volume: f64,
) -> Result<(), String> {
    match state.active_engine() {
        ACTIVE_SPOTIFY => state.spotify.set_volume(volume).await,
        ACTIVE_STREAM => state.engine.set_volume(volume).await,
        _ => Ok(()),
    }
}

#[tauri::command]
pub async fn music_engine_stop(
    state: tauri::State<'_, MusicState>,
    unpause: Option<bool>,
) -> Result<(), String> {
    let unpause = unpause.unwrap_or(false);
    let request = (!unpause).then(|| state.begin_play_request());
    let _commit = state.play_commit.lock().await;
    if request.is_some_and(|request| !state.is_current_play_request(request)) {
        return Ok(());
    }
    let result = match state.active_engine() {
        ACTIVE_SPOTIFY => state.spotify.stop(unpause).await,
        ACTIVE_STREAM => state.engine.stop(unpause).await,
        _ => Ok(()),
    };
    if !unpause && result.is_ok() {
        state.set_active_engine(ACTIVE_NONE);
    }
    result
}

#[tauri::command]
pub fn music_import_m3u(
    state: tauri::State<'_, MusicState>,
    path: String,
) -> Result<Vec<MusicTrack>, String> {
    m3u::import(&state.db, &path)
}

#[tauri::command]
pub async fn music_export_m3u(
    app: tauri::AppHandle,
    state: tauri::State<'_, MusicState>,
    playlist_id: String,
    path: String,
) -> Result<(), String> {
    let tracks = library::tracks_for_playlist(&state.db, &playlist_id)?;
    let mut resolved = Vec::with_capacity(tracks.len());
    for track in tracks {
        let stream = resolve_track(&app, state.inner(), &track).await?;
        resolved.push((track, stream.url));
    }
    m3u::export(&path, &resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_slow_old_resolver_cannot_replace_the_newest_request() {
        let state = MusicState::new();
        let old = state.begin_play_request();
        let newest = state.begin_play_request();
        {
            let _commit = state.play_commit.lock().await;
            assert!(state.is_current_play_request(newest));
        }
        let _old_commit = state.play_commit.lock().await;
        assert!(!state.is_current_play_request(old));
    }

    #[test]
    fn stop_invalidates_a_pending_resolution() {
        let state = MusicState::new();
        let pending = state.begin_play_request();
        let stop = state.begin_play_request();
        assert!(!state.is_current_play_request(pending));
        assert!(state.is_current_play_request(stop));
    }
}
