import { Command } from "commander";

export const worktreeCommand = new Command("worktree")
  .description("Manage git worktrees (TODO)")
  .addCommand(
    new Command("create")
      .description("Create a worktree for the given branch/PR")
      .argument("<target>", "branch name or PR number")
      .action(() => {
        process.stderr.write("Not implemented yet.\n");
        process.exit(1);
      }),
  )
  .addCommand(
    new Command("list").description("List worktrees known to the daemon").action(() => {
      process.stderr.write("Not implemented yet.\n");
      process.exit(1);
    }),
  );
