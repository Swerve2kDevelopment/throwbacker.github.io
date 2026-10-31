"use client";

import { BarChart3, CalendarDays, Home, Inbox, KeyRound, Settings, Sparkles, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Dashboard", icon: Home },
  { href: "/admin/matches", label: "Matches", icon: Swords },
  { href: "/admin/uploads", label: "Tracker uploads", icon: Inbox },
  { href: "/admin/players", label: "Players", icon: Users },
  { href: "/admin/teams", label: "Teams", icon: Trophy },
  { href: "/admin/tournaments", label: "Tournaments", icon: CalendarDays },
  { href: "/admin/stats", label: "Stat lines", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/ai-helper", label: "AI Helper", icon: Sparkles },
  { href: "/admin/admin-users", label: "Admin Users", icon: KeyRound }
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className="sidebar-link whitespace-nowrap" aria-current={active ? "page" : undefined}>
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
