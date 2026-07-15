// Ambient types for the preload bridge and Vite-injected env, so the renderer
// can use them without `(window as any)` / `(import.meta as any)` casts.

export interface ElectronBridge {
  platform: NodeJS.Platform | string;
  sendNotification: (title: string, body: string) => void;
  onUpdateDownloaded: (
    callback: (info: { version: string; releaseNotes: string }) => void
  ) => () => void;
  restartToUpdate: () => void;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }

  interface ImportMetaEnv {
    readonly VITE_SERVER_URL?: string;
    readonly VITE_WS_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
