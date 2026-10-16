# NOVA — licences and third-party notices

## NOVA

NOVA's own source code is © 2026 SNOWBROS and licensed under either of

- MIT License (`LICENSE-MIT`), or
- Apache License, Version 2.0 (`LICENSE-APACHE`),

at your option. Source: <https://github.com/VED2107/nova>.

## Distribution licence of NOVA 0.1.0 for Windows (GPL)

The Windows installer of NOVA **0.1.0** bundles `libmpv-2.dll`, a third-party build of mpv and FFmpeg that includes
GPL-licensed components (among them the x264 and x265 encoder libraries). **The installer as a whole is therefore
distributed under the terms of the GNU General Public License, version 2 or later** (`LICENSES/GPL-2.0.txt`). NOVA's
own code remains MIT OR Apache-2.0, which are GPL-compatible.

Future releases are planned to bundle an LGPL build of libmpv and FFmpeg instead (ADR 0003, option B).

### Corresponding source of the bundled engine (`libmpv-2.dll`)

| Item | Value |
| --- | --- |
| Binary | `mpv-dev-x86_64-20261015-git-492bae0768.7z`, SHA-256 `5db58c1768587b35f2d8daa11b53de4aec58197c00ea1d676f998f183a358ba8` |
| Built by | `shinchiro/mpv-winbuild-cmake`, release `20261015`, recipe commit `1f8d2e76255abc48f0456d9be99b4cab9c6566e6` (<https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20261015>) |
| mpv | commit `492bae0768f5e826991bf9fb222fa303371e8498` (`mpv v0.41.0-1175-g492bae076`) |
| FFmpeg | commit `ee8cbd7dbce9b293905f3088192e4b43ab00c33a` (`N-127552-gee8cbd7db`) |

The NOVA 0.1.0 GitHub release carries source archives of that mpv commit, that FFmpeg commit and that build recipe,
next to the installer.

**Written offer.** For at least three years from the release date, SNOWBROS will provide the complete corresponding
source code of every GPL- or LGPL-licensed component of `libmpv-2.dll` in NOVA 0.1.0, including the libraries the
build recipe compiles in, to anyone who asks. Ask by opening an issue at <https://github.com/VED2107/nova/issues>.
You may replace `libmpv-2.dll` in NOVA's install folder with your own build.

### Licence texts

- `LICENSES/GPL-2.0.txt`: GNU General Public License v2 (mpv default, FFmpeg with `--enable-gpl`, x264, x265)
- `LICENSES/LGPL-2.1.txt`: GNU Lesser General Public License v2.1 (FFmpeg and mpv LGPL parts, libplacebo and others)

## Other components

| Component | Licence |
| --- | --- |
| Tauri 2, tauri-plugin-dialog, tauri-plugin-log | MIT OR Apache-2.0 |
| React, React DOM | MIT |
| rusqlite | MIT |
| SQLite | Public domain |
| serde, thiserror, log | MIT OR Apache-2.0 |
| libloading | ISC |
| Archivo typeface | SIL Open Font License 1.1 (`apps/desktop/src/assets/fonts/OFL.txt`) |
| Microsoft Edge WebView2 Runtime | Microsoft; a Windows system component, not bundled |

This list is the initial inventory from ADR 0003; an automated licence report is still to be added. This file is not
legal advice.
