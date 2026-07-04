import { Command } from "commander";

export const providerCommand = new Command("provider")
  .description("Inspect provider availability (TODO)")
  .addCommand(
    new Command("list").description("List providers and their diagnostic status").action(() => {
      process.stderr.write("Not implemented yet.\n");
      process.exit(1);
    }),
  );
