//! Monitor enumeration and targeting for per-mode display selection.
//!
//! Windows-only in practice: the settings that drive it are gated to Windows in
//! the UI, and `mpv`'s separate-window `screen` option (the thing the resolved
//! ordinal feeds) only exists on the win32 VO. On other platforms the commands
//! return empty / are inert so the frontend simply hides the pickers.
//!
//! Identity note: there is no perfectly stable monitor key on Windows. We store a
//! full snapshot and resolve with a fallback chain (PnP DeviceID -> GDI device
//! name -> position+size -> Automatic), which is the honest ceiling when two
//! identical monitors report no EDID serial.

use serde::{Deserialize, Serialize};

/// A display as presented to the frontend picker and stored in settings.
///
/// `id` is the stable-ish persistence key (`device_id` when available, otherwise
/// the GDI device name). The remaining fields exist so the label can show a real
/// name + resolution, and so `resolve_monitor` can fall back on geometry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    /// GDI device name, e.g. `\\.\DISPLAY1`. Matches `MONITORINFOEXW.szDevice`,
    /// Tauri's `Monitor::name()`, and the string the HDR code keys on.
    pub device_name: String,
    /// Plug-and-play instance id from `EnumDisplayDevicesW`, e.g.
    /// `MONITOR\DEL42A3\{...}`. Empty when the driver reports nothing.
    pub device_id: String,
    /// Human-friendly model string, e.g. `DELL U2723QE`.
    pub name: String,
    pub is_primary: bool,
    /// Physical pixels, top-left of the virtual desktop.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// What `resolve_monitor` returns: everything a caller needs to place a window.
#[cfg(windows)]
#[derive(Debug, Clone, Copy)]
pub struct ResolvedMonitor {
    /// 0-based `EnumDisplayMonitors` ordinal, matching mpv's win32 `screen`.
    pub screen_index: i32,
    /// Monitor handle, for the DisplayConfig/HDR calls.
    pub hmon: windows::Win32::Graphics::Gdi::HMONITOR,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// The platform identity string stored as `MonitorInfo.id`.
fn monitor_id(device_id: &str, device_name: &str) -> String {
    if device_id.is_empty() {
        device_name.to_string()
    } else {
        device_id.to_string()
    }
}

#[cfg(windows)]
mod imp {
    use super::{monitor_id, MonitorInfo, ResolvedMonitor};
    use windows::core::{BOOL, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayDevicesW, EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow,
        DISPLAY_DEVICEW, DISPLAY_DEVICE_ATTACHED_TO_DESKTOP, HDC, HMONITOR, MONITORINFOEXW,
        MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    fn wide_to_string(raw: &[u16]) -> String {
        String::from_utf16_lossy(
            &raw.iter()
                .take_while(|&&c| c != 0)
                .copied()
                .collect::<Vec<u16>>(),
        )
    }

    /// Friendly model string and PnP id for the display behind a GDI device name
    /// (e.g. `\\.\DISPLAY1`). The monitor device is `EnumDisplayDevicesW`'s second
    /// entry for that adapter; the first is the adapter itself.
    fn friendly_name_for(device_name: &str) -> (String, String) {
        let dev_name: Vec<u16> = device_name.encode_utf16().chain(std::iter::once(0)).collect();
        // EnumDisplayDevicesW with a non-null lpDevice enumerates the monitor(s)
        // attached to that adapter, not the adapter itself.
        for index in 0..4u32 {
            let mut dd = DISPLAY_DEVICEW::default();
            dd.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
            let ok = unsafe {
                EnumDisplayDevicesW(PCWSTR(dev_name.as_ptr()), index, &mut dd, 0)
            };
            if !ok.as_bool() {
                break;
            }
            if dd.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
                != DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
            {
                continue;
            }
            let name = wide_to_string(&dd.DeviceString);
            let id = wide_to_string(&dd.DeviceID);
            return (name, id);
        }
        (String::new(), String::new())
    }

    fn scale_factor_for(hmon: HMONITOR) -> f64 {
        let mut dpi_x = 0u32;
        let mut dpi_y = 0u32;
        if unsafe { GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) }.is_ok() {
            if dpi_x > 0 {
                return dpi_x as f64 / 96.0;
            }
        }
        1.0
    }

    struct CollectState {
        out: Vec<MonitorInfo>,
        index: i32,
    }

    unsafe extern "system" fn collect_proc(
        hmon: HMONITOR,
        _hdc: HDC,
        _rc: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let state = &mut *(lparam.0 as *mut CollectState);
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(hmon, &mut mi.monitorInfo).as_bool() {
            let device_name = wide_to_string(&mi.szDevice);
            let (name, device_id) = friendly_name_for(&device_name);
            let r = mi.monitorInfo.rcMonitor;
            state.out.push(MonitorInfo {
                id: monitor_id(&device_id, &device_name),
                device_name,
                device_id,
                name,
                is_primary: mi.monitorInfo.dwFlags & 1 != 0,
                x: r.left,
                y: r.top,
                width: (r.right - r.left).max(0) as u32,
                height: (r.bottom - r.top).max(0) as u32,
                scale_factor: scale_factor_for(hmon),
            });
        }
        state.index += 1;
        BOOL(1)
    }

    /// Enumerate every display in `EnumDisplayMonitors` order (the same order
    /// mpv's win32 backend counts for the `screen` option).
    pub fn list() -> Vec<MonitorInfo> {
        let mut state = CollectState {
            out: Vec::new(),
            index: 0,
        };
        let state_ptr = &mut state as *mut CollectState;
        let _ = unsafe {
            EnumDisplayMonitors(None, None, Some(collect_proc), LPARAM(state_ptr as isize))
        };
        state.out
    }

    /// Resolve a stored snapshot to a live monitor, using
    /// DeviceID -> GDI device name -> position+size, else None (caller falls
    /// back to Automatic).
    pub fn resolve(saved: &MonitorInfo) -> Option<ResolvedMonitor> {
        let current = list();
        let by_device_id: Vec<&MonitorInfo> = current
            .iter()
            .filter(|m| !saved.device_id.is_empty() && m.device_id == saved.device_id)
            .collect();
        let by_device_name: Vec<&MonitorInfo> = current
            .iter()
            .filter(|m| !saved.device_name.is_empty() && m.device_name == saved.device_name)
            .collect();

        let chosen = if by_device_id.len() == 1 {
            Some(by_device_id[0])
        } else if by_device_id.len() > 1 {
            // Identical models share a PnP id; the arrangement is what tells them
            // apart, then the primary, then enumeration order.
            by_device_id
                .iter()
                .copied()
                .find(|m| m.x == saved.x && m.y == saved.y && m.width == saved.width)
                .or_else(|| by_device_id.iter().copied().find(|m| m.is_primary))
                .or_else(|| by_device_id.first().copied())
        } else if by_device_name.len() == 1 {
            Some(by_device_name[0])
        } else {
            current
                .iter()
                .find(|m| m.x == saved.x && m.y == saved.y && m.width == saved.width && m.height == saved.height)
        }?;

        resolve_by_device_name(&chosen.device_name)
    }

    /// Resolve by GDI device name directly (used for the "main window's monitor"
    /// fallback path too).
    pub fn resolve_by_device_name(device_name: &str) -> Option<ResolvedMonitor> {
        // Find the HMONITOR whose szDevice matches, via a quick scan.
        struct NameState<'a> {
            device_name: &'a str,
            index: i32,
            found: Option<ResolvedMonitor>,
        }
        unsafe extern "system" fn name_proc(
            hmon: HMONITOR,
            _hdc: HDC,
            _rc: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let state = &mut *(lparam.0 as *mut NameState);
            let mut mi = MONITORINFOEXW::default();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmon, &mut mi.monitorInfo).as_bool()
                && wide_to_string(&mi.szDevice) == state.device_name
            {
                let r = mi.monitorInfo.rcMonitor;
                state.found = Some(ResolvedMonitor {
                    screen_index: state.index,
                    hmon,
                    x: r.left,
                    y: r.top,
                    width: (r.right - r.left).max(0) as u32,
                    height: (r.bottom - r.top).max(0) as u32,
                });
                return BOOL(0);
            }
            state.index += 1;
            BOOL(1)
        }
        let mut state = NameState {
            device_name,
            index: 0,
            found: None,
        };
        let _ = unsafe {
            EnumDisplayMonitors(
                None,
                None,
                Some(name_proc),
                LPARAM(&mut state as *mut NameState as isize),
            )
        };
        state.found
    }

    /// Ordinal + geometry of the monitor a window currently sits on.
    pub fn resolve_for_hwnd(hwnd_raw: isize) -> Option<ResolvedMonitor> {
        let hwnd = HWND(hwnd_raw as *mut _);
        let hmon = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        if hmon.is_invalid() {
            return None;
        }
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        let device_name = if unsafe { GetMonitorInfoW(hmon, &mut mi.monitorInfo) }.as_bool() {
            wide_to_string(&mi.szDevice)
        } else {
            String::new()
        };
        if device_name.is_empty() {
            return None;
        }
        resolve_by_device_name(&device_name)
    }
}

#[cfg(windows)]
pub use imp::{list, resolve, resolve_for_hwnd};
#[cfg(not(windows))]
pub fn list() -> Vec<MonitorInfo> {
    Vec::new()
}

/// The `list_monitors` command payload.
#[tauri::command]
pub fn list_monitors() -> Vec<MonitorInfo> {
    list()
}

/// Where a window should open given an explicit choice: the resolved monitor when
/// the user picked one and it is still connected, else `None` meaning "leave it
/// where the OS put it" (Automatic / follow Harbor).
#[cfg(windows)]
pub fn resolve_or_default(saved: Option<&MonitorInfo>) -> Option<ResolvedMonitor> {
    if let Some(s) = saved {
        if let Some(m) = resolve(s) {
            return Some(m);
        }
    }
    None
}

/// Move the main window onto the chosen monitor and size it to fill that monitor,
/// so a following fullscreen/framing lands on the right screen.
///
/// Windows-only; a no-op elsewhere. Idempotent when the monitor is gone (the
/// event is simply not applied). Deliberately does *not* touch fullscreen state:
/// Big Picture drives that itself right after.
pub fn move_window_to_monitor(
    window: &tauri::WebviewWindow,
    resolved: &ResolvedMonitorTarget,
) -> Result<(), String> {
    // Unmaximize first: SetWindowPos position is ignored while maximized, and the
    // window-state plugin restores MAXIMIZED at launch.
    let _ = window.unmaximize();
    let _ = window.set_fullscreen(false);
    window
        .set_position(tauri::PhysicalPosition::new(resolved.x, resolved.y))
        .map_err(|e| format!("set_position: {e}"))?;
    window
        .set_size(tauri::PhysicalSize::new(resolved.width, resolved.height))
        .map_err(|e| format!("set_size: {e}"))?;
    Ok(())
}

/// Geometry a move needs, kept platform-neutral so the command compiles
/// everywhere.
#[derive(Debug, Clone, Copy)]
pub struct ResolvedMonitorTarget {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl From<ResolvedMonitor> for ResolvedMonitorTarget {
    fn from(r: ResolvedMonitor) -> Self {
        Self {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        }
    }
}

/// Move the main window onto the monitor described by a stored snapshot.
/// Returns `true` when it moved; `false` when the monitor is gone (caller keeps
/// current placement).
#[tauri::command]
pub async fn move_main_to_monitor(
    app: tauri::AppHandle,
    monitor: MonitorInfo,
) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return Err("main window missing".into());
        };
        let Some(resolved) = resolve(&monitor) else {
            return Ok(false);
        };
        move_window_to_monitor(&window, &resolved.into())?;
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = monitor;
        Ok(false)
    }
}
