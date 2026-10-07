import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import "@/components/dashboard/sessions-kanban/kanban.css";
import { AppDock } from "@/components/app-dock";
import { PageTransition } from "@/components/page-transition";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dashboard Agent",
  description: "Observer read-only sesi opencode: graf agent & subagent",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <div className="min-h-svh pb-[calc(6rem+env(safe-area-inset-bottom))]">
            <PageTransition className="flex min-h-svh flex-col">{children}</PageTransition>
          </div>
          <AppDock />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
