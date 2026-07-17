import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Button } from "../src/components/Button.js";
import { ConnectionBanner } from "../src/components/ConnectionBanner.js";
import { TextField } from "../src/components/TextField.js";
import { useConnectionStore } from "../src/state/connection-store.js";
import { colors, spacing, typography } from "../src/theme.js";

function isValidWsUrl(value: string): boolean {
  return /^wss?:\/\/.+/i.test(value.trim());
}

export default function ConnectScreen() {
  const router = useRouter();
  const status = useConnectionStore((s) => s.status);
  const saved = useConnectionStore((s) => s.saved);
  const error = useConnectionStore((s) => s.error);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);

  const [endpoint, setEndpoint] = useState(saved?.endpoint ?? "ws://");
  const [label, setLabel] = useState(saved?.label ?? "");
  const [validation, setValidation] = useState<string | null>(null);

  const connecting = status === "connecting" || status === "reconnecting";
  const isConnected = status === "connected";

  const helper = useMemo(() => {
    if (isConnected) {
      return "Connected. Use Sessions to pick a workspace, or Disconnect to pair a different daemon.";
    }
    return "Enter the WebSocket URL of your Supaplane daemon. QR pairing arrives once the relay ships.";
  }, [isConnected]);

  const onConnect = async () => {
    if (!isValidWsUrl(endpoint)) {
      setValidation("Endpoint must start with ws:// or wss://");
      return;
    }
    setValidation(null);
    const trimmedLabel = label.trim();
    await connect(
      trimmedLabel ? { endpoint: endpoint.trim(), label: trimmedLabel } : { endpoint: endpoint.trim() },
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <ConnectionBanner />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={typography.display}>Supaplane</Text>
            <Text style={[typography.bodyMuted, styles.lede]}>{helper}</Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Daemon endpoint"
              value={endpoint}
              onChangeText={setEndpoint}
              placeholder="ws://192.168.1.10:7700/ws"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              {...(validation ? { error: validation } : {})}
              hint={error && status === "error" ? error : "WebSocket URL of the daemon"}
            />
            <TextField
              label="Label (optional)"
              value={label}
              onChangeText={setLabel}
              placeholder="Work Mac"
              hint="Shown in the connection banner"
            />
          </View>

          {error && status === "error" ? (
            <Text style={styles.errorInline}>Last attempt failed: {error}</Text>
          ) : null}

          <View style={styles.actions}>
            {isConnected ? (
              <>
                <Button label="Open sessions" onPress={() => router.push("/sessions")} />
                <Button
                  label="Disconnect"
                  onPress={disconnect}
                  variant="secondary"
                />
              </>
            ) : (
              <Button
                label={connecting ? "Connecting…" : "Connect"}
                onPress={onConnect}
                loading={connecting}
                disabled={connecting}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1 },
  header: { gap: spacing.sm },
  lede: { lineHeight: 22 },
  form: { gap: spacing.lg },
  errorInline: { ...typography.caption, color: colors.danger },
  actions: { gap: spacing.md, marginTop: "auto" },
});
