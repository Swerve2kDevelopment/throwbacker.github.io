"use client";

import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";

export function ConfirmDeleteModal({ label = "Delete" }: { label?: string }) {
  return <ConfirmDeleteButton label={label} />;
}
