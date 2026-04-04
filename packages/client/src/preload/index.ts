import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  sendNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", { title, body });
  },
  // Screen sharing picker
  onScreenSharePick: (callback: (sources: Array<{ id: string; name: string; thumbnail: string }>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sources: Array<{ id: string; name: string; thumbnail: string }>) => {
      callback(sources);
    };
    ipcRenderer.on("screen-share-pick", handler);
    return () => ipcRenderer.removeListener("screen-share-pick", handler);
  },
  selectScreenSource: (sourceId: string | null) => {
    ipcRenderer.send("screen-share-selected", sourceId);
  },
});
