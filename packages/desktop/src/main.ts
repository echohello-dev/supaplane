import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDaemon, type DaemonHandle } from "@echohello/server/exports";
import log from "electron-log/main";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const isDev = !app.isPackaged;

let daemonHandle: DaemonHandle | null = null;
let mainWindow: BrowserWindow | null = null;

async function ensureDaemon(): Promise<DaemonHandle> {
  if (daemonHandle) return daemonHandle;
  log.info("starting embedded Supaplane daemon");
  const configOverrides: { listenPort?: number; listenHost?: string } = {};
  const envPort = process.env.SUPAPLANE_LISTEN_PORT;
  if (envPort && !Number.isNaN(Number.parseInt(envPort, 10))) {
    configOverrides.listenPort = Number.parseInt(envPort, 10);
  }
  const envHost = process.env.SUPAPLANE_LISTEN_HOST;
  if (envHost) configOverrides.listenHost = envHost;
  daemonHandle = await startDaemon({
    supaplaneHome: path.join(app.getPath("userData"), "supaplane-home"),
    ...(Object.keys(configOverrides).length > 0 ? { config: configOverrides } : {}),
  });
  return daemonHandle;
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#0a0a0f",
    title: "Supaplane",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    const webPort = process.env.SUPAPLANE_WEB_PORT ?? "5179";
    void win.loadURL(`http://127.0.0.1:${webPort}`);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(__dirname, "..", "..", "web", "dist", "index.html"));
  }

  return win;
}

ipcMain.handle("supaplane:daemon.health", async () => {
  const handle = await ensureDaemon();
  return {
    serverId: handle.wsServer.sessions.size,
    listenPort: handle.config.listenPort,
    supaplaneHome: handle.supaplaneHome,
  };
});

ipcMain.handle(
  "supaplane:daemon.rpc",
  async (_event: IpcMainInvokeEvent, _rpc: string, _args?: unknown) => {
    // TODO(post-MVP): forward RPC from the renderer to the daemon's WS bus.
    return {
      ok: false,
      error: { code: "not_implemented", message: "rpc forwarding not yet wired" },
    };
  },
);

ipcMain.handle("supaplane:window.setTitle", (_event, title: string) => {
  if (mainWindow) mainWindow.setTitle(String(title));
});

app.whenReady().then(async () => {
  try {
    await ensureDaemon();
  } catch (err) {
    log.error("failed to start daemon:", err);
  }
  mainWindow = createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (daemonHandle) {
    await daemonHandle.stop();
    daemonHandle = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (daemonHandle) {
    await daemonHandle.stop();
    daemonHandle = null;
  }
});
