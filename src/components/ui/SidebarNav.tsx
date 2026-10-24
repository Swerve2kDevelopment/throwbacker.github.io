"use client";

import {
  BarChart3,
  CalendarDays,
  Home,
  Medal,
  Menu,
  Shield,
  Swords,
  Trophy,
  UserRound,
  Users,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const primary = [
  { href: "/", label: "Home", icon: Home },
  { href: "/matches", label: "Matches", icon: Swords },
  { href: "/players", label: "Players", icon: UserRound },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/tournaments", label: "Tournaments", icon: Trophy }
];

const stats = [
  { href: "/leaderboards", label: "Leaderboards", icon: BarChart3 },
  { href: "/records", label: "Records", icon: Medal },
  { href: "/leagues/oscl", label: "League Games", icon: CalendarDays }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="sidebar-brand" aria-label="OSCL home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/league-logos/OSCL.png" />
      <span className="min-w-0">
        <strong>OSCL</strong>
        <span>Old Siege: Challengers League</span>
      </span>
    </Link>
  );
}

export function SidebarNav({ isAdmin, account }: { isAdmin: boolean; account: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const renderLinks = (items: typeof primary) =>
    items.map((item) => {
      const Icon = item.icon;
      return (
        <Link key={item.href} href={item.href} className="sidebar-link" aria-current={isActive(pathname, item.href) ? "page" : undefined}>
          <Icon size={17} />
          {item.label}
        </Link>
      );
    });

  return (
    <>
      <div className="mobile-bar">
        <Brand />
        <button className="button button-ghost" type="button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu size={20} />
        </button>
      </div>

      <div className="sidebar-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className="sidebar" data-open={open} aria-label="Main navigation">
        <div className="flex items-center justify-between gap-2">
          <Brand />
          <button className="button button-ghost sidebar-close" type="button" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-section">
          <p>Compete</p>
          {renderLinks(primary)}
        </nav>

        <nav className="sidebar-section">
          <p>Stats</p>
          {renderLinks(stats)}
        </nav>

        {isAdmin ? (
          <nav className="sidebar-section">
            <p>Staff</p>
            <Link href="/admin" className="sidebar-link" aria-current={isActive(pathname, "/admin") ? "page" : undefined}>
              <Shield size={17} />
              Admin
            </Link>
          </nav>
        ) : null}

        <div className="sidebar-footer">{account}</div>
      </aside>
    </>
  );
}
