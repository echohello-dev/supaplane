import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { AgentEvent } from "@echohello/protocol";

import { ConnectionBanner } from "../../src/components/ConnectionBanner.js";
import { Button } from "../../src/components/Button.js";
import { useConnectionStore } from "../../src/state/connection-store.js";
import { colors, radius, spacing, typography } from "../../src/theme.js";

export default function SessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const workspaceId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? (params.id[0] ?? "") : "";

  const workspace = useConnectionStore((s) =>
    workspaceId ? (s.workspaces.get(workspaceId) ?? null) : null,
  );
  const sessions = useConnectionStore((s) => s.sessions);
  const client = useConnectionStore((s) => s.client);
  const recordEvent = useConnectionStore((s) => s.recordEvent);
  const clearEvents = useConnectionStore((s) => s.clearEvents);
  const status = useConnectionStore((s) => s.status);

  const activeSessionId = workspace?.activeSessionId ?? null;
  const activeSession = activeSessionId ? (sessions.get(activeSessionId) ?? null) : null;

  const allEvents = useConnectionStore((s) => s.events);
  const events = useMemo(() => {
    if (!activeSessionId) return [] as AgentEvent[];
    return allEvents.get(activeSessionId) ?? [];
  }, [allEvents, activeSessionId]);

  const [draft, setDraft] = useState("");
  const [sessionInput, setSessionInput] = useState(activeSessionId ?? "");
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (activeSessionId) setSessionInput(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (!client) return;
    const off = client.onAgentEvent((event) => recordEvent(event));
    return off;
  }, [client, recordEvent]);

  useEffect(() => {
    if (events.length === 0) return;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [events.length]);

  const send = (): void => {
    if (!client) return;
    const target = sessionInput.trim() || activeSessionId;
    const prompt = draft.trim();
    if (!target || !prompt) return;
    client.sendCommand({
      type: "session.send",
      sessionId: target,
      prompt,
      attachments: [],
    });
    setDraft("");
  };

  const start = (): void => {
    if (!client || !workspace) return;
    client.sendCommand({
      type: "session.start",
      workspaceId: workspace.workspaceId,
      providerId: "claude",
    });
  };

  const abort = (): void => {
    if (!client) return;
    const target = sessionInput.trim() || activeSessionId;
    if (!target) return;
    client.sendCommand({ type: "session.abort", sessionId: target });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title: workspace?.repoName ?? workspace?.cwd ?? "Session",
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.back}>Back</Text>
            </Pressable>
          ),
        }}
      />
      <ConnectionBanner />

      <View style={styles.metaRow}>
        <Text style={styles.meta} numberOfLines={1}>
          {workspace?.branch ?? "no branch"} · {workspace?.cwd ?? "unknown cwd"}
        </Text>
        <Text style={styles.metaDim}>
          {activeSession
            ? `${activeSession.providerId} · ${activeSession.status}`
            : "no active session"}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
        >
          {events.length === 0 ? (
            <Text style={styles.empty}>
              {activeSession
                ? "Waiting for the agent. Send a prompt below to get started."
                : "No active session. Start one to begin streaming events."}
            </Text>
          ) : (
            events.map((event, index) => (
              <TranscriptLine
                key={`${event.type}-${index}-${event.ts}`}
                event={event}
              />
            ))
          )}
        </ScrollView>

        <View style={styles.composer}>
          <View style={styles.sessionRow}>
            <TextInput
              style={styles.sessionInput}
              value={sessionInput}
              onChangeText={setSessionInput}
              placeholder="session id"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {activeSessionId ? (
              <Pressable
                onPress={() => activeSessionId && clearEvents(activeSessionId)}
                style={styles.linkButton}
              >
                <Text style={styles.linkText}>clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.prompt}
              value={draft}
              onChangeText={setDraft}
              placeholder={
                activeSession
                  ? "Send a prompt…"
                  : "Start a session first (provider defaults to claude)"
              }
              placeholderTextColor={colors.textDim}
              multiline
              editable={!!client && status === "connected"}
            />
            <View style={styles.actionStack}>
              {activeSession ? (
                <Button label="Send" onPress={send} disabled={!draft.trim()} />
              ) : (
                <Button label="Start" onPress={start} disabled={!client || !workspace} />
              )}
              {activeSession ? (
                <Button label="Abort" onPress={abort} variant="danger" />
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TranscriptLine({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case "message.delta":
    case "message.final":
      return (
        <View style={styles.line}>
          <Text style={styles.lineKind}>msg</Text>
          <Text style={styles.lineText}>{event.text}</Text>
        </View>
      );
    case "tool.start":
      return (
        <View style={styles.line}>
          <Text style={[styles.lineKind, styles.toolKind]}>tool</Text>
          <Text style={styles.lineText}>▶ {event.name}</Text>
        </View>
      );
    case "tool.result":
      return (
        <View style={styles.line}>
          <Text style={[styles.lineKind, styles.toolKind]}>tool</Text>
          <Text style={styles.lineText}>✓ {event.toolCallId} · {event.durationMs}ms</Text>
        </View>
      );
    case "status":
      return (
        <View style={styles.line}>
          <Text style={[styles.lineKind, styles.statusKind]}>status</Text>
          <Text style={styles.lineText}>{event.status}</Text>
        </View>
      );
    case "error":
      return (
        <View style={styles.line}>
          <Text style={[styles.lineKind, styles.errorKind]}>error</Text>
          <Text style={styles.lineText}>{event.code}: {event.message}</Text>
        </View>
      );
    case "permission_request":
      return (
        <View style={styles.line}>
          <Text style={[styles.lineKind, styles.warnKind]}>perm</Text>
          <Text style={styles.lineText}>{event.reason}</Text>
        </View>
      );
    case "tool.progress":
      return null;
    default: {
      const _exhaustive: never = event;
      return _exhaustive ? null : null;
    }
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  back: { color: colors.accent, fontSize: 15 },
  metaRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 2,
  },
  meta: { ...typography.caption, color: colors.text },
  metaDim: { ...typography.caption, color: colors.textDim },
  transcript: { flex: 1 },
  transcriptContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  empty: { ...typography.bodyMuted, textAlign: "center", marginTop: spacing.xl },
  line: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  lineKind: {
    ...typography.monoDim,
    width: 56,
    textTransform: "uppercase",
    paddingTop: 2,
  },
  lineText: { ...typography.mono, flex: 1, lineHeight: 20 },
  toolKind: { color: colors.info },
  statusKind: { color: colors.warning },
  errorKind: { color: colors.danger },
  warnKind: { color: colors.warning },
  composer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sessionInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  inputRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" },
  prompt: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 140,
  },
  actionStack: { gap: spacing.xs },
  linkButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  linkText: { ...typography.caption, color: colors.accent },
});
