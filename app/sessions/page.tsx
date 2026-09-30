import SessionsKanban from "@/components/dashboard/sessions-kanban/SessionsKanban";

/**
 * /sessions — render SessionsKanban 06 (board + inspector).
 * Fetch live ada di dalam SessionsKanban (poll fail-open, read-only db).
 * Halaman pakai AppSidebar global + Inspector kanan.
 */
export default function SessionsPage() {
  return <SessionsKanban />;
}
