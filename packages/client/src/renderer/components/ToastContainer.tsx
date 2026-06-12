import { useToastStore } from "../stores/toast";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.type}`}
          onClick={() => dismissToast(t.id)}
          role="alert"
        >
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
