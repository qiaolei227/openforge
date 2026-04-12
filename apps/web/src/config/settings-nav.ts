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
  label: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: string;
  feature: 'enabled' | 'planned';
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: '用户与权限',
    items: [
      { code: 'users', label: '用户', href: '/settings/users', icon: Users, requiredPermission: 'platform:users', feature: 'enabled' },
      { code: 'roles', label: '角色', href: '/settings/roles', icon: Shield, requiredPermission: 'platform:roles', feature: 'enabled' },
      { code: 'orgs', label: '组织', href: '/settings/orgs', icon: Building2, requiredPermission: 'platform:orgs', feature: 'enabled' },
    ],
  },
  {
    label: '平台配置',
    items: [
      { code: 'config', label: '平台参数', href: '/settings/config', icon: SlidersHorizontal, requiredPermission: 'platform:config', feature: 'enabled' },
    ],
  },
  {
    label: '高级（即将推出）',
    items: [
      { code: 'audit', label: '操作日志', href: '/settings/audit', icon: ScrollText, feature: 'planned' },
      { code: 'ai-services', label: 'AI 服务', href: '/settings/ai-services', icon: Sparkles, feature: 'planned' },
      { code: 'backup', label: '备份恢复', href: '/settings/backup', icon: Database, feature: 'planned' },
      { code: 'theme', label: '平台主题', href: '/settings/theme', icon: Palette, feature: 'planned' },
    ],
  },
];
