---
title: Getting started
summary: What NOVA needs, how to open your first file, and why there is no download yet.
order: 1
status: incomplete
statusNote: There is no public build yet. Installation steps will be written for the first release and tested on a clean machine.
---

## There is no download yet

NOVA 0.1.0 exists as a local release candidate. It has been installed and tested on one Windows 11 computer and is **not distributed**. NOVA's licence is decided (MIT OR Apache-2.0), but releases must bundle an LGPL playback engine built from source, and that build doesn't exist yet. See [Release](/release) and [ADR 0003](/docs/adr-0003).

## What it runs on

- **Windows x64.** Tested on Windows 11 only. Windows 10 has not been tested.
- **Microsoft Edge WebView2**, the system component the interface is drawn with. It ships with current Windows installs; NOVA does not bundle it.
- **Graphics drivers.** Machines whose GPU driver does not provide Vulkan (`vulkan-1.dll`) have not been tested.
- NOVA is made for Windows only.

## Opening a file

- Choose **Open file**, or press <kbd>O</kbd> or <kbd>Ctrl</kbd> <kbd>O</kbd>.
- Drag one or more files onto the window. Several files become a queue.
- Start NOVA with a file path as its argument, as Explorer does when you open a file with it.

Playback starts as soon as the engine confirms it. If a file can't be played, NOVA says why and offers what to try next; see [Troubleshooting](/docs/troubleshooting).

## Your library

Add folders from Home or the Library and NOVA scans them in the background. Nothing is uploaded: the library, thumbnails and your progress live in a database on your computer. See [Library and resume](/docs/library).
