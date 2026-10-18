---
title: Getting started
summary: Download and install NOVA 0.2.0, what it needs, and opening your first file.
order: 1
status: incomplete
statusNote: Written for 0.2.0. Installing has been tested on one machine only.
---

## Download and install

1. Download `NOVA_0.2.0_x64-setup.exe` from [Release](/release) and compare its SHA-256 with the one shown there. In PowerShell: `Get-FileHash .\NOVA_0.2.0_x64-setup.exe`.
2. Run it. The installer is not signed, so Windows SmartScreen may warn. Choose **More info → Run anyway** only if the checksum matches.
3. NOVA installs for your user account, without administrator rights, and adds an uninstall entry named “NOVA 0.2.0”.

The installer bundles a third-party mpv/FFmpeg build with GPL components, so it is distributed under the GPL. Licence texts and the engine's source details are in the `licenses` folder of the install directory and on the [GitHub release](https://github.com/VED2107/nova/releases/tag/v0.2.0).

## Updates

From 0.2.0, NOVA checks GitHub for a newer release shortly after it starts and shows a notice when one is ready.
**Install and restart** downloads it, checks that it is signed with NOVA's key, installs it and reopens NOVA; **Later**
hides the notice until the next start. Turn the check off, or check by hand, in **Settings → About**. 0.1.0 has no
updater: install 0.2.0 from this site once.

## What it runs on

- **Windows x64.** Tested on Windows 11 only. Windows 10 has not been tested.
- **Microsoft Edge WebView2**, the system component the interface is drawn with. It ships with current Windows installs; NOVA does not bundle it.
- **Graphics drivers.** Machines whose GPU driver does not provide Vulkan (`vulkan-1.dll`) have not been tested.
- NOVA for Windows is this app. There is also an [Android pre-release](/docs/android); there is no macOS, Linux or iPhone download.

## Opening a file

- Choose **Open file**, or press <kbd>O</kbd> or <kbd>Ctrl</kbd> <kbd>O</kbd>.
- Drag one or more files onto the window. Several files become a queue.
- Start NOVA with a file path as its argument, as Explorer does when you open a file with it.

Playback starts as soon as the engine confirms it. If a file can't be played, NOVA says why and offers what to try next; see [Troubleshooting](/docs/troubleshooting).

## Your library

Add folders from Home or the Library and NOVA scans them in the background. Nothing is uploaded: the library, thumbnails and your progress live in a database on your computer. See [Library and resume](/docs/library).
