#!/usr/bin/env node
// Full proactive system audit — instead of finding bugs one-at-a-time, sweep
// every known failure class and report findings ranked by impact.
//
// Categories checked:
//   A. Silent data-drift  (counter columns that disagree with source-of-truth)
//   B. Dead code paths    (RPCs called from JS that don't exist in migrations)
//   C. Orphaned rows      (FK-like references pointing at nothing)
//   D. Failed preflights  (agents blocked by missing credentials / integrations)
//   E. Zero-progress runs (tokens_used=0 for >30 min, i.e. dead at cold start)
//   F. Integration gaps   (OAuth'd but discovery returned 0 assets)
//   G. Asset selection    (integrations with no selected_asset_id set)
//   H. Tables referenced in code but missing from schema
//   I. Stale baselines    (metric values not refreshed in >7 days)
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const findings = [];
const add = (severity, category, title, detail) => findings.push({ severity, category, title, detail });

const SEV = { critical: 0, high: 1, medium: 2, low: 3 };

// Helper: list all tables in the public schema
async function listTables() {
  const { data } = await sb.rpc('pg_tables_in_public').catch(() => ({ data: null }));
  if (data) return data;
  // Fallback: try a well-known set
  return null;
}

// ── A. Data drift — counter columns vs ground truth ────────────
console.log('[A] Counter-column drift check...');
{
  // run_count drift across all clients
  const { data: assignments } = await sb.from('client_agent_assignments')
    .select('client_id, agent_template_id, run_count, last_run_at');
  let drifted = 0;
  for (const a of (assignments || [])) {
    const { count: actual } = await sb.from('runs')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', a.client_id)
      .eq('agent_template_id', a.agent_template_id);
    if ((actual || 0) !== (a.run_count || 0)) drifted++;
  }
  if (drifted > 0) add('medium', 'A.drift', `${drifted}/${assignments.length} assignments have run_count drift`,
    'Dashboard counters will be inaccurate until next run triggers a bump.');
  else console.log('  ✓ all counters match');
}

// ── B. RPC calls from JS that don't exist in DB ────────────────
console.log('[B] Dead RPC references...');
{
  const { execSync } = await import('child_process');
  const rpcCalls = execSync(
    "grep -rEn \"supabase\\.rpc\\('([a-zA-Z_]+)'\" backend/src --include='*.js' | sed -E \"s/.*supabase\\.rpc\\('([^']+)'.*/\\1/\" | sort -u",
    { encoding: 'utf8' }
  ).split('\n').filter(Boolean);
  // Collect all function names defined in migrations
  const migDir = 'supabase/migrations';
  const allSql = readdirSync(migDir).filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(migDir, f), 'utf8')).join('\n');
  const defined = new Set();
  for (const m of allSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
    defined.add(m[1].toLowerCase());
  }
  const missing = rpcCalls.filter(r => !defined.has(r.toLowerCase()));
  if (missing.length) {
    add('high', 'B.dead_rpc', `${missing.length} RPC(s) called from JS but not defined in any migration`,
      missing.join(', '));
  } else {
    console.log(`  ✓ all ${rpcCalls.length} RPCs have migrations`);
  }
}

// ── C. Orphaned FK-like references ─────────────────────────────
console.log('[C] Orphan FK check...');
{
  // runs.queue_item_id -> run_queue.id
  const { data: orphanQ } = await sb.from('runs')
    .select('id, queue_item_id')
    .not('queue_item_id', 'is', null)
    .limit(1000);
  let orphans = 0;
  for (const r of (orphanQ || [])) {
    const { data } = await sb.from('run_queue').select('id').eq('id', r.queue_item_id).maybeSingle();
    if (!data) orphans++;
  }
  if (orphans) add('low', 'C.orphan', `${orphans} runs point at a nonexistent run_queue item`, 'Likely historical — queue item was cleaned up.');
  else console.log('  ✓ no queue orphans');
}

// ── D. Preflight failures across active clients ────────────────
console.log('[D] Preflight failures (last 7 days)...');
{
  const { data: events } = await sb.from('agent_events')
    .select('client_id, agent_slug, message, created_at')
    .eq('event_type', 'blocked')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(500);
  const byReason = {};
  for (const e of (events || [])) {
    const reason = (e.message || '').replace(/^Preflight failed:\s*/, '');
    const key = `${e.client_id}:${e.agent_slug}:${reason}`;
    byReason[key] = (byReason[key] || 0) + 1;
  }
  const top = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) {
    add('high', 'D.preflight', `${events.length} preflight-blocked events in last 7d`,
      top.map(([k, n]) => `${n}× ${k}`).join('\n   '));
  } else console.log('  ✓ no preflight blocks');
}

// ── E. Zero-progress runs ──────────────────────────────────────
console.log('[E] Zero-progress runs...');
{
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: dead } = await sb.from('runs')
    .select('id, agent_template_id, status, error')
    .in('status', ['failed', 'running'])
    .eq('tokens_used', 0)
    .lt('updated_at', cutoff)
    .gte('created_at', weekAgo)
    .limit(500);
  if (dead?.length) {
    add('medium', 'E.zero_progress', `${dead.length} zero-token runs in last 7d (agents died at cold start)`,
      `Root cause: MAX_CONCURRENT was 20 on a 300s Vercel function. Fix landed in ce1fd9f, should stop accumulating.`);
  } else console.log('  ✓ no zero-token dead runs');
}

// ── F. OAuth'd but empty discovery ─────────────────────────────
console.log('[F] OAuth without discovered assets...');
{
  const { data: integ } = await sb.from('client_integrations')
    .select('client_id, provider, sub_provider, status, discovery_summary, last_error, selected_asset_id');
  const problems = [];
  for (const i of (integ || [])) {
    const summary = i.discovery_summary || {};
    if (i.status === 'limited') {
      problems.push(`${i.provider}/${i.sub_provider}: status=limited — ${summary.error?.slice(0, 100) || 'unknown'}`);
    } else if (i.status === 'connected' && summary.count === 0) {
      problems.push(`${i.provider}/${i.sub_provider}: connected but 0 assets found — ${summary.label || ''}`);
    } else if (i.status === 'connected' && summary.pages_found === 0 && summary.instagram_found === 0) {
      problems.push(`${i.provider}/${i.sub_provider}: connected but 0 pages & 0 IG accounts`);
    }
  }
  if (problems.length) {
    add('critical', 'F.empty_integration',
      `${problems.length} integration(s) are OAuth'd but yield no usable assets`,
      problems.join('\n   '));
  } else console.log('  ✓ all integrations have assets');
}

// ── G. Integrations with no selected_asset_id ──────────────────
console.log('[G] Integrations without selected_asset_id...');
{
  const { data: integ } = await sb.from('client_integrations')
    .select('client_id, provider, sub_provider, status, selected_asset_id, discovery_summary');
  const unselected = (integ || []).filter(i =>
    i.status === 'connected' &&
    !i.selected_asset_id &&
    (i.discovery_summary?.count > 1 || i.discovery_summary?.pages_found > 1)
  );
  if (unselected.length) {
    add('high', 'G.no_asset',
      `${unselected.length} connected integration(s) have no selected_asset_id`,
      unselected.map(i => `${i.provider}/${i.sub_provider}: ${i.discovery_summary?.label || '?'}`).join('\n   '));
  } else console.log('  ✓ all integrations have asset selection (where required)');
}

// ── H. Tables referenced in code but missing from schema ───────
console.log('[H] Tables missing from schema...');
{
  const { execSync } = await import('child_process');
  const tableNames = execSync(
    "grep -rhE \"\\.from\\('([a-zA-Z_]+)'\\)\" backend/src --include='*.js' | sed -E \"s/.*\\.from\\('([^']+)'\\).*/\\1/\" | sort -u",
    { encoding: 'utf8' }
  ).split('\n').filter(Boolean);
  const missing = [];
  for (const t of tableNames) {
    const { error } = await sb.from(t).select('*').limit(0);
    if (error && /not.*find/i.test(error.message)) missing.push(t);
  }
  if (missing.length) {
    add('critical', 'H.missing_table',
      `${missing.length} table(s) referenced in backend code but absent from schema`,
      missing.join(', '));
  } else console.log(`  ✓ all ${tableNames.length} referenced tables exist`);
}

// ── I. Stale metric baselines ──────────────────────────────────
console.log('[I] Stale metric baselines (>7d)...');
{
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: clients } = await sb.from('clients').select('id, name');
  const stale = [];
  for (const c of (clients || [])) {
    const { data: bases } = await sb.from('metric_baselines')
      .select('metric_name, metric_value, updated_at')
      .eq('client_id', c.id);
    for (const b of (bases || [])) {
      if (!b.updated_at || new Date(b.updated_at) < new Date(cutoff)) {
        const days = b.updated_at
          ? Math.floor((Date.now() - new Date(b.updated_at).getTime()) / 86400000)
          : 999;
        stale.push(`${c.name}/${b.metric_name}: ${days}d old (val=${b.metric_value})`);
      }
    }
  }
  if (stale.length) {
    add('medium', 'I.stale_baseline',
      `${stale.length} metric baselines not updated in >7 days`,
      stale.slice(0, 15).join('\n   '));
  } else console.log('  ✓ all baselines fresh');
}

// ── Print report ───────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('AUDIT RESULTS');
console.log('='.repeat(70));

findings.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
if (!findings.length) {
  console.log('\n✓ No issues found.\n');
  process.exit(0);
}
for (const f of findings) {
  const marker = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[f.severity];
  console.log(`\n${marker} [${f.severity.toUpperCase()}] ${f.category}  ${f.title}`);
  console.log(`   ${f.detail.split('\n').join('\n   ')}`);
}
console.log('\n' + '='.repeat(70));
console.log(`TOTAL: ${findings.length} findings  (${findings.filter(f => f.severity === 'critical').length} critical, ${findings.filter(f => f.severity === 'high').length} high)`);
