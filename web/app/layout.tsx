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
