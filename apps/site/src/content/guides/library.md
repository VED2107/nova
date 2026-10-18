---
title: Library and resume
summary: Folders, scanning, search, missing files, Continue, the queue and playlists.
order: 3
status: current
statusNote: Written from 0.1.0-rc.1; the Windows library is unchanged in 0.2.0 apart from the "On air" mark. Scan progress, cancel and typing a search were present but not re-exercised. For phones, see NOVA for Android.
---

## Folders

Add a folder from Home (**Add folder**) or the Library's folder list. NOVA scans it in the background, shows progress and can cancel. Rescan or remove a folder from the same list. Removing a folder removes it from the library, not from your disk.

## Finding things

- Search titles and folder names from the search field.
- Sort **A–Z** or **Newest**.
- Switch between grid and list; the list has columns for length, picture, size, folder and status. Your choice is remembered.
- Right-click a title to play or resume it, or add it to the queue.

### Missing files

If a file has moved or its drive is disconnected, it is hidden by default. The **Missing files** toggle shows it, and the empty state says how many titles are hidden.

## Resume

NOVA saves your position as you watch and resumes there next time, across restarts. A note confirms the resume and offers **Start over**. Titles shorter than a minute always start from the beginning, on purpose. A file you move or rename inside your library keeps its progress.

**Continue** on Home leads with the title you were last watching; **Recently added** shows new arrivals. **Clear history** is in **Settings → Library & privacy**.

## Queue and playlists

Opening or dropping several files makes a queue. Open it with <kbd>Q</kbd>: reorder by dragging or with <kbd>Alt</kbd> <kbd>↑</kbd> <kbd>↓</kbd>, remove, shuffle what is left, or set repeat. **Save as playlist** keeps it; saved playlists can be opened, renamed and deleted.

Not built yet: editing a saved playlist's order directly (open it, reorder the queue and save under a new name), and detecting the same file stored in two places.

## Where your data lives

Your library, progress and preferences are stored in a SQLite database in NOVA's app-data folder on your computer (`%APPDATA%\com.snowbros.nova`), with thumbnails beside it. Saved frames go to `Pictures\NOVA`. There is no account and no cloud copy.
