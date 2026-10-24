import type { Metadata } from "next";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { assertAdminUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await assertAdminUser();

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">League staff</p>
          <h1>OSCL Admin</h1>
          <p>Signed in as {session.user.name || session.user.username}</p>
        </div>
      </div>
      <div className="admin-shell">
        <AdminSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
