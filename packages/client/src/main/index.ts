import { app, BrowserWindow, desktopCapturer, session, shell, Notification, ipcMain } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow!.show();
    if (is.dev) {
      mainWindow!.webContents.openDevTools({ mode: "bottom" });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Desktop notifications
ipcMain.on("show-notification", (_event, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

app.whenReady().then(() => {
  // Screen sharing: get sources, send to renderer for picking, wait for selection
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
    }).then((sources) => {
      if (!mainWindow || sources.length === 0) {
        callback({});
        return;
      }

      // Send thumbnails to renderer for the picker UI
      mainWindow.webContents.send("screen-share-pick", sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      })));

      // Wait for the user's selection from the renderer
      ipcMain.once("screen-share-selected", (_event, sourceId: string | null) => {
        if (!sourceId) {
          callback({});
          return;
        }
        // Find the SAME source object from this getSources call
        const selected = sources.find((s) => s.id === sourceId);
        if (selected) {
          callback({ video: selected });
        } else {
          callback({});
        }
      });
    });
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
