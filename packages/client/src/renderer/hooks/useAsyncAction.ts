import { useCallback, useState } from "react";

/**
 * Wraps the repeated saving/message/try-catch-finally boilerplate around async
 * mutations (Server Settings, Settings). `run(fn, successMsg)` toggles `saving`,
 * clears the message, runs `fn`, and sets a success or error message.
 */
export function useAsyncAction() {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const run = useCallback(async (fn: () => Promise<void>, successMsg = "") => {
    setSaving(true);
    setMsg("");
    try {
      await fn();
      if (successMsg) setMsg(successMsg);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, msg, setMsg, run };
}
