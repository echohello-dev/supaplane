import { resolve } from "node:path";

export const SUPAPLANE_VERSION = "0.0.0";

/** Resolve `$SUPAPLANE_HOME` (default `~/.supaplane`). */
export function resolveSupaplaneHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.SUPAPLANE_HOME;
  if (fromEnv && fromEnv.trim().length > 0) {
    return resolve(fromEnv);
  }
  const home = env.HOME ?? env.USERPROFILE ?? "/tmp";
  return resolve(home, ".supaplane");
}
