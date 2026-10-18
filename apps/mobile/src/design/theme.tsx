import { useColorScheme } from "react-native";
import { usePrefs } from "@/core/prefs";
import { daylight, night, type Scheme } from "./tokens";

/** The paper scheme for library and settings (the player is always Darkroom). */
export function useScheme(): Scheme {
  const system = useColorScheme();
  const { theme } = usePrefs();
  const dark = theme === "system" ? system === "dark" : theme === "dark";
  return dark ? night : daylight;
}
