/**
 * P2.2 smoke seed — bootstraps the minimum data set for manually testing
 * the organization switcher + distributed-data flow.
 *
 * What it creates (idempotent — re-running is safe):
 *
 *   Orgs (1 root + 3 children):
 *     华夏实业 (root)        code: huaxia
 *     ├─ 上海分公司          code: sh
 *     ├─ 广州分公司          code: gz
 *     └─ 北京分公司          code: bj
 *
 *   Users:
 *     david / david123    (designer-identity; belongs to huaxia + sh + gz)
 *     biz_sh / biz123     (user-identity; belongs to sh only)
 *
 *   App: 演示系统           code: demo
 *   Model: 物料             code: material, dataScope=distributed, autoDistribute=true
 *   Fields:
 *     name        STRING  editable=false   (集团维护)
 *     spec        STRING  editable=false   (集团维护)
 *     local_code  STRING  editable=true    (下级本地编码)
 *     remark      STRING  editable=true    (下级备注)
 *
 *   Masters (3 records, created by admin in huaxia):
 *     钢板 Q235     / spec: 10x1500x3000  / local_code: '' / remark: ''
 *     铝合金 6061   / spec: T6-50x50      / local_code: '' / remark: ''
 *     铜管 T2       / spec: OD22x1.5      / local_code: '' / remark: ''
 *
 * With autoDistribute=true, each master auto-allocates to sh/gz/bj on create.
 *
 * Prerequisites:
 *   - Server must be running (default http://localhost:3000)
 *   - Admin account exists (admin / 123123 per memory reference_dev_credentials)
 *   - Phase 1 migration SQL already applied (run_phase1_additive.sql)
 *
 * Usage:
 *   pnpm --filter server seed:p2-2
 *
 * Reset:
 *   pnpm --filter server seed:p2-2:reset     # removes everything created above
 */

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.OPENFORGE_API_URL ?? 'http://localhost:3000';
const ADMIN_USER = process.env.OPENFORGE_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.OPENFORGE_ADMIN_PASS ?? '123123';

const prisma = new PrismaClient();

/* ─── Tiny HTTP client ────────────────────────────────────────────────── */

let accessToken: string | null = null;
let currentOrgId: string | null = null;

async function http<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: any,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (currentOrgId) headers['X-Current-Org-Id'] = currentOrgId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err: any = new Error(
      `${method} ${path} → ${res.status} ${data?.errorCode ?? ''} ${data?.message ?? ''}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

async function login(): Promise<void> {
  const res = await http<{ accessToken: string }>('POST', '/api/auth/login', {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  });
  accessToken = res.accessToken;
  console.log(`  ✓ logged in as ${ADMIN_USER}`);
}

/* ─── Idempotent helpers ──────────────────────────────────────────────── */

async function ensureOrg(opts: { name: string; code: string; parentId: string | null }) {
  const existing = await prisma.sysOrganization.findUnique({ where: { code: opts.code } });
  if (existing) return existing;
  const created = await http<any>('POST', '/api/orgs', opts);
  console.log(`  ✓ org "${opts.name}" (${opts.code})`);
  return created;
}

async function ensureUser(opts: {
  username: string;
  password: string;
  displayName: string;
  orgId: string;
  identity?: 'user' | 'designer';
  extraOrgIds?: string[];
}) {
  const existing = await prisma.sysUser.findUnique({ where: { username: opts.username } });
  if (existing) {
    // Ensure extra org bindings
    if (opts.extraOrgIds?.length) {
      for (const orgId of opts.extraOrgIds) {
        await prisma.sysUserOrg.upsert({
          where: { userId_orgId: { userId: existing.id, orgId } },
          create: { userId: existing.id, orgId, isDefault: false },
          update: {},
        });
      }
    }
    return existing;
  }
  const created = await http<any>('POST', '/api/users', {
    username: opts.username,
    password: opts.password,
    displayName: opts.displayName,
    orgId: opts.orgId,
    identity: opts.identity ?? 'user',
  });
  if (opts.extraOrgIds?.length) {
    for (const orgId of opts.extraOrgIds) {
      await prisma.sysUserOrg.upsert({
        where: { userId_orgId: { userId: created.id, orgId } },
        create: { userId: created.id, orgId, isDefault: false },
        update: {},
      });
    }
  }
  console.log(`  ✓ user "${opts.username}" / ${opts.password}`);
  return created;
}

async function ensureApp(opts: { name: string; code: string }) {
  const existing = await prisma.sysApp.findUnique({ where: { code: opts.code } });
  if (existing) return existing;
  const created = await http<any>('POST', '/api/apps', {
    name: opts.name,
    code: opts.code,
    description: 'P2.2 smoke demo',
  });
  console.log(`  ✓ app "${opts.name}" (${opts.code})`);
  return created;
}

async function ensureModel(opts: {
  appId: string;
  name: string;
  code: string;
  dataScope: 'private' | 'shared' | 'distributed';
}) {
  const existing = await prisma.sysModel.findFirst({
    where: { code: opts.code, appId: opts.appId },
  });
  if (existing) return existing;
  const created = await http<any>('POST', '/api/models', {
    appId: opts.appId,
    name: opts.name,
    code: opts.code,
    dataScope: opts.dataScope,
  });
  console.log(`  ✓ model "${opts.name}" (${opts.code}, ${opts.dataScope})`);
  return created;
}

async function ensureField(opts: {
  modelId: string;
  name: string;
  columnName: string;
  fieldType: string;
  isRequired?: boolean;
}) {
  const existing = await prisma.sysField.findFirst({
    where: { modelId: opts.modelId, columnName: opts.columnName },
  });
  if (existing) return existing;
  const created = await http<any>('POST', `/api/models/${opts.modelId}/fields`, {
    name: opts.name,
    columnName: opts.columnName,
    fieldType: opts.fieldType,
    isRequired: opts.isRequired ?? false,
  });
  console.log(`  ✓ field "${opts.name}" (${opts.columnName} ${opts.fieldType})`);
  return created;
}

async function setDistributionPolicy(modelId: string, policies: Array<{ fieldId: string; editable: boolean }>) {
  await http<any>('PUT', `/api/models/${modelId}/distribution-policies`, policies);
  console.log(`  ✓ distribution policy applied (${policies.length} fields)`);
}

async function setAutoDistribute(modelId: string, value: boolean) {
  await http<any>('PUT', `/api/models/${modelId}`, { autoDistribute: value });
  console.log(`  ✓ autoDistribute = ${value}`);
}

async function ensureMaster(appCode: string, modelCode: string, data: Record<string, any>, uniqueBy: string) {
  // Look up existing by a unique-ish column (we use 'name' by default)
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM biz."${appCode}_${modelCode}" WHERE master_id = id AND "${uniqueBy}" = $1 LIMIT 1`,
    data[uniqueBy],
  );
  if (existing.length > 0) {
    console.log(`  ~ master "${data[uniqueBy]}" exists (${existing[0].id.slice(0, 8)}…)`);
    return existing[0];
  }
  const created = await http<any>('POST', `/api/apps/${appCode}/models/${modelCode}/data`, data);
  console.log(`  ✓ master "${data[uniqueBy]}" → ${created.id.slice(0, 8)}…`);
  return created;
}

/* ─── Main ────────────────────────────────────────────────────────────── */

async function seed() {
  console.log('\n━━ P2.2 smoke seed ━━\n');

  console.log('● login');
  await login();

  console.log('\n● organizations');
  const huaxia = await ensureOrg({ name: '华夏实业', code: 'huaxia', parentId: null });
  const sh = await ensureOrg({ name: '上海分公司', code: 'sh', parentId: huaxia.id });
  const gz = await ensureOrg({ name: '广州分公司', code: 'gz', parentId: huaxia.id });
  const bj = await ensureOrg({ name: '北京分公司', code: 'bj', parentId: huaxia.id });

  console.log('\n● users');
  await ensureUser({
    username: 'david',
    password: 'david123',
    displayName: 'David (Designer)',
    orgId: huaxia.id,
    identity: 'designer',
    extraOrgIds: [sh.id, gz.id],
  });
  await ensureUser({
    username: 'biz_sh',
    password: 'biz123',
    displayName: '上海业务员',
    orgId: sh.id,
    identity: 'user',
  });

  console.log('\n● app + model');
  const app = await ensureApp({ name: '演示系统', code: 'demo' });
  // Set current org to root so create operations go through root-org guard
  currentOrgId = huaxia.id;

  const model = await ensureModel({
    appId: app.id,
    name: '物料',
    code: 'material',
    dataScope: 'distributed',
  });

  console.log('\n● fields');
  const fName = await ensureField({ modelId: model.id, name: '物料名称', columnName: 'name', fieldType: 'STRING', isRequired: true });
  const fSpec = await ensureField({ modelId: model.id, name: '规格', columnName: 'spec', fieldType: 'STRING' });
  const fLocalCode = await ensureField({ modelId: model.id, name: '本地编码', columnName: 'local_code', fieldType: 'STRING' });
  const fRemark = await ensureField({ modelId: model.id, name: '备注', columnName: 'remark', fieldType: 'STRING' });

  console.log('\n● distribution policy');
  await setDistributionPolicy(model.id, [
    { fieldId: fName.id, editable: false },
    { fieldId: fSpec.id, editable: false },
    { fieldId: fLocalCode.id, editable: true },
    { fieldId: fRemark.id, editable: true },
  ]);

  console.log('\n● auto-distribute ON');
  await setAutoDistribute(model.id, true);

  console.log('\n● master records (auto-distributed to sub-orgs via autoDistribute=true)');
  await ensureMaster('demo', 'material', { name: '钢板 Q235', spec: '10x1500x3000' }, 'name');
  await ensureMaster('demo', 'material', { name: '铝合金 6061', spec: 'T6-50x50' }, 'name');
  await ensureMaster('demo', 'material', { name: '铜管 T2', spec: 'OD22x1.5' }, 'name');

  console.log('\n━━ seed complete ━━\n');
  console.log('Login options for smoke testing:');
  console.log('  admin / 123123       — platform admin');
  console.log('  david / david123     — designer, belongs to 华夏实业 + 上海 + 广州 (multi-org switcher visible)');
  console.log('  biz_sh / biz123      — regular user, sub-org only (will see copies, not master)');
  console.log('\nRecommended smoke flow:');
  console.log('  1. Login as david → top bar shows OrgSwitcher (3 orgs)');
  console.log('  2. In 华夏实业: open 演示系统 → 物料 list → see 3 masters');
  console.log('  3. Switch to 上海分公司: see 3 copies, readonly fields (name/spec) locked');
  console.log('  4. Edit remark on 钢板 copy → save → OK');
  console.log('  5. Switch back to 华夏实业: edit 钢板 spec → save → sub-org copy spec updates too');
  console.log('  6. Open 钢板 master detail → "同步" tab → Force Push "remark" field with phrase 强制覆盖');
  console.log('  7. Designer: open 物料 model detail → 分配策略 tab → toggle local_code editable → warning dialog');
  console.log('');
}

async function reset() {
  console.log('\n━━ P2.2 smoke reset ━━\n');

  console.log('● login');
  await login();

  // Use Prisma to clean up in safe order. The ddl-manager will drop the biz table
  // when we delete the model via API.
  const app = await prisma.sysApp.findUnique({ where: { code: 'demo' } });
  if (app) {
    const model = await prisma.sysModel.findFirst({ where: { code: 'material', appId: app.id } });
    if (model) {
      try {
        await http('DELETE', `/api/models/${model.id}`);
        console.log(`  ✓ deleted model "物料" + biz table + distribution_log entries for this model`);
      } catch (e: any) {
        console.log(`  ! model delete failed (${e.message}) — will clean via Prisma`);
        await prisma.sysDistributionLog.deleteMany({ where: { modelId: model.id } });
        await prisma.sysModel.delete({ where: { id: model.id } });
      }
    }
    try {
      await http('DELETE', `/api/apps/${app.id}`);
      console.log(`  ✓ deleted app "演示系统"`);
    } catch (e: any) {
      console.log(`  ! app delete failed (${e.message}); skipping`);
    }
  }

  // Users
  for (const username of ['biz_sh', 'david']) {
    const u = await prisma.sysUser.findUnique({ where: { username } });
    if (u) {
      await prisma.sysUserOrg.deleteMany({ where: { userId: u.id } });
      await prisma.sysUserRole.deleteMany({ where: { userId: u.id } });
      await prisma.sysUser.delete({ where: { id: u.id } });
      console.log(`  ✓ deleted user ${username}`);
    }
  }

  // Orgs (children first, then root — children don't block via API if empty)
  for (const code of ['sh', 'gz', 'bj', 'huaxia']) {
    const org = await prisma.sysOrganization.findUnique({ where: { code } });
    if (!org) continue;
    try {
      await http('DELETE', `/api/orgs/${org.id}`);
      console.log(`  ✓ deleted org ${code}`);
    } catch (e: any) {
      console.log(`  ! org ${code} delete failed (${e.message}); may have been the root with admin still attached`);
    }
  }

  console.log('\n━━ reset complete ━━\n');
}

async function main() {
  const mode = process.argv[2];
  try {
    if (mode === 'reset') {
      await reset();
    } else {
      await seed();
    }
  } catch (e: any) {
    console.error('\n❌ seed failed:', e.message);
    if (e.body) console.error('   body:', JSON.stringify(e.body, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
