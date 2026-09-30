import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
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

export const metadata: Metadata = {
  title: "Dashboard Agent",
  description: "Observer read-only sesi opencode: graf agent & subagent",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#120F17] text-foreground">
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="bg-transparent">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-[#120F17]/80 px-4 backdrop-blur">
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
            </header>
            <div className="flex flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
