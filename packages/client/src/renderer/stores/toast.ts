import { create } from "zustand";

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
}

const TOAST_DURATION_MS = 5000;
let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, type = "error") => {
    const id = nextId++;
    set((s) => {
      // Drop duplicates so a retry loop doesn't stack identical toasts
      if (s.toasts.some((t) => t.message === message && t.type === type)) return s;
      return { toasts: [...s.toasts, { id, message, type }] };
    });
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, TOAST_DURATION_MS);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a toast from outside React (stores, ws handlers, async callbacks). */
export function toast(message: string, type: ToastType = "error") {
  useToastStore.getState().addToast(message, type);
}
