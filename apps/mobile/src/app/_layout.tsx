import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadLibrary } from "@/core/library";
import { loadPrefs } from "@/core/prefs";
import { useScheme } from "@/design/theme";
import { font, room } from "@/design/tokens";

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
  const s = useScheme();

  useEffect(() => {
    Promise.all([loadPrefs(), loadLibrary()]).finally(() => setStores(true));
  }, []);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(s.paper).catch(() => {});
  }, [s.paper]);

  if (!fontsLoaded || !stores) return <View style={{ flex: 1, backgroundColor: s.paper }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={s.dark ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: s.paper } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="player" options={{ presentation: "fullScreenModal", animation: "fade", contentStyle: { backgroundColor: room.bg } }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
