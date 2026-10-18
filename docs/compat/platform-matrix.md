# Compatibility by platform

The evidence levels per platform are listed below. **Windows** is the detailed, tested matrix in [README.md](README.md). **iOS and Android have no device measurements yet.** Their entries are vendor documentation or engine capability, marked as such and never as "verified".

| Mark | Meaning |
|---|---|
| **V-real** | Verified on real media from a device or workflow |
| **V-gen** | Verified on generated (synthetic) media in NOVA's harness |
| **Partial** | Works with a documented limitation |
| **Expected** | The engine has the decoder/demuxer, or the vendor documents support. Not tested by NOVA |
| **SDK** | Requires an external SDK/component NOVA does not ship |
| **No** | Unsupported in that engine |

Mobile columns, per engine:

- **Sys** is the system engine: AVPlayer on iOS, Media3 on Android. It is what Expo Go runs today.
- **mpv** is the planned LGPL libmpv module (development build). **Not built.**

| Format / profile | Windows (libmpv) | iOS Sys | iOS mpv | Android Sys | Android mpv |
|---|---|---|---|---|---|
| MP4/MOV · H.264 · AAC | V-gen | Expected (device run pending) | Expected | Expected | Expected |
| HEVC 8/10-bit (MP4/MOV) | V-gen | Expected | Expected | Expected (device-dependent) | Expected |
| HDR10 / HLG output | Partial (detected; output not verified) | Expected (native HDR) | Partial (unproven) | Expected (device) | Partial (unproven) |
| Dolby Vision | Expected | Expected | Partial | Expected (device) | Partial |
| AV1 | V-gen | Expected only on AV1-hardware devices | Expected (software: heat and battery) | Expected (device) | Expected |
| VP8 / VP9 (WebM) | V-gen | **No** (container) | Expected | Expected | Expected |
| MKV container | V-gen | **No** | Expected | Expected | Expected |
| ProRes 422/4444 | V-gen | Expected (supported devices) | Expected | **No** (typical) | Expected (software) |
| DNxHD/HR, CineForm, HAP, FFV1 | V-gen | **No** | Expected | **No** | Expected |
| MPEG-2 (VOB/TS, XDCAM) | V-gen | **No** (typical) | Expected | Partial (device) | Expected |
| AC-3 / E-AC-3 | V-gen | Expected | Expected | Partial (device) | Expected |
| DTS / TrueHD | V-gen | **No** | Expected (decode to PCM) | **No** (typical) | Expected |
| FLAC / ALAC / Opus | V-gen | Expected | Expected | Expected | Expected |
| SRT / WebVTT / mov_text subtitles | V-gen (SRT) | Expected (mov_text, WebVTT; external SRT not via expo-video) | Expected | Expected | Expected |
| ASS/SSA styling | Expected | **No** | Expected (libass) | Partial (basic) | Expected |
| PGS / VobSub (image subtitles) | Expected | **No** | Expected | Partial (recent Media3) | Expected |
| Variable frame rate | V-gen (seek ≤ 1 frame, seeking.md) | Expected | Expected | Expected | Expected |
| Camera RAW (R3D, BRAW, ARRIRAW, CRM) | SDK (detected, explained) | SDK | SDK | SDK | SDK |
| Editing projects | No (detected, explained) | No | No | No | No |

Notes:

- **Container recognition is not decoding.** An "Expected" container entry says nothing about the codecs inside it.
- **"Typical" means device variance.** Android decoders vary by SoC. Every Android cell needs a per-device measurement (M5).
- **Every "Expected" entry stays "Expected"** until the M2c corpus run on real devices.
