import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";

import "@/app/globals.css";
import { BrokenImageGuard } from "@/components/ui/BrokenImageGuard";
import { Footer } from "@/components/ui/Footer";
import { Navbar } from "@/components/ui/Navbar";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://throwbacktracker.com";

const display = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

const description = "Results, player ratings, MMR ranks, team rosters and tournament brackets for Old Siege: Challengers League.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "OSCL | Old Siege: Challengers League",
    template: "%s | OSCL"
  },
  description,
  applicationName: "OSCL",
  icons: { icon: "/league-logos/OSCL.png" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Old Siege: Challengers League",
    title: "Old Siege: Challengers League",
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Old Siege: Challengers League" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Old Siege: Challengers League",
    description,
    images: ["/opengraph-image"]
  }
};

export const viewport = {
  themeColor: "#050605"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="app-shell">
          <Navbar />
          <div className="app-main">
            {children}
            <Footer />
          </div>
        </div>
        <BrokenImageGuard />
      </body>
    </html>
  );
}
