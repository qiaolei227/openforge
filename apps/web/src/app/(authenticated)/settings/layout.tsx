import { SettingsSidebar } from '@/components/layout/settings-sidebar';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0">
      <SettingsSidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
