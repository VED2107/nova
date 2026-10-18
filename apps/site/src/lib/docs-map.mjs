// Engineering records published on the site, rendered from the repository's
// docs/ at build time. Paths are relative to the repository root. Anything not
// listed here stays in the repository only.

/** @typedef {{ path: string, slug: string, title: string, group: "Evidence" | "Decisions" | "Testing" | "Architecture", summary: string }} RepoDoc */

/** @type {RepoDoc[]} */
export const REPO_DOCS = [
  {
    path: "docs/compat/README.md",
    slug: "compatibility",
    title: "Media compatibility",
    group: "Evidence",
    summary: "Support tiers, the format matrix, gaps and how the harness is run.",
  },
  {
    path: "docs/compat/results-no.md",
    slug: "compat-results-software",
    title: "Compatibility results: software decoding",
    group: "Evidence",
    summary: "All 55 samples on the real engine with hardware decoding off.",
  },
  {
    path: "docs/compat/results-auto_copy.md",
    slug: "compat-results-hardware",
    title: "Compatibility results: hardware decoding",
    group: "Evidence",
    summary: "The same 55 samples with hardware decoding allowed (auto-copy).",
  },
  {
    path: "docs/testing/rc1-local-windows.md",
    slug: "rc1-test-record",
    title: "RC1 test record (local Windows build)",
    group: "Testing",
    summary: "Feature audit with Verified, Partial and Deferred status, and known issues.",
  },
  {
    path: "docs/architecture/seeking.md",
    slug: "seeking",
    title: "Seeking: diagnosis, specification and measurements",
    group: "Evidence",
    summary: "Why seeks missed by up to 9.9 s, the fix, and before/after measurements to one frame.",
  },
  {
    path: "docs/compat/platform-matrix.md",
    slug: "platform-matrix",
    title: "Platform matrix: Windows, Android, iPhone",
    group: "Evidence",
    summary: "What each platform and engine plays and does, per feature.",
  },
  {
    path: "docs/release/mobile.md",
    slug: "mobile-release",
    title: "Mobile release process",
    group: "Testing",
    summary: "How the Android APK is built, signed, checked and updated in the app; the mobile release gate.",
  },
  {
    path: "docs/testing/README.md",
    slug: "testing",
    title: "How NOVA is tested",
    group: "Testing",
    summary: "Test layers, fixtures and how to run them.",
  },
  {
    path: "docs/architecture/playback-contract.md",
    slug: "playback-contract",
    title: "Playback contract",
    group: "Architecture",
    summary: "The boundary between the interface and the engine.",
  },
  {
    path: "docs/architecture/mobile.md",
    slug: "mobile-architecture",
    title: "Mobile architecture",
    group: "Architecture",
    summary: "The Android and iPhone app: Expo, the engine contract, storage and what runs where.",
  },
  {
    path: "docs/adr/0001-playback-engine-libmpv.md",
    slug: "adr-0001",
    title: "ADR 0001: Playback engine (libmpv)",
    group: "Decisions",
    summary: "Why NOVA plays media through libmpv.",
  },
  {
    path: "docs/adr/0002-video-rendering-in-tauri.md",
    slug: "adr-0002",
    title: "ADR 0002: Video rendering in Tauri",
    group: "Decisions",
    summary: "How the native video surface sits under the interface.",
  },
  {
    path: "docs/adr/0003-libmpv-distribution-and-licensing.md",
    slug: "adr-0003",
    title: "ADR 0003: libmpv distribution and licensing",
    group: "Decisions",
    summary: "Accepted: an LGPL engine built from source; MIT OR Apache-2.0 for NOVA.",
  },
  {
    path: "docs/adr/0004-local-persistence-and-resume.md",
    slug: "adr-0004",
    title: "ADR 0004: Local persistence and resume",
    group: "Decisions",
    summary: "SQLite on the device; how progress survives moves and crashes.",
  },
  {
    path: "docs/adr/0005-media-library-scanning-and-search.md",
    slug: "adr-0005",
    title: "ADR 0005: Library scanning and search",
    group: "Decisions",
    summary: "Folders, background scans and full-text search.",
  },
  {
    path: "docs/adr/0006-media-compatibility-policy.md",
    slug: "adr-0006",
    title: "ADR 0006: Media compatibility policy",
    group: "Decisions",
    summary: "What Verified, Partial, Expected and Unsupported mean.",
  },
  {
    path: "docs/adr/0007-mobile-architecture.md",
    slug: "adr-0007",
    title: "ADR 0007: NOVA on Android and iPhone",
    group: "Decisions",
    summary: "Expo and React Native with system engines now, libmpv later; licensing per store.",
  },
];

export const DOC_BY_PATH = new Map(REPO_DOCS.map((d) => [d.path, d]));
export const DOC_BY_SLUG = new Map(REPO_DOCS.map((d) => [d.slug, d]));
