# Releasing NOVA for Windows: signing, trust and file associations

## Four different things people call "trusted"

| | What it is | Does NOVA have it? |
|---|---|---|
| **Updater signature** (minisign) | Every installer is signed with NOVA's updater key; installed copies refuse an update whose `.sig` does not verify against the public key built into them (`tauri.conf.json`). | **Yes**, since 0.2.0. Checked by `verify-release.mjs` with the same algorithm the app uses. |
| **Authenticode** | A code-signing certificate from a CA that Windows trusts names the publisher (SNOWBROS) in the UAC prompt and file properties and proves the file was not changed. | **No, not yet.** The pipeline is ready (below); it needs a certificate, which needs SNOWBROS's identity to be verified. Until then UAC says "Unknown publisher". |
| **SmartScreen reputation** | Microsoft's per-file/per-certificate reputation. New files are warned about ("Windows protected your PC") until enough people run them without problems. | **No.** Signing does not remove the warning on day one: an OV certificate or Artifact Signing builds reputation over downloads and time; Microsoft gives EV certificates no instant bypass any more either. Unsigned builds start from zero on every release. |
| **Microsoft Store** / formal certification | Store submission runs Microsoft's certification (security, content, technical checks). Store-signed MSIX packages are trusted by SmartScreen. | **No.** Possible later: NOVA could be listed as an MSIX (Store-signed) or as a Win32 EXE that the Store links to (then the EXE still needs Authenticode). The in-app updater must be off in a Store build. |

"Microsoft certified" is not a claim NOVA can make today, and passing tests, building or being signed does not make it one.

## Signing pipeline

`bundle.windows.signCommand` runs `scripts/windows/sign.ps1 <file>` for **every binary Tauri ships**: `nova-desktop.exe`, `libmpv-2.dll`, the NSIS plugins, the uninstaller and the installer (verified in the 0.3.0 build log). The script picks the first configured backend:

| Backend | Environment (secrets only, never in the repo) |
|---|---|
| Azure **Artifact Signing** (formerly Trusted Signing). Recommended: no hardware token, CI-friendly, cheap, Microsoft-managed certificate. Requires identity validation of SNOWBROS (organisation, or individual where Microsoft offers it in your country). | `NOVA_SIGN_ENDPOINT`, `NOVA_SIGN_ACCOUNT`, `NOVA_SIGN_PROFILE`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`; `cargo install artifact-signing-cli` |
| OV/EV certificate in the Windows store or on a hardware token (signtool) | `NOVA_SIGN_THUMBPRINT`, optional `NOVA_SIGN_TIMESTAMP` |
| None | Development builds pass unsigned with a warning. **`NOVA_REQUIRE_SIGNING=1` makes the build fail instead** — set it for releases once a certificate exists. |

Every signature is RFC 3161 timestamped (so it stays valid after the certificate expires) and checked with `Get-AuthenticodeSignature` right after signing.

### What you (the owner) must do once

1. Choose: Azure Artifact Signing (recommended) or buy an OV certificate (needs a hardware token or cloud HSM since 2023).
2. Complete identity validation for **SNOWBROS** — the exact name must match the `publisher` in `tauri.conf.json`, the installer, the website and the release notes.
3. Put the credentials in GitHub secrets or on the release machine; do not paste them into chat or commit them.
4. Build with `NOVA_REQUIRE_SIGNING=1`, then run the gate without `--allow-unsigned`.

## Release gate

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/nova-updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" pnpm build
node scripts/windows/verify-release.mjs --notes "<one paragraph>" [--install-dir "%LOCALAPPDATA%\NOVA"] [--allow-unsigned]
```

It checks Authenticode (valid, timestamped, signer SNOWBROS) on the installer, app and libmpv; the publisher in the installer's version info; the updater signature against the embedded public key; licence files; that an installed copy contains only allowlisted files (no PDBs, test media or local paths); and it stages `target/release/publish/` with `latest.json` and a re-verified `SHA256SUMS.txt`. Without `--allow-unsigned`, an unsigned file fails the gate. Tested negative case: swapping in another release's `.sig` fails.

Then attach everything in `target/release/publish/` plus the mpv/FFmpeg source archives (GPL installer, ADR 0003) to the GitHub release `vX.Y.Z`.

## File associations ("Open with NOVA")

Registration is done by the app itself (`apps/desktop/src-tauri/src/shell.rs`), run by the installer (`--register-file-types`), the uninstaller (`--unregister-file-types`) and Settings › Formats › Repair. Per user (HKCU), no elevation.

- **Written:** ProgIDs `NOVA.Video`, `NOVA.Audio`, `NOVA.Subtitle`; `.ext\OpenWithProgids` values; `Applications\nova-desktop.exe` (friendly name "NOVA", `SupportedTypes`); `Software\SNOWBROS\NOVA\Capabilities` and `RegisteredApplications\NOVA`. The open verb uses `MultiSelectModel=Player`, and later launches are forwarded to the running window.
- **Never written:** an extension's default value or `UserChoice`. NOVA never becomes the default by itself; Windows protects that choice. Users pick NOVA in Settings › Apps › Default apps › NOVA (the Settings button opens that page) or with "Always" in the Open with dialog.
- **Removed on uninstall:** exactly the keys and values above (unit-tested: everything written is covered). Other apps' `OpenWithProgids` and the user's defaults stay.

| Registered (offered as default) | Video: mp4 m4v mkv webm mov avi wmv asf flv f4v m2ts mts m2t mpg mpeg vob ogv 3gp 3g2 mxf dv divx · Audio: mp3 flac m4a aac ogg opus wav wma aif aiff ac3 eac3 dts mka |
|---|---|
| Open with only | srt ass ssa vtt (added to the playing video; alone they explain that a video is needed) |
| Plays, deliberately not registered | ts (also TypeScript), gxf, y4m, alac, thd; anything else libmpv opens can still be dragged in or opened from NOVA |

### Verified on the development machine (Windows 11, 2026-10-19)

| Check | Result |
|---|---|
| Silent upgrade 0.2.0 → 0.3.0 | Exit 0; 36 capability types, ProgIDs, RegisteredApplications written |
| Existing default (.mp4 → VLC) | Unchanged after install, uninstall and reinstall |
| Cold start through the `NOVA.Video` verb (ShellExecuteEx with the class, as Explorer does), MKV in a folder named `NOVA open test (ü 映画)` | Plays; window title shows the file |
| Second launch while running (verb and command line, two files) | Second process exits 0 within the timeout; running window switches to the new file |
| Silent uninstall | NOVA keys and values gone; four other apps' `OpenWithProgids` intact; library database kept |
| Reinstall | Registration back; installed files match the allowlist |

### Manual checks still for a person at the machine

- Right-click a file › Open with › NOVA shows the NOVA icon and name; "Choose another app" lists NOVA.
- Select 3 and 20 files › Open with › NOVA: one window, all files queued.
- Settings › Default apps › NOVA lists the video and audio types; choosing NOVA for .mp4 works and uninstalling NOVA then lets Windows ask again.
- Unsigned installer: SmartScreen "Windows protected your PC" → More info → Run anyway. Expected until signing and reputation exist.
