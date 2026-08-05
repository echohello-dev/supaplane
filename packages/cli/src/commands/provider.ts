import { Command } from "commander";

import { connectCli, DEFAULT_HTTP_ENDPOINT } from "../connect.js";

export const providerCommand = new Command("provider")
  .description("Inspect provider availability")
  .addCommand(
    new Command("list")
      .description("List providers and their diagnostic status")
      .option("--endpoint <url>", "daemon HTTP endpoint", DEFAULT_HTTP_ENDPOINT)
      .action(async (opts) => {
        const client = await connectCli(String(opts.endpoint), "cli-provider-list");
        try {
          const { providers } = await client.rpc<never, { providers: string[] }>("provider.list");
          for (const providerId of providers) {
            let diagnostic = "no diagnostic";
            try {
              const result = await client.rpc<{ providerId: string }, { diagnostic: string }>(
                "provider.diagnostic",
                { providerId },
              );
              diagnostic = result.diagnostic;
            } catch (err) {
              diagnostic = `unavailable: ${err instanceof Error ? err.message : String(err)}`;
            }
            process.stdout.write(`${providerId}\t${diagnostic}\n`);
          }
        } finally {
          client.close();
        }
      }),
  );
