/**
 * 解析 URL 里的 filter 预设 (base64 encoded JSON)，并替换占位符：
 *   $currentUser → 当前用户 id
 *   $currentOrg  → 当前组织 id
 *
 * P2.1 支持这两个占位符；P2.2 扩展 $currentDept 等。
 */
export interface FilterPresetContext {
  currentUserId: string;
  currentOrgId: string;
}

export function parseFilterPreset(
  encoded: string | null,
  ctx: FilterPresetContext,
): Record<string, unknown> | null {
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(atob(encoded));
    const raw = JSON.parse(json);
    return substitutePlaceholders(raw, ctx);
  } catch {
    return null;
  }
}

function substitutePlaceholders(value: unknown, ctx: FilterPresetContext): any {
  if (value === '$currentUser') return ctx.currentUserId;
  if (value === '$currentOrg') return ctx.currentOrgId;
  if (Array.isArray(value)) {
    return value.map((v) => substitutePlaceholders(v, ctx));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substitutePlaceholders(v, ctx);
    }
    return result;
  }
  return value;
}
