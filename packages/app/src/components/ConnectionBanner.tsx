import { StyleSheet, Text, View } from "react-native";

import { useConnectionStore } from "../state/connection-store.js";
import { colors, spacing, typography } from "../theme.js";

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const error = useConnectionStore((s) => s.error);
  const serverId = useConnectionStore((s) => s.serverId);
  const serverLabel = useConnectionStore((s) => s.serverLabel);
  const reconnectAttempt = useConnectionStore((s) => s.reconnectAttempt);

  const tone =
    status === "connected"
      ? { bg: "#0e2a22", fg: colors.success }
      : status === "error" || status === "exhausted"
        ? { bg: "#2a0e0e", fg: colors.danger }
        : status === "reconnecting" || status === "connecting"
          ? { bg: "#1a1a2a", fg: colors.warning }
          : { bg: colors.surface, fg: colors.textMuted };

  let label: string;
  if (status === "connected") {
    label = `Connected · ${serverLabel ?? serverId ?? "unknown"}`;
  } else if (status === "connecting") {
    label = "Connecting…";
  } else if (status === "reconnecting") {
    label = `Reconnecting (attempt ${reconnectAttempt})…`;
  } else if (status === "exhausted") {
    label = "Reconnect attempts exhausted";
  } else if (status === "error") {
    label = `Error — ${error ?? "unknown"}`;
  } else if (status === "disconnected") {
    label = "Disconnected";
  } else {
    label = "Not connected";
  }

  return (
    <View style={[styles.bar, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.label, { color: tone.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...typography.caption, flex: 1, fontFamily: "Menlo" },
});
