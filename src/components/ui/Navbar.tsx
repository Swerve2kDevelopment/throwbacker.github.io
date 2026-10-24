import Link from "next/link";

import { AuthButton } from "@/components/ui/AuthButton";
import { SidebarNav } from "@/components/ui/SidebarNav";
import { getAuthSession } from "@/lib/permissions";

export async function Navbar() {
  const session = await getAuthSession();
  const user = session?.user;
  const avatar = user?.avatar || user?.image;

  const account = user ? (
    <>
      <Link href="/account" className="account-chip">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={avatar} />
        ) : (
          <span>{(user.name || user.username || "?").slice(0, 2).toUpperCase()}</span>
        )}
        <span className="min-w-0">
          <strong>{user.name || user.username}</strong>
          <em>Account &amp; transfers</em>
        </span>
      </Link>
      <AuthButton signedIn />
    </>
  ) : (
    <AuthButton signedIn={false} />
  );

  return <SidebarNav isAdmin={Boolean(user?.isAdmin)} account={account} />;
}
