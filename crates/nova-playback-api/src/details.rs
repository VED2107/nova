//! Backend-neutral stream details for diagnostics (DIAG-01).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDetails {
    /// Short codec id, e.g. `prores`, `hevc`.
    pub codec: Option<String>,
    /// Human description incl. profile when known, e.g. "Apple ProRes 422 HQ".
    pub codec_description: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Decoder output pixel format, e.g. `yuv422p10`.
    pub pixel_format: Option<String>,
    pub bit_depth: Option<u32>,
    /// `4:2:0`, `4:2:2`, `4:4:4`.
    pub chroma: Option<String>,
    pub has_alpha: bool,
    pub frame_rate: Option<f64>,
    pub color_matrix: Option<String>,
    pub primaries: Option<String>,
    /// Transfer function, e.g. `pq` (HDR10), `hlg`, `bt.1886`.
    pub transfer: Option<String>,
    /// `HDR10`, `HLG` or `None` for SDR.
    pub hdr: Option<String>,
    /// Active hardware decoder, `None` = software.
    pub hwdec: Option<String>,
    pub decoder: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDetails {
    pub codec: Option<String>,
    pub codec_description: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub channel_layout: Option<String>,
    pub sample_format: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaDetails {
    /// Container as detected from file contents (not the extension).
    pub container: Option<String>,
    pub file_size_bytes: Option<u64>,
    pub duration_ms: Option<u64>,
    pub video: Option<VideoDetails>,
    pub audio: Option<AudioDetails>,
}

/// Derives (bit depth, chroma, alpha) from an FFmpeg/mpv pixel-format name.
pub fn pixel_format_traits(fmt: &str) -> (Option<u32>, Option<String>, bool) {
    let f = fmt.to_ascii_lowercase();
    let alpha = f.starts_with("yuva")
        || f.contains("argb")
        || f.contains("rgba")
        || f.contains("bgra")
        || f.contains("abgr")
        || f.starts_with("gbrap")
        || f.starts_with("ya");
    let depth = if f.contains("f32") || f.contains("pf32") {
        Some(32)
    } else if f.contains("f16") {
        Some(16)
    } else if let Some(i) = f.rfind('p').filter(|i| {
        f[i + 1..]
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit())
    }) {
        f[i + 1..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .ok()
    } else if f == "p010" || f.starts_with("p010") || f == "x2rgb10" || f.starts_with("y210") {
        Some(10)
    } else if f.starts_with("p016")
        || f.starts_with("rgb48")
        || f.starts_with("rgba64")
        || f.starts_with("bgr48")
    {
        Some(16)
    } else if f.starts_with("yuv")
        || f.starts_with("yuvj")
        || f.starts_with("nv12")
        || f.contains("rgb")
        || f.contains("bgr")
        || f.starts_with("gray")
        || f == "uyvy422"
        || f == "yuyv422"
    {
        Some(8)
    } else {
        None
    };
    let chroma = if f.contains("420")
        || f.starts_with("nv12")
        || f.starts_with("p010")
        || f.starts_with("p016")
    {
        Some("4:2:0")
    } else if f.contains("422")
        || f.starts_with("y210")
        || f.starts_with("uyvy")
        || f.starts_with("yuyv")
    {
        Some("4:2:2")
    } else if f.contains("444") || f.contains("rgb") || f.contains("bgr") || f.starts_with("gbr") {
        Some("4:4:4")
    } else if f.contains("411") {
        Some("4:1:1")
    } else {
        None
    };
    (depth, chroma.map(str::to_owned), alpha)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_formats() {
        let t = |f| pixel_format_traits(f);
        assert_eq!(t("yuv420p"), (Some(8), Some("4:2:0".into()), false));
        assert_eq!(t("yuv422p10"), (Some(10), Some("4:2:2".into()), false));
        assert_eq!(t("yuv422p10le"), (Some(10), Some("4:2:2".into()), false));
        assert_eq!(t("yuva444p10"), (Some(10), Some("4:4:4".into()), true));
        assert_eq!(t("yuv420p12"), (Some(12), Some("4:2:0".into()), false));
        assert_eq!(t("p010"), (Some(10), Some("4:2:0".into()), false));
        assert_eq!(t("nv12"), (Some(8), Some("4:2:0".into()), false));
        assert_eq!(t("gbrp10"), (Some(10), Some("4:4:4".into()), false));
        assert_eq!(t("gbrpf32"), (Some(32), Some("4:4:4".into()), false));
        assert_eq!(t("argb"), (Some(8), Some("4:4:4".into()), true));
        assert_eq!(t("yuvj422p"), (Some(8), Some("4:2:2".into()), false));
        assert_eq!(t("yuva420p"), (Some(8), Some("4:2:0".into()), true));
        assert_eq!(t("rgb48"), (Some(16), Some("4:4:4".into()), false));
    }
}
