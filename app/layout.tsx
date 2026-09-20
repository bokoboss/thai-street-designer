import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thai Street Designer",
  description: "Draw and edit left-hand-traffic road concepts for Thailand. Interactive proof of concept.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
