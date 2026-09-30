import { AliasSettingsList } from "@/components/alias-settings-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <main className="flex w-full flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings — Alias Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Rename agent utama per session id. Kosong = kembali ke agent asli.
          </p>
          <div className="-mx-6 -mb-6 mt-2">
            <AliasSettingsList />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
