import type { Metadata, Viewport } from "next";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: { default: "OIS Education", template: "%s · OIS Education" },
  description: "A small library of original browser games you can play alone or with friends online.",
};
export const viewport: Viewport = { themeColor: "#f2f1e8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Header />
        {children}
      </body>
    </html>
  );
}
