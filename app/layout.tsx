import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import "@/components/dashboard/sessions-kanban/kanban.css";
import { AppDock } from "@/components/app-dock";
import { LinearThemeInit } from "@/components/dashboard/linear-theme-init";
import { LenisProvider } from "@/components/lenis-provider";
import { PageTransition } from "@/components/page-transition";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard Agent",
  description: "Observer read-only sesi opencode: graf agent & subagent",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <LinearThemeInit />
          <LenisProvider>
            <div className="min-h-svh pb-[calc(6rem+env(safe-area-inset-bottom))]">
              <PageTransition className="flex min-h-svh flex-col">{children}</PageTransition>
            </div>
            <AppDock />
            <Toaster />
          </LenisProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
