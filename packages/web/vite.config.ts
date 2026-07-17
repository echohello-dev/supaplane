import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const daemonHost = env.SUPAPLANE_DAEMON_HOST ?? "127.0.0.1";
  const daemonPort = env.SUPAPLANE_DAEMON_PORT ?? "17687";
  const daemonHttp = `http://${daemonHost}:${daemonPort}`;
  const daemonWs = `ws://${daemonHost}:${daemonPort}`;

  return {
    root: "src",
    base: "./",
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT ?? 5179),
      strictPort: true,
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: daemonHttp,
          changeOrigin: true,
        },
        "/ws": {
          target: daemonWs,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
