# ADR 0003 — libmpv build, distribution and licensing

- **Status:** Proposed — **owner decision required before any public binary release**
- **Not legal advice.** Have counsel review the final distribution configuration.

## What we use today (development only)

| Item | Value |
| --- | --- |
| Source | `shinchiro/mpv-winbuild-cmake` GitHub release `20261015` |
| Asset | `mpv-dev-x86_64-20261015-git-492bae0768.7z` |
| SHA-256 | `5db58c1768587b35f2d8daa11b53de4aec58197c00ea1d676f998f183a358ba8` |
| mpv | `mpv v0.41.0-1175-g492bae076` (read from `mpv-version` at runtime) |
| FFmpeg | `N-127552-gee8cbd7db` (read from `ffmpeg-version`) |
| Client API | 2.5 |
| Fetch | `scripts/fetch-libmpv.sh` (pinned URL + hash check) into `vendor/` (git-ignored) |

The archive ships **no license or build-configuration file**. Inspecting the
DLL's strings shows the `libx264` and `libx265` encoder wrappers are compiled
in. Those require FFmpeg `--enable-gpl`, so **this binary must be treated as
GPL** (and mpv itself defaults to GPLv2+). No `libfdk_aac` (non-free) strings
were found, but that is not proof of absence; a build we control is needed to
know the exact configuration.

## Facts that drive the decision

- mpv is GPLv2+ by default; it can be built LGPLv2.1+ with `-Dgpl=false`.
- FFmpeg is LGPLv2.1+ unless built with `--enable-gpl` (then GPL) or
  `--enable-nonfree` (then not redistributable).
- **A player does not need x264/x265** — they are encoders. Decoding H.264/HEVC
  uses FFmpeg's own LGPL decoders or hardware decoders.
- NOVA loads libmpv at runtime as a separate DLL (ADR 0001), so an LGPL build
  can be replaced by users, which suits LGPL's relinking requirement.
- Codec patents (HEVC, etc.) are a separate question from copyright licenses
  and depend on jurisdiction and distribution model.

## Options

| | A. Ship a GPL build | B. Build our own LGPL libmpv + FFmpeg (recommended) |
| --- | --- | --- |
| App license | Combined distribution must comply with GPL (NOVA source can be MIT/Apache, which are GPL-compatible, but the shipped whole is GPL) | NOVA can be MIT/Apache-2.0; ship LGPL notices + source/build info for libmpv/FFmpeg |
| Effort | Low (reuse third-party builds) but we still must provide corresponding source for the exact build | Medium: reproducible CI build of mpv (`-Dgpl=false`) and FFmpeg (no `--enable-gpl`/`--enable-nonfree`) |
| Control | Third-party nightly; config undocumented | Pinned, documented, SBOM-able |

## Recommendation

Choose **B** before M4 (Windows beta). Until then:

- Development and CI may use the pinned shinchiro build.
- **Do not publish installers built with it** unless the owner explicitly
  chooses option A and the GPL obligations (license text, corresponding
  source for the exact build, notices) are fulfilled.
- `license = "UNLICENSED"` stays in `Cargo.toml` until the application
  license is chosen. No `LICENSE` file is added yet on purpose.

## Other dependencies (initial inventory, to be automated with SBOM in CI)

| Component | License (as published by the project) |
| --- | --- |
| Tauri 2.12, tauri-plugin-dialog/log | MIT OR Apache-2.0 |
| React 19, Vite 8, Tailwind CSS 4 | MIT |
| rusqlite 0.40 | MIT |
| SQLite (bundled amalgamation) | Public domain |
| serde, thiserror, log, libloading | MIT OR Apache-2.0 / ISC (libloading) |
| WebView2 runtime | Microsoft; installed system component, not bundled |
| 7-Zip `7zr.exe` (only used by the fetch script, not shipped) | Public domain / LGPL per 7-zip.org |

Verify each against `cargo deny`/`cargo about` and an npm license checker in CI
(follow-up).
