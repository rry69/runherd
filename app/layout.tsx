import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Inter, Sora } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Dashboard Agent",
  description: "Observer read-only sesi opencode: graf agent & subagent",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${sora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="bg-transparent">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b border-foreground/10 bg-background/80 px-4 backdrop-blur">
                <Tooltip side="bottom">
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <SidebarTrigger />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Toggle sidebar (Ctrl+B)
                  </TooltipContent>
                </Tooltip>
                <span className="text-sm font-semibold">Dashboard Agent</span>
                <Badge variant="secondary">poll 1.5s</Badge>
                <Badge variant="outline">read-only</Badge>
                <span className="ml-auto">
                  <ThemeToggle />
                </span>
              </header>
              <PageTransition className="flex flex-1 flex-col">{children}</PageTransition>
            </SidebarInset>
          </SidebarProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
