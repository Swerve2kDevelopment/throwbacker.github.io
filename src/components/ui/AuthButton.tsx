"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

export function AuthButton({
  signedIn,
  compact = false,
  callbackUrl
}: {
  signedIn: boolean;
  compact?: boolean;
  callbackUrl?: string;
}) {
  if (signedIn) {
    return (
      <button className="button" onClick={() => signOut({ callbackUrl: "/" })} type="button">
        <LogOut size={16} />
        {!compact && "Sign out"}
      </button>
    );
  }

  return (
    <button className="button button-primary" onClick={() => signIn("discord", { callbackUrl: callbackUrl || "/" })} type="button">
      <LogIn size={16} />
      {!compact && "Sign in"}
    </button>
  );
}
