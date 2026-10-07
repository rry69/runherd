import SessionsKanban from "@/components/dashboard/sessions-kanban/SessionsKanban";

/**
 * /sessions — render SessionsKanban 06 (board + inspector).
 * Fetch live ada di dalam SessionsKanban (poll fail-open, read-only db).
 * Halaman pakai AppSidebar global + Inspector kanan.
 */
export default function SessionsPage() {
  return (
    <main className="flex w-full flex-col gap-5 bg-transparent p-4 md:p-6">
      <div className="content-fade-in mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <SessionsKanban />
      </div>
    </main>
  );
}
