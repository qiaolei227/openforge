import {
  Users,
  Shield,
  Building2,
  SlidersHorizontal,
  ScrollText,
  Sparkles,
  Database,
  Palette,
  type LucideIcon,
} from 'lucide-react';

export interface SettingsNavItem {
  code: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: string;
  feature: 'enabled' | 'planned';
}

export interface SettingsNavGroup {
  labelKey: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    labelKey: 'groupUsersPermissions',
    items: [
      { code: 'users', labelKey: 'users', href: '/settings/users', icon: Users, requiredPermission: 'platform:users', feature: 'enabled' },
      { code: 'roles', labelKey: 'roles', href: '/settings/roles', icon: Shield, requiredPermission: 'platform:roles', feature: 'enabled' },
      { code: 'orgs', labelKey: 'orgs', href: '/settings/orgs', icon: Building2, requiredPermission: 'platform:orgs', feature: 'enabled' },
    ],
  },
  {
    labelKey: 'groupPlatformConfig',
    items: [
      { code: 'config', labelKey: 'config', href: '/settings/config', icon: SlidersHorizontal, requiredPermission: 'platform:config', feature: 'enabled' },
    ],
  },
  {
    labelKey: 'groupAdvanced',
    items: [
      { code: 'audit', labelKey: 'audit', href: '/settings/audit', icon: ScrollText, feature: 'planned' },
      { code: 'ai-services', labelKey: 'aiServices', href: '/settings/ai-services', icon: Sparkles, feature: 'planned' },
      { code: 'backup', labelKey: 'backup', href: '/settings/backup', icon: Database, feature: 'planned' },
      { code: 'theme', labelKey: 'theme', href: '/settings/theme', icon: Palette, feature: 'planned' },
    ],
  },
];
