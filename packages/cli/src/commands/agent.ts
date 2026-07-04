import { Command } from "commander";

export const agentCommand = new Command("agent")
  .description("Inspect and operate on agents (TODO)")
  .addCommand(
    new Command("list")
      .description("List agents (queries daemon via WS — not yet wired)")
      .action(() => {
        process.stderr.write("Not implemented yet.\n");
        process.exit(1);
      }),
  )
  .addCommand(
    new Command("send")
      .description("Send a prompt to an agent (TODO)")
      .argument("<session-id>", "session id")
      .argument("<prompt...>", "prompt text")
      .action(() => {
        process.stderr.write("Not implemented yet.\n");
        process.exit(1);
      }),
  );
