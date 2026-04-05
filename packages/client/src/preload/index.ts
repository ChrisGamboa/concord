import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  sendNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", { title, body });
  },
  onUpdateDownloaded: (callback: (info: { version: string; releaseNotes: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string }) => {
      callback(info);
    };
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  restartToUpdate: () => {
    ipcRenderer.send("restart-to-update");
  },
});
