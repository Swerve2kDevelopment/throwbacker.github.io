"use client";

import { Trash2 } from "lucide-react";

export function ConfirmDeleteButton({ label = "Delete" }: { label?: string }) {
  return (
    <button
      className="button button-danger"
      type="submit"
      onClick={(event) => {
        if (!window.confirm("Delete this record? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 size={15} />
      {label}
    </button>
  );
}
