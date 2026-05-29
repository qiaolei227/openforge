import { apiClient } from '@/lib/api-client';

/**
 * Shared cache + batching layer for resolving user UUIDs → display names.
 *
 * Backed by `POST /users/resolve` (sys:self gated). Use this anywhere UI shows
 * "who" alongside an audit-style timestamp (record system info, workflow logs,
 * etc.) — it batches concurrent lookups within a single tick into one network
 * call and remembers results for the lifetime of the page.
 *
 * Falls back to the UUID prefix when resolution fails (network error or unknown
 * id), so callers don't have to write retry/error UI for what is essentially a
 * cosmetic feature.
 */

interface ResolvedUser {
  id: string;
  username: string;
  displayName: string | null;
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

// In-flight batch: ids waiting on the next microtask flush.
let queue: { id: string; resolve: (name: string) => void }[] = [];
let scheduled = false;

function flush() {
  scheduled = false;
  const batch = queue;
  queue = [];
  if (batch.length === 0) return;

  const ids = Array.from(new Set(batch.map((b) => b.id)));
  apiClient
    .post<ResolvedUser[]>('/users/resolve', { ids })
    .then(({ data }) => {
      const byId = new Map<string, string>();
      for (const u of data) {
        const name = u.displayName || u.username || u.id;
        byId.set(u.id, name);
        cache.set(u.id, name);
      }
      for (const item of batch) {
        const name = byId.get(item.id) ?? fallback(item.id);
        // Even when the id is unknown, remember the fallback so we don't refetch.
        if (!cache.has(item.id)) cache.set(item.id, name);
        item.resolve(name);
      }
    })
    .catch(() => {
      for (const item of batch) {
        const name = fallback(item.id);
        item.resolve(name);
      }
    });
}

function fallback(id: string): string {
  return id.length >= 8 ? id.slice(0, 8) + '…' : id;
}

/**
 * Resolve a single user id. Coalesces with other concurrent calls — multiple
 * `resolveUserName` invocations on the same tick produce ONE network request.
 */
export function resolveUserName(
  id: string | null | undefined,
): Promise<string> {
  if (!id) return Promise.resolve('-');
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const p = new Promise<string>((resolve) => {
    queue.push({ id, resolve });
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  }).finally(() => {
    pending.delete(id);
  });
  pending.set(id, p);
  return p;
}

/**
 * Resolve many user ids at once. Returns a map from id to display name.
 * Cached ids are returned synchronously via the map; unknown ones share one
 * network round-trip.
 */
export async function resolveUserNames(
  ids: ReadonlyArray<string | null | undefined>,
): Promise<Record<string, string>> {
  const cleaned = Array.from(
    new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0)),
  );
  const results = await Promise.all(
    cleaned.map(async (id) => [id, await resolveUserName(id)] as const),
  );
  return Object.fromEntries(results);
}
