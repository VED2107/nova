/**
 * NOVA design tokens for native mobile. Values are copied from the desktop
 * source of truth (apps/desktop/src/styles/index.css, brand/README.md) and
 * must change there first. See docs/design/mobile-tokens.md.
 *
 * Daylight = cream stock, Night = ink stock, Darkroom = player chrome (always
 * dark). Ember is a FILL colour on cream; ember text on cream uses emberText.
 */
export const palette = {
  ink: "#171715",
  cream: "#F7F4EE",
  ember: "#F97316",
  room: "#0B0B0A",
} as const;

export interface Scheme {
  dark: boolean;
  paper: string;
  paperRaised: string;
  paperSunk: string;
  ink: string;
  ink2: string;
  ink3: string;
  seam: string;
  seamStrong: string;
  press: string;
  ember: string;
  emberText: string;
  onEmber: string;
  danger: string;
  thumb: string;
}

export const daylight: Scheme = {
  dark: false,
  paper: "#F7F4EE",
  paperRaised: "#FBF9F5",
  paperSunk: "#EFEBE3",
  ink: "#171715",
  ink2: "#45443F",
  ink3: "#64635C",
  seam: "rgba(23,23,21,0.12)",
  seamStrong: "rgba(23,23,21,0.24)",
  press: "rgba(23,23,21,0.09)",
  ember: "#F97316",
  emberText: "#A84A08",
  onEmber: "#171715",
  danger: "#B42318",
  thumb: "#E6E1D6",
};

export const night: Scheme = {
  dark: true,
  paper: "#141412",
  paperRaised: "#1C1C19",
  paperSunk: "#0E0E0D",
  ink: "#F2EFE8",
  ink2: "#C9C6BE",
  ink3: "#9D9B94",
  seam: "rgba(242,239,232,0.10)",
  seamStrong: "rgba(242,239,232,0.20)",
  press: "rgba(242,239,232,0.10)",
  ember: "#F97316",
  emberText: "#FB9A52",
  onEmber: "#171715",
  danger: "#FF8A7A",
  thumb: "#26261F",
};

/** The player is always dark, independent of theme. */
export const room = {
  bg: "#0B0B0A",
  ply: "rgba(14,14,13,0.92)",
  ply2: "rgba(24,24,22,0.97)",
  scrim: "rgba(11,11,10,0.55)",
  ink: "#F2EFE8",
  ink2: "#C9C6BE",
  ink3: "#A3A19A",
  seam: "rgba(242,239,232,0.14)",
  track: "rgba(242,239,232,0.24)",
  ember: "#F97316",
  cream: "#F7F4EE",
  danger: "#FF8A7A",
} as const;

export const font = {
  regular: "Archivo-Regular",
  medium: "Archivo-Medium",
  semibold: "Archivo-SemiBold",
  bold: "Archivo-Bold",
  /** Condensed cut for spine titles (desktop uses the width axis at ~75). */
  spine: "ArchivoCondensed-Bold",
  spineSemi: "ArchivoCondensed-SemiBold",
} as const;

/** Type scale (pt). Mobile runs one step larger than desktop's 14 px body. */
export const type = {
  caption: 12,
  label: 13,
  body: 15,
  title: 17,
  heading: 22,
  display: 34,
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

/** Square, restrained corners: NOVA is cut paper, not pills. */
export const radius = { s: 4, m: 6, l: 10 } as const;

/** Minimum touch target (Apple HIG 44 pt; Material 48 dp — we use 48 on both). */
export const TOUCH = 48;

/** Easing and durations shared with desktop (--ease-out-strong). */
export const motion = {
  quick: 140,
  base: 220,
  controlsHideMs: 3200,
  easeOutStrong: [0.23, 1, 0.32, 1] as const,
} as const;

/** The beam: the N's diagonal, 15.3° off vertical. Used by the playhead. */
export const BEAM_SKEW_DEG = -15.3;
