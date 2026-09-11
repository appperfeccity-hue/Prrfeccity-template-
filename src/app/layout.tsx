import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { QueryProvider } from "@/lib/query-provider";
import { ToastProvider } from "@/lib/toast";
import { NavUser } from "@/components/layout/NavUser";
import { NavLinks } from "@/components/layout/NavLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Designer Canvas",
  description: "Author reusable wall-panel manufacturing Templates",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <QueryProvider>
          <ToastProvider>
            <header className="topnav">
              <Link href="/" className="topnav-brand">
                Designer Canvas
              </Link>
              <NavLinks />
              <NavUser />
            </header>
            <main className="app-main">{children}</main>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
