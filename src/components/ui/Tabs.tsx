"use client";

import { useEffect, useState, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
};

/**
 * Client-side tabs that fade between panels. The active tab is mirrored to
 * ?tab= so links and refreshes land on the same panel.
 */
export function Tabs({ tabs, defaultTab }: { tabs: TabItem[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl && tabs.some((tab) => tab.id === fromUrl)) setActive(fromUrl);
  }, [tabs]);

  const select = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };

  const current = tabs.find((tab) => tab.id === active) || tabs[0];
  if (!current) return null;

  return (
    <div>
      <div className="tabs-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className="tab-button"
            type="button"
            role="tab"
            aria-selected={tab.id === current.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => select(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined ? <em>{tab.count}</em> : null}
          </button>
        ))}
      </div>
      <div key={current.id} id={`panel-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} className="tab-panel">
        {current.content}
      </div>
    </div>
  );
}
