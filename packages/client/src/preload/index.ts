import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  sendNotification: (title: string, body: string) => {
    ipcRenderer.send("show-notification", { title, body });
  },
  getScreenSources: () =>
    ipcRenderer.invoke("get-screen-sources") as Promise<
      Array<{ id: string; name: string; thumbnail: string }>
    >,
});
