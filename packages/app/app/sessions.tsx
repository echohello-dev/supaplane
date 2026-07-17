import { useEffect, useMemo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import type { SessionState, WorkspaceState } from "@echohello/protocol";

import { ConnectionBanner } from "../src/components/ConnectionBanner.js";
import { Button } from "../src/components/Button.js";
import { useConnectionStore } from "../src/state/connection-store.js";
import { colors, radius, spacing, typography } from "../src/theme.js";

interface Row {
  workspace: WorkspaceState;
  session: SessionState | null;
}

export default function SessionsScreen() {
  const router = useRouter();
  const status = useConnectionStore((s) => s.status);
  const workspaces = useConnectionStore((s) => s.workspaces);
  const sessions = useConnectionStore((s) => s.sessions);
  const connect = useConnectionStore((s) => s.connect);
  const saved = useConnectionStore((s) => s.saved);

  useEffect(() => {
    if (status === "idle" || status === "disconnected") {
      if (saved) {
        void connect({ endpoint: saved.endpoint, label: saved.label });
      } else {
        router.replace("/connect");
      }
    }
  }, [status, saved, connect, router]);

  const rows = useMemo<Row[]>(() => {
    const list = Array.from(workspaces.values()).sort((a, b) => {
      if (a.freshness === b.freshness) return a.cwd.localeCompare(b.cwd);
      if (a.freshness === "active") return -1;
      if (b.freshness === "active") return 1;
      return 0;
    });
    return list.map((workspace) => {
      const activeId = workspace.activeSessionId;
      const session =
        activeId !== null && activeId !== undefined
          ? (sessions.get(activeId) ?? null)
          : null;
      return { workspace, session };
    });
  }, [workspaces, sessions]);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Sessions" }} />
      <ConnectionBanner />
      <View style={styles.headerRow}>
        <Text style={typography.title}>Workspaces</Text>
        <Button
          label="Pair new"
          onPress={() => router.push("/connect")}
          variant="secondary"
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.workspace.workspaceId}
        contentContainerStyle={rows.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => undefined} tintColor={colors.textMuted} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={typography.bodyMuted}>
              No workspaces yet. Start one from the CLI:
            </Text>
            <Text style={[typography.mono, styles.code]}>supaplane agent start</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/session/[id]",
                params: { id: item.workspace.workspaceId },
              })
            }
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.workspace.repoName ?? item.workspace.cwd}
              </Text>
              <FreshnessPill freshness={item.workspace.freshness} />
            </View>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {item.workspace.branch ?? "no branch"} · {item.workspace.cwd}
            </Text>
            {item.session ? (
              <Text style={styles.sessionLabel} numberOfLines={1}>
                {labelForSession(item.session)}
              </Text>
            ) : (
              <Text style={styles.sessionLabelDim}>No active session</Text>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function labelForSession(session: SessionState): string {
  const status = session.status === "running" ? "●" : session.status === "waiting" ? "◐" : "○";
  const title = session.title ?? `${session.providerId} session`;
  return `${status} ${title}`;
}

function FreshnessPill({ freshness }: { freshness: WorkspaceState["freshness"] }) {
  const palette =
    freshness === "active"
      ? { bg: "#0e2a22", fg: colors.success }
      : freshness === "blocked"
        ? { bg: "#2a2010", fg: colors.warning }
        : freshness === "done"
          ? { bg: "#10202e", fg: colors.info }
          : { bg: colors.surfaceRaised, fg: colors.textMuted };
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.pillLabel, { color: palette.fg }]}>{freshness}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  list: { padding: spacing.xl, gap: spacing.md, paddingTop: 0 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  empty: { alignItems: "center", gap: spacing.md },
  code: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardPressed: { opacity: 0.7 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { ...typography.body, fontWeight: "600", flex: 1, marginRight: spacing.md },
  cardSubtitle: { ...typography.caption, color: colors.textMuted },
  sessionLabel: { ...typography.caption, color: colors.text, marginTop: spacing.xs },
  sessionLabelDim: { ...typography.caption, color: colors.textDim, marginTop: spacing.xs },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pillLabel: { fontSize: 11, textTransform: "uppercase", fontWeight: "600" },
});
