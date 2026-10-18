import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LaunchSplash } from "@/components/LaunchSplash";
import { loadLibrary } from "@/core/library";
import { getPrefs, loadPrefs } from "@/core/prefs";
import { checkForUpdate } from "@/core/updates";
import { useScheme } from "@/design/theme";
import { font, room } from "@/design/tokens";

// The system splash stays up until fonts and stores are ready; LaunchSplash takes over from it.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Fonts are loaded at runtime so they also work in Expo Go, where the
  // expo-font config plugin (native embedding) does not apply.
  const [fontsLoaded] = useFonts({
    [font.regular]: require("../../assets/fonts/Archivo-Regular.ttf"),
    [font.medium]: require("../../assets/fonts/Archivo-Medium.ttf"),
    [font.semibold]: require("../../assets/fonts/Archivo-SemiBold.ttf"),
    [font.bold]: require("../../assets/fonts/Archivo-Bold.ttf"),
    [font.spine]: require("../../assets/fonts/ArchivoCondensed-Bold.ttf"),
    [font.spineSemi]: require("../../assets/fonts/ArchivoCondensed-SemiBold.ttf"),
  });
  const [stores, setStores] = useState(false);
  const [splash, setSplash] = useState(true);
  const s = useScheme();

  useEffect(() => {
    Promise.all([loadPrefs(), loadLibrary()]).finally(() => {
      setStores(true);
      // Like desktop: one quiet check at start-up unless the user chose "only when asked".
      if (getPrefs().updates === "auto") setTimeout(() => void checkForUpdate(true), 4000);
    });
  }, []);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(s.paper).catch(() => {});
  }, [s.paper]);

  const ready = fontsLoaded && stores;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  const endSplash = useCallback(() => setSplash(false), []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#171715" }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={s.dark ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: s.paper } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="player" options={{ presentation: "fullScreenModal", animation: "fade", contentStyle: { backgroundColor: room.bg } }} />
        </Stack>
        {splash && <LaunchSplash onDone={endSplash} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
