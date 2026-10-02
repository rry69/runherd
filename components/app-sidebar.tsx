"use client";

import { Activity, ChevronLeft, Coins, LayoutDashboard, Network } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/sessions", label: "Sessions", icon: Network },
  // Angka 9router (biaya/token/throughput) dari usageDaily, poll 60s.
  { href: "/router", label: "Router", icon: Coins },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { toggleSidebar, state } = useSidebar();
  const isActive = (href: string) => pathname === href;
  const collapsed = state === "collapsed";

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Dashboard Agent" asChild>
              <Link href="/">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Activity className="size-4" />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    Dashboard Agent
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    opencode observer
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  tooltip={item.label}
                  isActive={isActive(item.href)}
                  asChild
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 p-2">
              <ThemeToggle />
              <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Tema
              </span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Tooltip side="right">
              <TooltipTrigger asChild>
                <div className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    poll 1s • read-only
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Polling /api/sessions tiap 1 detik • read-only
              </TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-1/2 z-30 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:flex"
      >
        <ChevronLeft className="size-4 transition-transform duration-200 group-data-[state=collapsed]:rotate-180" />
      </button>
    </Sidebar>
  );
}
