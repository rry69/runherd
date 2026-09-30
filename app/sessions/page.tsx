import { SessionGraph } from "@/components/dashboard/SessionGraph";

export default function SessionsPage() {
  return (
    <main className="flex w-full flex-col gap-4 p-4 md:p-6">
      <SessionGraph />
    </main>
  );
}
