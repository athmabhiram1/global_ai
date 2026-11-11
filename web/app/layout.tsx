import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../src/console.css";

// Self-hosted Geist via next/font/google: zero runtime external font
// requests (no link to Google Fonts). The `variable` names bridge
// directly onto the design tokens in web/src/console.css (--sans/--mono).
const sans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--mono",
});

export const metadata: Metadata = {
  title: "Context Curator — Admission Control for LLM Context",
  description:
    "A native Bifrost plugin that performs admission control on context. Authority, freshness, independence, learned utility — with a causal proof for every decision.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A0B0D'/%3E%3Cpath d='M16 5 L26 11 V21 L16 27 L6 21 V11 Z' fill='none' stroke='%234CC2FF' stroke-width='2.4'/%3E%3Cpath d='M11.5 16.5 L14.5 19.5 L21 12.5' fill='none' stroke='%234CC2FF' stroke-width='2.4'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
