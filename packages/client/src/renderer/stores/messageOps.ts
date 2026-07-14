import type { ReactionGroup } from "@concord/shared";

// Pure list transforms shared by the channel and DM message slices. Keeping the
// optimistic-send/nonce reconciliation in one place means both surfaces behave
// identically and the logic can be unit-tested without a store.

export interface OptimisticFields {
  /** Sent but not yet confirmed by the server */
  pending?: boolean;
  /** Send failed (socket closed or no confirmation in time) */
  failed?: boolean;
  /** Client-generated id used to match the server confirmation */
  nonce?: string;
}

export interface BaseMessage extends OptimisticFields {
  id: string;
  reactions?: ReactionGroup[];
}

/**
 * Reconcile a confirmed message into the list: replace the optimistic copy
 * matched by nonce, otherwise append if not already present (dedupe by id).
 */
export function reconcile<T extends BaseMessage>(list: T[], message: T, nonce?: string): T[] {
  if (nonce) {
    const idx = list.findIndex((m) => m.nonce === nonce);
    if (idx !== -1) {
      const next = list.slice();
      next[idx] = message;
      return next;
    }
  }
  if (list.some((m) => m.id === message.id)) return list;
  return [...list, message];
}

export function markFailed<T extends BaseMessage>(list: T[], nonce: string): T[] {
  return list.map((m) => (m.nonce === nonce ? { ...m, pending: false, failed: true } : m));
}

export function markPending<T extends BaseMessage>(list: T[], nonce: string): T[] {
  return list.map((m) => (m.nonce === nonce ? { ...m, pending: true, failed: false } : m));
}

export function removeByNonce<T extends BaseMessage>(list: T[], nonce: string): T[] {
  return list.filter((m) => m.nonce !== nonce);
}

/** Merge a message by id so fields the payload omits (reactions, pinnedAt) survive. */
export function merge<T extends BaseMessage>(list: T[], message: Partial<T> & { id: string }): T[] {
  return list.map((m) => (m.id === message.id ? { ...m, ...message } : m));
}

export function removeById<T extends BaseMessage>(list: T[], id: string): T[] {
  return list.filter((m) => m.id !== id);
}

export function prepend<T extends BaseMessage>(list: T[], older: T[]): T[] {
  return [...older, ...list];
}

export function setReactions<T extends BaseMessage>(list: T[], id: string, reactions: ReactionGroup[]): T[] {
  return list.map((m) => (m.id === id ? { ...m, reactions } : m));
}
