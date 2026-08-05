import { Command } from "commander";
import type { SessionState } from "@echohello/protocol";

import { connectCli, DEFAULT_HTTP_ENDPOINT } from "../connect.js";

export const agentCommand = new Command("agent")
  .description("Inspect and operate on agent sessions")
  .addCommand(
    new Command("list")
      .description("List agent sessions known to the daemon")
      .option("--workspace <id>", "filter by workspace id")
      .option("--endpoint <url>", "daemon HTTP endpoint", DEFAULT_HTTP_ENDPOINT)
      .action(async (opts) => {
        const client = await connectCli(String(opts.endpoint), "cli-agent-list");
        try {
          const args = opts.workspace ? { workspaceId: String(opts.workspace) } : undefined;
          const { sessions } = await client.rpc<typeof args, { sessions: SessionState[] }>(
            "session.list",
            args,
          );
          for (const session of sessions) {
            process.stdout.write(
              `${session.sessionId}\t${session.providerId}\t${session.status}\t${session.workspaceId}\n`,
            );
          }
        } finally {
          client.close();
        }
      }),
  )
  .addCommand(
    new Command("send")
      .description("Send a prompt to an agent session and stream the reply")
      .argument("<session-id>", "session id")
      .argument("<prompt...>", "prompt text")
      .option("--endpoint <url>", "daemon HTTP endpoint", DEFAULT_HTTP_ENDPOINT)
      .option("--timeout <ms>", "stream timeout", "120000")
      .action(async (sessionId: string, promptParts: string[], opts) => {
        const client = await connectCli(String(opts.endpoint), "cli-agent-send");
        const prompt = promptParts.join(" ");
        const done = new Promise<void>((resolvePromise, rejectPromise) => {
          const timer = setTimeout(
            () => rejectPromise(new Error("timed out waiting for the agent")),
            Number(opts.timeout),
          );
          client.onAgentEvent((event) => {
            if (event.sessionId !== sessionId) return;
            if (event.type === "message.delta") {
              process.stdout.write(event.text);
            } else if (event.type === "message.final") {
              process.stdout.write(`\n${event.text}\n`);
            } else if (event.type === "status" && event.status === "idle") {
              clearTimeout(timer);
              resolvePromise();
            } else if (event.type === "error") {
              clearTimeout(timer);
              rejectPromise(new Error(event.message));
            }
          });
        });
        try {
          client.sendCommand({ type: "session.send", sessionId, prompt, attachments: [] });
          await done;
        } catch (err) {
          process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          process.exitCode = 1;
        } finally {
          client.close();
        }
      }),
  );
