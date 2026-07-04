#!/usr/bin/env bun
import { Command } from "commander";
import { daemonCommand } from "./commands/daemon.js";
import { agentCommand } from "./commands/agent.js";
import { providerCommand } from "./commands/provider.js";
import { worktreeCommand } from "./commands/worktree.js";

const program = new Command();
program
  .name("supaplane")
  .description("Supaplane — local-first multi-surface coding-agent workbench CLI")
  .version("0.0.0");

program.addCommand(daemonCommand);
program.addCommand(agentCommand);
program.addCommand(providerCommand);
program.addCommand(worktreeCommand);

await program.parseAsync(process.argv);
