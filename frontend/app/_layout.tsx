// Root layout: fonts, engine bootstrap, providers. Must keep ErrorBoundary,
// QueryClientProvider and KeyboardProvider wrappers from the template.
import { useEffect } from "react";
import { LogBox, StyleSheet } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { ToastProvider } from "@/src/components/Toast";
import { useNativeListenerWiring, useRideAssistState } from "@/src/hooks/useRideEngine";
import { rideStore } from "@/src/services/rideStore";
import { registerAutoAcceptHook } from "@/src/services/acceptance";
import { registerVoiceAlerts } from "@/src/services/voiceAlerts";
import { startSimulator, stopSimulator } from "@/src/services/simulator";
import { useTheme } from "@/src/theme";

// Disable logbox noise so users see the app, not redbox spam.
LogBox.ignoreAllLogs(true);

// Wire the auto-accept hook once (honest no-op until a verified adapter exists).
registerAutoAcceptHook();
registerVoiceAlerts();

export default function RootLayout() {
  const { colors } = useTheme();

  const [fontsLoaded] = useFonts({
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    "Barlow-Regular": require("../assets/fonts/Barlow-Regular.ttf"),
    "Barlow-Medium": require("../assets/fonts/Barlow-Medium.ttf"),
    "Barlow-SemiBold": require("../assets/fonts/Barlow-SemiBold.ttf"),
  });

  const state = useRideAssistState();
  const ready = state.ready && fontsLoaded;

  useEffect(() => {
    void rideStore.init();
  }, []);

  // Simulator lifecycle follows the toggle.
  useEffect(() => {
    if (state.simulatorOn) {
      startSimulator();
    } else {
      stopSimulator();
    }
  }, [state.simulatorOn]);

  // Wire the native listener (no-op in Expo Go / web).
  useNativeListenerWiring();

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ToastProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.surface },
                }}
              />
            </ToastProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
