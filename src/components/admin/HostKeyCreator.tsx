"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";

import { createHostKeyAction, type HostKeyState } from "@/lib/admin-actions";

/** Creates a host key and shows it once; only its hash is kept on the server. */
export function HostKeyCreator() {
  const [state, action, pending] = useActionState<HostKeyState, FormData>(createHostKeyAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-3">
      <form action={action} className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="label" placeholder="Host name, e.g. Swerve2k" required maxLength={64} />
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create host key"}
        </button>
      </form>
      {state.error ? <div className="text-sm font-bold text-red-300">{state.error}</div> : null}
      {state.key ? (
        <div className="notice-banner grid gap-2">
          <strong>Key for {state.label}. Copy it now: it won&apos;t be shown again.</strong>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all">{state.key}</code>
            <button
              className="button"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(state.key || "").then(() => setCopied(true));
              }}
            >
              <Copy size={14} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
