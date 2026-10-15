# ADR 0005 — Media library: scanning, identity on rescans, search

- **Status:** Accepted (M2, 2026-10-15). Builds on ADR 0004.

## Decision

**Scan roots.** These are folders the user picks, stored as canonical paths. Roots may not overlap: a root inside another root, or one that contains another, is refused. So each file has at most one root and is never scanned twice.

**Scanner** (`crates/nova-library`):
- A single worker thread (`ScanManager`) runs one scan at a time from a de-duplicated queue.
- The walk is iterative and streaming, so memory grows with folder depth, not with file count.
- Symlinks and junctions are not followed. Testing confirmed that Rust reports Windows junctions as symlinks, so loops and escapes out of the root are impossible.
- Unreadable entries are counted and skipped. If the **root** itself is unreadable (unplugged drive, deleted folder, no permission), the scan fails and flags nothing.
- A file whose path, size and modification time are unchanged is not re-read. New or changed files are fingerprinted, so renames and moves keep their identity and progress through the existing `resolve_media` rules.
- Results are committed in batches of 200 files or every 300 ms, one transaction each. Cancellation is checked per entry, and committed work stays.

**Rescan semantics** (all covered by tests):

| Situation | Result |
| --- | --- |
| Nothing changed | 0 added, 0 updated, nothing re-read |
| File renamed / moved within the library | Same item, progress kept, counted "updated" |
| File or folder deleted, scan **completes** | Items flagged `missing` (hidden by default, progress kept) |
| Deleted file comes back | Item un-flagged, counted "updated" |
| Scan cancelled / failed / process killed | Nothing flagged; killed scans show `interrupted` at next start |
| Root removed by the user | Items detached from the library; files and progress untouched |
| Same content in two places | Two items (copy, not move) |

**Search:** an SQLite FTS5 external-content index over the title (file stem) and the folder path. It uses `unicode61` with diacritics folded and is kept up to date by triggers. User text is reduced to quoted prefix terms, so it cannot inject FTS syntax. An empty query lists everything. Results are paged, and the UI renders only the visible rows.

**Continue Watching:** entries from `playback_progress` that are not completed and are past 0, ordered by recency. It includes files played outside the library and flags files that no longer exist.

## Measurements (this machine; see m2-progress.md)

- Store search over 20 000 items: 6–22 ms per query (debug build).
- 20 000 real files (release build, SSD, small files): first scan 6.5 s, unchanged rescan 0.73 s, search 3.9 ms.

## Deferred

- Metadata extraction (duration, codecs, artwork) during scans. This needs a probing strategy (libmpv probe or bundled FFmpeg) and a check of its licensing.
- Automatic rescans: watching folders for changes, or scanning at startup.
- First-scan cost on HDDs and network shares: fingerprinting reads 128 KiB per new file, so throughput there will be limited by seek time.
