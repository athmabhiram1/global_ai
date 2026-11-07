import type { Metadata } from "next";
import "../src/console.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
