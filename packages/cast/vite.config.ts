import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, "../..");

export default defineConfig({
  root: "demo",
  base: "./",
  server: {
    fs: { allow: [repoRoot] },
    port: Number(process.env["VITE_PORT"] ?? 5182),
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    root: packageDir,
    include: ["src/**/*.test.ts"],
  },
});
