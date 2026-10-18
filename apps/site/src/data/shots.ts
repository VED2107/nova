/**
 * Captures of the real app. The Windows images were taken from NOVA 0.1.0
 * (the redesign merged for 0.1.0-rc.1) on Windows 11 at 1440×900, playing
 * open films from the Blender Foundation. The Android images are the 0.2.0
 * app's own screens rendered from its code at phone size (393×852 points,
 * 2× pixels); `source` says so in the caption. Nothing here is a mock-up.
 */

export type FilmId = "tos" | "sintel" | "bbb";

export const FILMS: Record<FilmId, { title: string; year: number; director: string; credit: string; url: string }> = {
  tos: {
    title: "Tears of Steel",
    year: 2012,
    director: "Ian Hubert",
    credit: "© Blender Foundation | mango.blender.org",
    url: "https://mango.blender.org/",
  },
  sintel: {
    title: "Sintel (trailer)",
    year: 2010,
    director: "Colin Levy",
    credit: "© copyright Blender Foundation | durian.blender.org",
    url: "https://durian.blender.org/",
  },
  bbb: {
    title: "Big Buck Bunny (trailer)",
    year: 2008,
    director: "Sacha Goedegebure",
    credit: "© copyright 2008, Blender Foundation | www.bigbuckbunny.org",
    url: "https://peach.blender.org/",
  },
};

export const CC_BY_3 = { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" };
export const CHANGES = "Frames shown inside NOVA's interface, captured from playback, scaled and compressed.";

export interface Shot {
  id: string;
  /** Large file; `small` is the 960-wide cut where one exists. */
  src: string;
  small?: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  films: FilmId[];
  dark: boolean;
  /** Provenance line when it is not a Windows 0.1.0 capture. */
  source?: string;
}

const s = (id: string, width: number, height: number, rest: Omit<Shot, "id" | "src" | "small" | "width" | "height">, small = true): Shot => ({
  id,
  src: `/shots/${id}.webp`,
  small: small ? `/shots/${id}-960.webp` : undefined,
  width,
  height,
  ...rest,
});

export const SHOTS = {
  playing: s("player-playing", 1440, 900, {
    alt: "NOVA's player showing Tears of Steel with subtitles, the ember playhead a quarter of the way along the timeline, and the control deck below.",
    caption: "Playing Tears of Steel. H.264, 1280×534, hardware decoding.",
    films: ["tos"],
    dark: true,
  }),
  release: s("player-release", 1440, 900, {
    alt: "The player mid-film: a close-up scene from Tears of Steel, subtitles above a slim control deck.",
    caption: "The deck stays quiet: one transport, the timeline on top.",
    films: ["tos"],
    dark: true,
  }),
  details: s("player-details", 1440, 900, {
    alt: "The playback details panel beside the picture, listing container, codec, resolution, frame rate, bit depth, chroma, alpha, dynamic range, decoder and sound.",
    caption: "Playback details: what the engine actually decoded, hardware or software.",
    films: ["tos"],
    dark: true,
  }),
  more: s("player-more", 1440, 900, {
    alt: "The More menu open above the deck, with sections for position, audio, subtitles and video, each item showing its key.",
    caption: "Every picture, sound, subtitle and frame tool, with its key.",
    films: ["tos"],
    dark: true,
  }),
  queue: s("player-queue", 1440, 900, {
    alt: "The queue panel listing three titles with durations, beside the picture, which re-centres to make room.",
    caption: "The queue. The picture re-centres beside an open panel.",
    films: ["tos"],
    dark: true,
  }),
  finished: s(
    "player-finished",
    844,
    561,
    {
      alt: "A Finished card over the black player after the Sintel trailer ends, offering Play again and Back to library.",
      caption: "End of media: a clear next step instead of a frozen frame.",
      films: ["sintel"],
      dark: true,
    },
    false,
  ),
  error: s("player-error", 1264, 761, {
    alt: "An error screen titled “NOVA couldn't play this file”, explaining likely causes with three suggestions and buttons to open another file, try again or go to the library.",
    caption: "A file that is not media: the reason, three things to try, three ways out.",
    films: [],
    dark: true,
  }),
  homeDay: s("home-daylight", 1440, 900, {
    alt: "NOVA's Home in Daylight: Continue with Tears of Steel and a Resume button, Recently added with three titles, and Your shelf.",
    caption: "Home, Daylight. Continue where you stopped.",
    films: ["tos", "sintel", "bbb"],
    dark: false,
  }),
  homeNight: s("home-night", 1440, 900, {
    alt: "The same Home screen in the Night theme.",
    caption: "Home, Night.",
    films: ["tos", "sintel", "bbb"],
    dark: true,
  }),
  grid: s("library-grid", 1440, 900, {
    alt: "The library as a grid of three titles with thumbnails, catalogue numbers and spec lines, under a search field and sort controls.",
    caption: "Library grid: thumbnails, catalogue numbers, spec lines.",
    films: ["tos", "sintel", "bbb"],
    dark: false,
  }),
  list: s("library-list", 1440, 900, {
    alt: "The library as a list with columns for length, picture, size, folder and status; Tears of Steel is marked In progress.",
    caption: "Library list: aligned columns, an In progress stamp.",
    films: ["tos", "sintel", "bbb"],
    dark: false,
  }),
  keys: s("settings-keys", 1440, 900, {
    alt: "Settings, Keys and mouse: mouse options above a keyboard section filtered by the word subtitle.",
    caption: "Find any action by name or key, and rebind it.",
    films: ["tos", "sintel", "bbb"],
    dark: false,
  }),
  formats: s("settings-formats", 1440, 900, {
    alt: "Settings, Formats: Verified, Partial, Expected and Needs the camera maker's software, each with a plain explanation and examples.",
    caption: "The Formats page inside the app tells the same truth as this site.",
    films: ["tos", "sintel", "bbb"],
    dark: false,
  }),
  settingsNight: s("settings-night", 1440, 900, {
    alt: "Settings, Appearance in the Night theme with System, Daylight and Night choices and a Saved confirmation.",
    caption: "Appearance: Daylight, Night or System. The player is always dark.",
    films: ["tos"],
    dark: true,
  }),
  androidHome: s(
    "android-home",
    786,
    1704,
    {
      alt: "NOVA for Android's Home on a phone: the NOVA wordmark, Home and Library tabs, the NOVA test card under Start here with a Play button, and Your shelf with Add folder and Open files.",
      caption: "Android, Home. The same Start here and shelf as on Windows.",
      films: [],
      dark: false,
      source: "NOVA for Android 0.2.0, rendered at phone size",
    },
    false,
  ),
  androidLibrary: s(
    "android-library",
    786,
    1704,
    {
      alt: "NOVA for Android's Library: folder chips, a search field, A–Z, Newest and Recent sorting, a missing-files filter, grid and list switches, and the test card as a list row.",
      caption: "Android, Library. Search, sort, missing files, grid or list.",
      films: [],
      dark: false,
      source: "NOVA for Android 0.2.0, rendered at phone size",
    },
    false,
  ),
} satisfies Record<string, Shot>;

export type ShotKey = keyof typeof SHOTS;
