// One-shot cleanup for System Audit / Verification issues that keep recurring.
// Dedupes credential incidents; clears stale failed queue items.
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const YANIV = '00000000-0000-0000-0000-000000000001';
const HOMIE = '528107d8-6b18-4675-8469-32e648589614';

function serviceKeyOf(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('search console') || t.includes('gsc')) return 'gsc';
  if (t.includes('google ads')) return 'google_ads';
  if (t.includes('google analytics') || t.includes('ga4')) return 'ga4';
  if (t.includes('business profile') || t.includes('gbp')) return 'gbp';
  if (t.includes('instagram')) return 'instagram';
  if (t.includes('facebook')) return 'facebook';
  return null;
}

async function dedupeCriticalIncidents(clientId, name) {
  const { data: critInc } = await s.from('incidents')
    .select('id, title, category, created_at')
    .eq('client_id', clientId).eq('status', 'open').eq('severity', 'critical');

  const groups = {};
  (critInc || []).forEach(i => {
    const k = serviceKeyOf(i.title);
    if (!k) return;
    if (!groups[k]) groups[k] = [];
    groups[k].push(i);
  });

  let resolved = 0;
  for (const [service, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const keep = list[0];
    const close = list.slice(1);
    console.log(`[${name}] ${service}: keeping "${keep.title.slice(0, 60)}", closing ${close.length} dupe(s)`);
    const ids = close.map(c => c.id);
    await s.from('incidents').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_notes: `Duplicate of incident ${keep.id} — auto-merged`,
    }).in('id', ids);
    resolved += ids.length;
  }
  return resolved;
}

async function clearFailedQueue(clientId, name) {
  const { count } = await s.from('run_queue')
    .delete({ count: 'exact' })
    .eq('client_id', clientId).eq('status', 'failed');
  console.log(`[${name}] Cleared ${count} failed queue items`);
  return count || 0;
}

const yanivDedup = await dedupeCriticalIncidents(YANIV, 'YANIV');
const homieDedup = await dedupeCriticalIncidents(HOMIE, 'HOMIE');
const yanivQ = await clearFailedQueue(YANIV, 'YANIV');
const homieQ = await clearFailedQueue(HOMIE, 'HOMIE');

// Report state
const { count: yanivCritNow } = await s.from('incidents').select('id', { count: 'exact', head: true })
  .eq('client_id', YANIV).eq('status', 'open').eq('severity', 'critical');
const { count: homieCritNow } = await s.from('incidents').select('id', { count: 'exact', head: true })
  .eq('client_id', HOMIE).eq('status', 'open').eq('severity', 'critical');

console.log('\n=== RESULT ===');
console.log(`Duplicates resolved: ${yanivDedup + homieDedup} (Yaniv ${yanivDedup}, Homie ${homieDedup})`);
console.log(`Failed queue cleared: ${yanivQ + homieQ} (Yaniv ${yanivQ}, Homie ${homieQ})`);
console.log(`Critical incidents remaining: Yaniv ${yanivCritNow}, Homie ${homieCritNow}`);
