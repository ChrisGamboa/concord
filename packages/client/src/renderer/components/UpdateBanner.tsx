import { useEffect, useState } from "react";

interface UpdateInfo {
  version: string;
  releaseNotes: string;
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.onUpdateDownloaded) return;

    const cleanup = electron.onUpdateDownloaded((info: UpdateInfo) => {
      setUpdate(info);
    });

    return cleanup;
  }, []);

  if (!update || dismissed) return null;

  // Strip HTML tags from release notes for plain text display
  const notes = update.releaseNotes.replace(/<[^>]+>/g, "").trim();

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <div className="update-banner-text">
          <strong>Update ready: v{update.version}</strong>
          {notes && <span className="update-banner-notes">{notes}</span>}
        </div>
        <div className="update-banner-actions">
          <button
            className="update-banner-restart"
            onClick={() => (window as any).electron?.restartToUpdate()}
          >
            Restart Now
          </button>
          <button
            className="update-banner-dismiss"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
