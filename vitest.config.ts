import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/cast/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "packages/protocol/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "packages/client/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "packages/server/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "packages/cli/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
    ],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
