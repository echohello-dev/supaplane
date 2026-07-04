import { Command } from "commander";

export const daemonCommand = new Command("daemon")
  .description("Control the Supaplane daemon (start, stop, status, log, pair)")
  .addCommand(
    new Command("start")
      .description("Start the daemon in the foreground")
      .option("--port <port>", "override the listen port")
      .option("--host <host>", "override the bind host")
      .action(async (opts) => {
        const { startDaemon } = await import("@echohello/server");
        const handle = await startDaemon({
          config: {
            ...(opts.port ? { listenPort: Number(opts.port) } : {}),
            ...(opts.host ? { listenHost: String(opts.host) } : {}),
          },
        });
        process.on("SIGINT", () => void handle.stop());
        process.on("SIGTERM", () => void handle.stop());
        await new Promise(() => {});
      }),
  )
  .addCommand(
    new Command("status")
      .description("Show daemon status (queries the health endpoint)")
      .option("--endpoint <url>", "daemon HTTP endpoint", "http://127.0.0.1:6767")
      .action(async (opts) => {
        const res = await fetch(`${opts.endpoint}/api/health`);
        if (!res.ok) {
          process.stderr.write(`Daemon unhealthy: ${res.status}\n`);
          process.exit(1);
        }
        const body = (await res.json()) as { status: string; serverId: string };
        process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
      }),
  )
  .addCommand(
    new Command("version")
      .description("Print the daemon version + protocol version")
      .option("--endpoint <url>", "daemon HTTP endpoint", "http://127.0.0.1:6767")
      .action(async (opts) => {
        const res = await fetch(`${opts.endpoint}/api/version`);
        process.stdout.write(`${await res.text()}\n`);
      }),
  )
  .addCommand(
    new Command("pair")
      .description("Print the pairing URL / QR for this daemon (TODO)")
      .action(() => {
        process.stderr.write(
          "`supaplane daemon pair` is not implemented yet — see docs/onboarding-relay.md.\n",
        );
        process.exit(1);
      }),
  );
