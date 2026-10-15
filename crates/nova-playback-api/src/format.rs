//! Content-first file classification, run before handing a file to the engine.
//!
//! Rules:
//! 1. If the first bytes match a known media container signature, the file is
//!    treated as media no matter what its extension says.
//! 2. Otherwise, editing-project files (Premiere, Resolve, Final Cut, …) are
//!    recognized by content where a cheap check exists, else by extension, and
//!    are never sent to the engine.
//! 3. Camera RAW formats are recognized by extension and *still tried* by the
//!    engine (FFmpeg can demux some, e.g. early RED files). If the engine cannot
//!    decode them, the failure is reported as needing an external decoder.

use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditingApp {
    PremierePro,
    AfterEffects,
    DaVinciResolve,
    FinalCutPro,
    Vegas,
    Kdenlive,
    Shotcut,
    OpenTimelineIo,
    Avid,
    EditDecisionList,
}

impl EditingApp {
    pub fn name(self) -> &'static str {
        match self {
            Self::PremierePro => "Adobe Premiere Pro",
            Self::AfterEffects => "Adobe After Effects",
            Self::DaVinciResolve => "DaVinci Resolve",
            Self::FinalCutPro => "Final Cut Pro",
            Self::Vegas => "VEGAS Pro",
            Self::Kdenlive => "Kdenlive",
            Self::Shotcut => "Shotcut",
            Self::OpenTimelineIo => "an OpenTimelineIO-compatible editor",
            Self::Avid => "Avid Media Composer (or another AAF-compatible editor)",
            Self::EditDecisionList => "the editing application that created it",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CameraRaw {
    RedR3d,
    BlackmagicRaw,
    ArriRaw,
    CanonCinemaRawLight,
    CinemaDng,
}

impl CameraRaw {
    pub fn name(self) -> &'static str {
        match self {
            Self::RedR3d => "RED R3D (REDCODE RAW)",
            Self::BlackmagicRaw => "Blackmagic RAW",
            Self::ArriRaw => "ARRIRAW",
            Self::CanonCinemaRawLight => "Canon Cinema RAW Light",
            Self::CinemaDng => "CinemaDNG",
        }
    }

    /// Where the user can get a decoder or a playable export.
    pub fn advice(self) -> &'static str {
        match self {
            Self::RedR3d => {
                "Decoding needs RED's R3D SDK. Open the clip in REDCINE-X PRO or DaVinci Resolve, or export a ProRes/H.264 version."
            }
            Self::BlackmagicRaw => {
                "Decoding needs the Blackmagic RAW SDK. Open the clip in Blackmagic RAW Player or DaVinci Resolve, or export a ProRes/H.264 version."
            }
            Self::ArriRaw => {
                "Decoding needs ARRI's SDK. Open the clip in ARRI Reference Tool or DaVinci Resolve, or export a ProRes/H.264 version."
            }
            Self::CanonCinemaRawLight => {
                "Decoding needs Canon's RAW SDK. Open the clip in Canon Cinema RAW Development or DaVinci Resolve, or export a ProRes/H.264 version."
            }
            Self::CinemaDng => {
                "CinemaDNG is a folder of DNG frames. NOVA does not play image sequences yet; open it in DaVinci Resolve or export a video file."
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileClass {
    /// Header matches a known media container (extension ignored).
    Media,
    EditingProject(EditingApp),
    CameraRaw(CameraRaw),
    /// Nothing recognized; let the engine probe it.
    Unknown,
}

fn ext(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Known container signatures in the first bytes.
pub fn is_media_signature(h: &[u8]) -> bool {
    let at = |off: usize, sig: &[u8]| h.len() >= off + sig.len() && &h[off..off + sig.len()] == sig;
    at(4, b"ftyp") // ISO-BMFF / QuickTime (mp4, mov, m4a, 3gp, crm, braw use ftyp too, see below)
        || at(4, b"moov") || at(4, b"mdat") || at(4, b"wide") || at(4, b"free") || at(4, b"skip") // QuickTime atoms
        || at(0, &[0x1A, 0x45, 0xDF, 0xA3]) // EBML: Matroska / WebM
        || (at(0, b"RIFF") && (at(8, b"AVI ") || at(8, b"WAVE")))
        || at(0, &[0x06, 0x0E, 0x2B, 0x34]) // MXF (SMPTE UL)
        || at(0, &[0x00, 0x00, 0x01, 0xBA]) // MPEG program stream / VOB
        || (h.len() > 188 && h[0] == 0x47 && h[188] == 0x47) // MPEG-TS
        || (h.len() > 196 && h[4] == 0x47 && h[196] == 0x47) // M2TS (4-byte timestamp prefix)
        || at(0, b"OggS")
        || at(0, b"fLaC")
        || at(0, b"ID3")
        || at(0, &[0x30, 0x26, 0xB2, 0x75]) // ASF / WMV
        || at(0, b"FLV")
        || at(0, &[0x0B, 0x77]) // AC-3 / E-AC-3 sync word
        || at(0, &[0x7F, 0xFE, 0x80, 0x01]) // DTS
        || at(0, b"FORM") // AIFF
}

/// Classifies a file from its first 4 KiB and its extension.
pub fn classify(path: &Path) -> FileClass {
    let mut head = [0u8; 4096];
    let n = std::fs::File::open(path)
        .and_then(|mut f| f.read(&mut head))
        .unwrap_or(0);
    classify_bytes(&head[..n], &ext(path))
}

pub fn classify_bytes(head: &[u8], ext: &str) -> FileClass {
    // RAW formats wrapped in QuickTime/MP4 boxes would also match `ftyp`;
    // check their extensions first so they get the RAW-specific path.
    let raw = match ext {
        "r3d" => Some(CameraRaw::RedR3d),
        "braw" => Some(CameraRaw::BlackmagicRaw),
        "ari" | "arx" => Some(CameraRaw::ArriRaw),
        "crm" => Some(CameraRaw::CanonCinemaRawLight),
        "dng" => Some(CameraRaw::CinemaDng),
        _ => None,
    };
    if let Some(r) = raw {
        return FileClass::CameraRaw(r);
    }
    if is_media_signature(head) {
        return FileClass::Media;
    }
    let text = String::from_utf8_lossy(&head[..head.len().min(1024)]).to_ascii_lowercase();
    let gzip = head.starts_with(&[0x1F, 0x8B]);
    let app = match ext {
        "prproj" if gzip || text.contains("premieredata") => Some(EditingApp::PremierePro),
        "prproj" => Some(EditingApp::PremierePro),
        "aep" | "aepx" => Some(EditingApp::AfterEffects),
        "drp" | "drt" => Some(EditingApp::DaVinciResolve),
        "fcpxml" | "fcpxmld" | "fcpbundle" => Some(EditingApp::FinalCutPro),
        "veg" | "vf" => Some(EditingApp::Vegas),
        "kdenlive" => Some(EditingApp::Kdenlive),
        "mlt" => Some(EditingApp::Shotcut),
        "otio" => Some(EditingApp::OpenTimelineIo),
        "aaf" | "avp" | "avb" => Some(EditingApp::Avid),
        "edl" => Some(EditingApp::EditDecisionList),
        _ => None,
    };
    if let Some(a) = app {
        return FileClass::EditingProject(a);
    }
    // Content-only recognition for misnamed timeline files.
    if text.contains("<fcpxml") {
        return FileClass::EditingProject(EditingApp::FinalCutPro);
    }
    if text.contains("<premieredata") {
        return FileClass::EditingProject(EditingApp::PremierePro);
    }
    FileClass::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_signature_wins_over_misleading_extension() {
        let mut mp4 = vec![0, 0, 0, 0x20];
        mp4.extend_from_slice(b"ftypisom");
        assert_eq!(classify_bytes(&mp4, "prproj"), FileClass::Media);
        assert_eq!(
            classify_bytes(&[0x1A, 0x45, 0xDF, 0xA3, 1], "mp4"),
            FileClass::Media
        );
        let mut ts = vec![0u8; 400];
        ts[0] = 0x47;
        ts[188] = 0x47;
        assert_eq!(classify_bytes(&ts, "bin"), FileClass::Media);
    }

    #[test]
    fn editing_projects_by_content_or_extension() {
        assert_eq!(
            classify_bytes(&[0x1F, 0x8B, 8, 0], "prproj"),
            FileClass::EditingProject(EditingApp::PremierePro)
        );
        assert_eq!(
            classify_bytes(b"<?xml?><fcpxml version", "xml"),
            FileClass::EditingProject(EditingApp::FinalCutPro)
        );
        assert_eq!(
            classify_bytes(b"whatever", "drp"),
            FileClass::EditingProject(EditingApp::DaVinciResolve)
        );
        assert_eq!(
            classify_bytes(b"RIFX....", "aep"),
            FileClass::EditingProject(EditingApp::AfterEffects)
        );
    }

    #[test]
    fn camera_raw_by_extension_even_inside_quicktime() {
        let mut mov = vec![0, 0, 0, 0x14];
        mov.extend_from_slice(b"ftypqt  ");
        assert_eq!(
            classify_bytes(&mov, "braw"),
            FileClass::CameraRaw(CameraRaw::BlackmagicRaw)
        );
        assert_eq!(
            classify_bytes(b"", "R3D".to_ascii_lowercase().as_str()),
            FileClass::CameraRaw(CameraRaw::RedR3d)
        );
        assert_eq!(
            classify_bytes(b"", "crm"),
            FileClass::CameraRaw(CameraRaw::CanonCinemaRawLight)
        );
    }

    #[test]
    fn unknown_stays_unknown() {
        assert_eq!(classify_bytes(b"hello world", "txt"), FileClass::Unknown);
        assert_eq!(classify_bytes(b"", "mkv"), FileClass::Unknown);
    }
}
