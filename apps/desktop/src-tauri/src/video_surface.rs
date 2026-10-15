//! Native video surface placement.
//!
//! libmpv is given the main window's HWND (`wid`) and creates its own child
//! window inside it. The WebView2 child hosts the UI and is transparent, so the
//! engine's child must sit *below* the WebView in z-order. See ADR 0002.

use nova_playback_api::{PlaybackError, PlaybackErrorKind};

#[cfg(windows)]
pub fn native_handle(window: &tauri::WebviewWindow) -> Result<i64, PlaybackError> {
    let hwnd = window
        .hwnd()
        .map_err(|e| PlaybackError::new(PlaybackErrorKind::EngineUnavailable, e.to_string()))?;
    Ok(hwnd.0 as isize as i64)
}

#[cfg(not(windows))]
pub fn native_handle(_window: &tauri::WebviewWindow) -> Result<i64, PlaybackError> {
    Err(PlaybackError::new(
        PlaybackErrorKind::EngineUnavailable,
        "embedded video is only implemented on Windows in M0",
    ))
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub type Hwnd = *mut c_void;
    pub const HWND_BOTTOM: Hwnd = 1 as Hwnd;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOACTIVATE: u32 = 0x0010;

    #[link(name = "user32")]
    unsafe extern "system" {
        pub fn EnumChildWindows(
            parent: Hwnd,
            func: unsafe extern "system" fn(Hwnd, isize) -> i32,
            lparam: isize,
        ) -> i32;
        pub fn GetClassNameW(hwnd: Hwnd, buf: *mut u16, max: i32) -> i32;
        pub fn GetParent(hwnd: Hwnd) -> Hwnd;
        pub fn SetWindowPos(
            hwnd: Hwnd,
            after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    pub fn class_name(hwnd: Hwnd) -> String {
        let mut buf = [0u16; 128];
        let n = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    /// Direct children of `parent` as (hwnd, class name).
    pub fn direct_children(parent: Hwnd) -> Vec<(Hwnd, String)> {
        struct Ctx {
            parent: Hwnd,
            out: Vec<(Hwnd, String)>,
        }
        unsafe extern "system" fn cb(hwnd: Hwnd, lparam: isize) -> i32 {
            let ctx = unsafe { &mut *(lparam as *mut Ctx) };
            if unsafe { GetParent(hwnd) } == ctx.parent {
                ctx.out.push((hwnd, class_name(hwnd)));
            }
            1
        }
        let mut ctx = Ctx {
            parent,
            out: Vec::new(),
        };
        unsafe { EnumChildWindows(parent, cb, &mut ctx as *mut Ctx as isize) };
        ctx.out
    }
}

/// libmpv creates its window asynchronously on its VO thread, so poll briefly.
#[cfg(windows)]
pub fn place_engine_surface_below_webview(parent: i64) {
    std::thread::spawn(move || {
        let parent = parent as isize as win::Hwnd;
        for _ in 0..100 {
            let children = win::direct_children(parent);
            if let Some((hwnd, _)) = children.iter().find(|(_, c)| c == "mpv") {
                unsafe {
                    win::SetWindowPos(
                        *hwnd,
                        win::HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        win::SWP_NOMOVE | win::SWP_NOSIZE | win::SWP_NOACTIVATE,
                    )
                };
                let order: Vec<_> = win::direct_children(parent)
                    .into_iter()
                    .map(|(_, c)| c)
                    .collect();
                log::info!(
                    "video surface placed below webview; child z-order (top first): {order:?}"
                );
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        log::warn!("libmpv video window not found; UI may be hidden behind video");
    });
}

#[cfg(not(windows))]
pub fn place_engine_surface_below_webview(_parent: i64) {}
