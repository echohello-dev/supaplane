import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useConnectionStore } from "../src/state/connection-store.js";

export default function RootLayout(): React.JSX.Element {
  const router = useRouter();
  const hydrate = useConnectionStore((s) => s.hydrate);
  const status = useConnectionStore((s) => s.status);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (status === "idle" || status === "disconnected" || status === "error" || status === "exhausted") {
      router.replace("/connect");
    } else if (status === "connected" || status === "connecting" || status === "reconnecting") {
      router.replace("/sessions");
    }
  }, [status, router]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ headerShown: false }} />
        <Stack.Screen name="sessions" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]" options={{ headerShown: true }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const colors = {
  bg: "#0a0a0f",
  text: "#e5e5e5",
};
