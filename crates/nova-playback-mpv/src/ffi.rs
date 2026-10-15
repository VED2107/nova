//! Minimal hand-written bindings to the libmpv client API (client.h, API 2.x).
//!
//! libmpv is loaded at runtime with `libloading` instead of being linked, so:
//! - no MSVC import library has to be generated from the MinGW build;
//! - a missing or incompatible DLL becomes a recoverable, user-facing error;
//! - the engine binary stays a separate, replaceable file (see ADR 0003).
#![allow(non_camel_case_types, dead_code)]

use std::ffi::{CStr, c_char, c_double, c_int, c_void};
use std::path::Path;

pub type mpv_handle = c_void;

pub const MPV_FORMAT_NONE: c_int = 0;
pub const MPV_FORMAT_STRING: c_int = 1;
pub const MPV_FORMAT_FLAG: c_int = 3;
pub const MPV_FORMAT_INT64: c_int = 4;
pub const MPV_FORMAT_DOUBLE: c_int = 5;
pub const MPV_FORMAT_NODE: c_int = 6;
pub const MPV_FORMAT_NODE_ARRAY: c_int = 7;
pub const MPV_FORMAT_NODE_MAP: c_int = 8;

pub const MPV_EVENT_NONE: c_int = 0;
pub const MPV_EVENT_SHUTDOWN: c_int = 1;
pub const MPV_EVENT_LOG_MESSAGE: c_int = 2;
pub const MPV_EVENT_START_FILE: c_int = 6;
pub const MPV_EVENT_END_FILE: c_int = 7;
pub const MPV_EVENT_FILE_LOADED: c_int = 8;
pub const MPV_EVENT_IDLE: c_int = 11;
pub const MPV_EVENT_VIDEO_RECONFIG: c_int = 17;
pub const MPV_EVENT_SEEK: c_int = 20;
pub const MPV_EVENT_PLAYBACK_RESTART: c_int = 21;
pub const MPV_EVENT_PROPERTY_CHANGE: c_int = 22;
pub const MPV_EVENT_QUEUE_OVERFLOW: c_int = 24;

pub const MPV_END_FILE_REASON_EOF: c_int = 0;
pub const MPV_END_FILE_REASON_STOP: c_int = 2;
pub const MPV_END_FILE_REASON_QUIT: c_int = 3;
pub const MPV_END_FILE_REASON_ERROR: c_int = 4;
pub const MPV_END_FILE_REASON_REDIRECT: c_int = 5;

#[repr(C)]
pub struct mpv_event {
    pub event_id: c_int,
    pub error: c_int,
    pub reply_userdata: u64,
    pub data: *mut c_void,
}

#[repr(C)]
pub struct mpv_event_property {
    pub name: *const c_char,
    pub format: c_int,
    pub data: *mut c_void,
}

#[repr(C)]
pub struct mpv_event_log_message {
    pub prefix: *const c_char,
    pub level: *const c_char,
    pub text: *const c_char,
    pub log_level: c_int,
}

#[repr(C)]
pub struct mpv_event_start_file {
    pub playlist_entry_id: i64,
}

#[repr(C)]
pub struct mpv_event_end_file {
    pub reason: c_int,
    pub error: c_int,
    pub playlist_entry_id: i64,
    pub playlist_insert_id: i64,
    pub playlist_insert_num_entries: c_int,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub union mpv_node_u {
    pub string: *mut c_char,
    pub flag: c_int,
    pub int64: i64,
    pub double_: c_double,
    pub list: *mut mpv_node_list,
    pub ba: *mut c_void,
}

#[repr(C)]
pub struct mpv_node {
    pub u: mpv_node_u,
    pub format: c_int,
}

#[repr(C)]
pub struct mpv_node_list {
    pub num: c_int,
    pub values: *mut mpv_node,
    pub keys: *mut *mut c_char,
}

type FnCreate = unsafe extern "C" fn() -> *mut mpv_handle;
type FnInitialize = unsafe extern "C" fn(*mut mpv_handle) -> c_int;
type FnTerminateDestroy = unsafe extern "C" fn(*mut mpv_handle);
type FnClientApiVersion = unsafe extern "C" fn() -> std::ffi::c_ulong;
type FnErrorString = unsafe extern "C" fn(c_int) -> *const c_char;
type FnFree = unsafe extern "C" fn(*mut c_void);
type FnSetOptionString =
    unsafe extern "C" fn(*mut mpv_handle, *const c_char, *const c_char) -> c_int;
type FnCommand = unsafe extern "C" fn(*mut mpv_handle, *mut *const c_char) -> c_int;
type FnCommandRet =
    unsafe extern "C" fn(*mut mpv_handle, *mut *const c_char, *mut mpv_node) -> c_int;
type FnSetProperty =
    unsafe extern "C" fn(*mut mpv_handle, *const c_char, c_int, *mut c_void) -> c_int;
type FnGetProperty =
    unsafe extern "C" fn(*mut mpv_handle, *const c_char, c_int, *mut c_void) -> c_int;
type FnGetPropertyString = unsafe extern "C" fn(*mut mpv_handle, *const c_char) -> *mut c_char;
type FnObserveProperty = unsafe extern "C" fn(*mut mpv_handle, u64, *const c_char, c_int) -> c_int;
type FnWaitEvent = unsafe extern "C" fn(*mut mpv_handle, c_double) -> *mut mpv_event;
type FnWakeup = unsafe extern "C" fn(*mut mpv_handle);
type FnRequestLogMessages = unsafe extern "C" fn(*mut mpv_handle, *const c_char) -> c_int;
type FnFreeNodeContents = unsafe extern "C" fn(*mut mpv_node);

/// Resolved libmpv entry points. The `Library` is kept alive alongside them.
pub struct MpvApi {
    _lib: libloading::Library,
    pub create: FnCreate,
    pub initialize: FnInitialize,
    pub terminate_destroy: FnTerminateDestroy,
    pub client_api_version: FnClientApiVersion,
    pub error_string: FnErrorString,
    pub free: FnFree,
    pub set_option_string: FnSetOptionString,
    pub command: FnCommand,
    pub command_ret: FnCommandRet,
    pub set_property: FnSetProperty,
    pub get_property: FnGetProperty,
    pub get_property_string: FnGetPropertyString,
    pub observe_property: FnObserveProperty,
    pub wait_event: FnWaitEvent,
    pub wakeup: FnWakeup,
    pub request_log_messages: FnRequestLogMessages,
    pub free_node_contents: FnFreeNodeContents,
}

/// Lowest client API major version these bindings were written against.
pub const REQUIRED_API_MAJOR: u64 = 2;

impl MpvApi {
    /// Loads libmpv from `path` and resolves all required symbols.
    ///
    /// # Safety
    /// Loading a dynamic library runs its initialization routines. The caller
    /// must ensure `path` points to a trusted libmpv build.
    pub unsafe fn load(path: &Path) -> Result<Self, String> {
        let lib = unsafe { libloading::Library::new(path) }
            .map_err(|e| format!("could not load {}: {e}", path.display()))?;
        macro_rules! sym {
            ($name:literal) => {
                *unsafe { lib.get(concat!($name, "\0").as_bytes()) }
                    .map_err(|e| format!("libmpv is missing symbol {}: {e}", $name))?
            };
        }
        let api = Self {
            create: sym!("mpv_create"),
            initialize: sym!("mpv_initialize"),
            terminate_destroy: sym!("mpv_terminate_destroy"),
            client_api_version: sym!("mpv_client_api_version"),
            error_string: sym!("mpv_error_string"),
            free: sym!("mpv_free"),
            set_option_string: sym!("mpv_set_option_string"),
            command: sym!("mpv_command"),
            command_ret: sym!("mpv_command_ret"),
            set_property: sym!("mpv_set_property"),
            get_property: sym!("mpv_get_property"),
            get_property_string: sym!("mpv_get_property_string"),
            observe_property: sym!("mpv_observe_property"),
            wait_event: sym!("mpv_wait_event"),
            wakeup: sym!("mpv_wakeup"),
            request_log_messages: sym!("mpv_request_log_messages"),
            free_node_contents: sym!("mpv_free_node_contents"),
            _lib: lib,
        };
        let version = unsafe { (api.client_api_version)() } as u64;
        let major = version >> 16;
        if major != REQUIRED_API_MAJOR {
            return Err(format!(
                "unsupported libmpv client API {}.{} (need {}.x)",
                major,
                version & 0xffff,
                REQUIRED_API_MAJOR
            ));
        }
        Ok(api)
    }

    pub fn api_version(&self) -> (u64, u64) {
        let v = unsafe { (self.client_api_version)() } as u64;
        (v >> 16, v & 0xffff)
    }

    pub fn error_message(&self, code: c_int) -> String {
        let ptr = unsafe { (self.error_string)(code) };
        if ptr.is_null() {
            return format!("mpv error {code}");
        }
        unsafe { CStr::from_ptr(ptr) }
            .to_string_lossy()
            .into_owned()
    }
}

/// Reads a C string pointer owned by libmpv. Returns `None` for null.
///
/// # Safety
/// `ptr` must be null or a valid NUL-terminated string.
pub unsafe fn opt_str(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        None
    } else {
        Some(
            unsafe { CStr::from_ptr(ptr) }
                .to_string_lossy()
                .into_owned(),
        )
    }
}
