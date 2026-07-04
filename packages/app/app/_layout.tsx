import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout(): React.JSX.Element {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0a0a0f" },
          headerTintColor: "#e5e5e5",
          contentStyle: { backgroundColor: "#0a0a0f" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Supaplane" }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
