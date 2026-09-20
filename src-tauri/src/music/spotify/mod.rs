mod api;
mod artist_catalog;
mod auth;
mod browse;
pub mod connector;
mod control;
mod keystore;
pub(super) mod library;
mod parse;
mod player;
mod session;
mod tokens;

use super::{MusicConnection, MusicConnectionField};
use librespot_core::authentication::Credentials;
use librespot_core::session::Session;
use parking_lot::RwLock;
use serde::Serialize;
use session::AccountTier;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;

const NOT_INITIALIZED: &str = "Spotify storage is not initialized";

struct SpotifyRuntime {
    session: Session,
    audio: player::SpotifyPlayer,
}

struct Account {
    session: Option<Session>,
    username: String,
    country: String,
    tier: AccountTier,
}

impl Account {
    fn empty() -> Self {
        Self {
            session: None,
            username: String::new(),
            country: String::new(),
            tier: AccountTier::Unknown,
        }
    }

    fn connected(&self) -> bool {
        self.session
            .as_ref()
            .is_some_and(|session| !session.is_invalid())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatus {
    pub connected: bool,
    pub username: Option<String>,
    pub country: Option<String>,
    pub premium: bool,
    pub account_type: Option<String>,
    pub error: Option<String>,
}

pub struct SpotifyState {
    runtime: Mutex<Option<SpotifyRuntime>>,
    account: RwLock<Account>,
    cache_dir: RwLock<Option<PathBuf>>,
    app: RwLock<Option<AppHandle>>,
    http: reqwest::Client,
    web_token: RwLock<Option<keystore::WebToken>>,
    last_error: RwLock<Option<String>>,
    paused: AtomicBool,
    paused_for_video: AtomicBool,
}

impl SpotifyState {
    pub fn new() -> Self {
        Self {
            runtime: Mutex::new(None),
            account: RwLock::new(Account::empty()),
            cache_dir: RwLock::new(None),
            app: RwLock::new(None),
            http: http_client(),
            web_token: RwLock::new(None),
            last_error: RwLock::new(None),
            paused: AtomicBool::new(true),
            paused_for_video: AtomicBool::new(false),
        }
    }

    pub fn initialize(self: &Arc<Self>, app: &AppHandle, cache_dir: PathBuf) {
        *self.cache_dir.write() = Some(cache_dir.clone());
        *self.app.write() = Some(app.clone());
        let cache = match session::make_cache(&cache_dir) {
            Ok(cache) => cache,
            Err(error) => {
                self.record_failure(error);
                return;
            }
        };
        let Some(credentials) = keystore::load(app, &cache_dir) else {
            return;
        };
        let state = self.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = state.connect_with(app, cache, credentials).await {
                state.record_failure(error);
            }
        });
    }

    pub async fn connect_interactive(&self, app: AppHandle) -> Result<SpotifyStatus, String> {
        *self.app.write() = Some(app.clone());
        let cache_dir = self.cache_path()?;
        let granted = match auth::authorize(&app).await {
            Ok(granted) => granted,
            Err(error) => {
                self.record_failure(error.clone());
                return Err(error);
            }
        };
        let cache = session::make_cache(&cache_dir)?;
        let credentials = Credentials::with_access_token(granted.access_token.clone());
        if let Err(error) = self.connect_with(app.clone(), cache, credentials).await {
            self.record_failure(error.clone());
            return Err(error);
        }
        self.adopt_web_token(&app, granted, None);
        self.status().await
    }

    async fn connect_with(
        &self,
        app: AppHandle,
        cache: librespot_core::cache::Cache,
        credentials: Credentials,
    ) -> Result<(), String> {
        let cache_dir = self.cache_path()?;
        let spotify_session = session::build(cache, keystore::device_id(&app));
        let mut tier = session::connect(&spotify_session, credentials).await?;
        keystore::capture(&app, &cache_dir);
        if tier == AccountTier::Unknown {
            tier = self.probe_tier(&spotify_session).await;
            if tier == AccountTier::Free {
                spotify_session.shutdown();
                return Err(session::FREE_ACCOUNT.to_string());
            }
        }
        let username = spotify_session.username();
        let country = spotify_session.country();
        let audio = player::start(app, spotify_session.clone())?;
        let mut slot = self.runtime.lock().await;
        if let Some(previous) = slot.take() {
            previous.audio.player.stop();
            previous.session.shutdown();
            std::thread::spawn(move || drop(previous));
        }
        *slot = Some(SpotifyRuntime {
            session: spotify_session.clone(),
            audio,
        });
        *self.account.write() = Account {
            session: Some(spotify_session),
            username,
            country,
            tier,
        };
        *self.last_error.write() = None;
        self.paused.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        let mut slot = self.runtime.lock().await;
        if let Some(runtime) = slot.take() {
            runtime.audio.player.stop();
            runtime.session.shutdown();
            std::thread::spawn(move || drop(runtime));
        }
        drop(slot);
        *self.account.write() = Account::empty();
        *self.web_token.write() = None;
        *self.last_error.write() = None;
        self.paused.store(true, Ordering::SeqCst);
        self.paused_for_video.store(false, Ordering::SeqCst);
        let cache_dir = self.cache_path()?;
        let app = self
            .app
            .read()
            .clone()
            .ok_or_else(|| NOT_INITIALIZED.to_string())?;
        session::clear_audio_cache(&cache_dir);
        keystore::forget(&app, &cache_dir)
    }

    pub async fn status(&self) -> Result<SpotifyStatus, String> {
        Ok(self.snapshot())
    }

    pub(super) fn connection(&self) -> MusicConnection {
        let status = self.snapshot();
        let state = if status.connected {
            "connected"
        } else if status.error.is_some() {
            "error"
        } else {
            "disconnected"
        };
        let mut connection = MusicConnection::new(
            "spotify",
            "Spotify",
            "streaming",
            state,
            &["search", "browse", "play"],
        );
        connection.account = status.username;
        connection.error = status.error;
        // Spotify only issues tokens to a registered app, and a new app may add at most a
        // handful of listeners. Harbor ships no client id: each listener brings their own.
        if status.connected {
            connection.detail = status.account_type;
        } else {
            // The row truncates this line, so it stays short. The full walkthrough rides
            // on the error from auth::client_id, which renders unclamped underneath.
            connection.detail = Some(auth::BRING_YOUR_OWN.to_string());
            connection = connection.needs(vec![MusicConnectionField::new(
                "clientId",
                "Spotify client id",
                "text",
                false,
            )
            .placeholder("Client id from your own Spotify app")]);
        }
        connection
    }

    pub(super) fn connected(&self) -> bool {
        self.account.read().connected()
    }

    fn snapshot(&self) -> SpotifyStatus {
        let account = self.account.read();
        if !account.connected() {
            return SpotifyStatus {
                connected: false,
                username: None,
                country: None,
                premium: false,
                account_type: None,
                error: self.last_error.read().clone(),
            };
        }
        SpotifyStatus {
            connected: true,
            username: text(&account.username),
            country: text(&account.country),
            premium: account.tier.premium(),
            account_type: account.tier.label().map(str::to_string),
            error: None,
        }
    }

    fn cache_path(&self) -> Result<PathBuf, String> {
        self.cache_dir
            .read()
            .clone()
            .ok_or_else(|| NOT_INITIALIZED.to_string())
    }

    fn record_failure(&self, error: String) {
        *self.last_error.write() = Some(error);
    }
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("Harbor/", env!("CARGO_PKG_VERSION"), " (music)"))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_disconnected_state_never_claims_premium() {
        let state = SpotifyState::new();
        let status = state.snapshot();
        assert!(!status.connected);
        assert!(!status.premium);
        assert!(status.account_type.is_none());
        assert!(!state.connected());
    }

    #[test]
    fn a_recorded_failure_becomes_the_connection_error() {
        let state = SpotifyState::new();
        state.record_failure(session::FREE_ACCOUNT.to_string());
        let connection = state.connection();
        assert_eq!(connection.id, "spotify");
        assert_eq!(connection.status, "error");
        assert_eq!(connection.capabilities, vec!["search", "browse", "play"]);
        assert_eq!(connection.error.as_deref(), Some(session::FREE_ACCOUNT));
        assert!(connection.account.is_none());
        assert_eq!(connection.detail.as_deref(), Some(auth::BRING_YOUR_OWN));
    }

    #[test]
    fn a_disconnected_spotify_asks_for_a_client_id_of_your_own() {
        let connection = SpotifyState::new().connection();
        let field = connection
            .needs
            .iter()
            .find(|field| field.key == "clientId")
            .expect("disconnected Spotify offers a client id field");
        assert!(!field.required, "connecting without one is a valid attempt");
        assert!(auth::setup_hint().contains("127.0.0.1:8898/login"));
    }

    #[test]
    fn a_recorded_failure_leaves_a_stored_sign_in_alone() {
        let directory = std::env::temp_dir().join(format!(
            "harbor-spotify-cache-policy-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create test cache");
        let marker = directory.join("credentials.json");
        std::fs::write(&marker, b"cached").expect("write cached sign in");
        let state = SpotifyState::new();
        *state.cache_dir.write() = Some(directory.clone());
        state.record_failure("network unavailable".to_string());
        assert!(marker.exists());
        assert_eq!(
            state.last_error.read().as_deref(),
            Some("network unavailable")
        );
        std::fs::remove_file(marker).expect("remove test sign in");
        std::fs::remove_dir(directory).expect("remove test cache");
    }

    #[test]
    fn blank_account_text_is_reported_as_absent() {
        assert_eq!(text("  "), None);
        assert_eq!(text(" josiah "), Some("josiah".to_string()));
    }
}
