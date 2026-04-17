// One-shot: backfill social_posts from past runs that produced proposals
// but never persisted them. Reads runs.output, extracts proposals, writes drafts.
//
// Usage: node backend/scripts/backfillDeliverables.mjs [--dry]

import { createClient } from '@supabase/supabase-js';
import { persistAgentDeliverables } from '../src/functions/persistDeliverables.js';

const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';

const dryRun = process.argv.includes('--dry');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: runs, error } = await supabase
    .from('runs')
    .select('id, client_id, agent_template_id, output, created_at, agent_templates(slug, name)')
    .gte('created_at', since)
    .in('status', ['partial', 'success', 'pending_approval'])
    .not('output', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to fetch runs:', error.message);
    process.exit(1);
  }

  console.log(`Found ${runs.length} recent runs to inspect`);

  let totalSocial = 0, totalCreatives = 0, totalRunsWithDeliverables = 0;

  for (const run of runs) {
    const slug = run.agent_templates?.slug || '';
    if (!/facebook|instagram|google.ads|content.distribution|social/i.test(slug)) continue;

    const output = run.output;
    if (!output || typeof output !== 'object') continue;

    const hasProposals = Array.isArray(output.proposals) && output.proposals.length > 0;
    const hasCreatives = Array.isArray(output.ad_creatives) || Array.isArray(output.creatives) || Array.isArray(output.ads);
    const hasVariants = Array.isArray(output.proposed_ad_variants) && output.proposed_ad_variants.length > 0;
    if (!hasProposals && !hasCreatives && !hasVariants) continue;

    if (dryRun) {
      console.log(`  DRY: run=${run.id} slug=${slug} proposals=${output.proposals?.length || 0} creatives=${(output.ad_creatives || output.creatives || output.ads || []).length} variants=${output.proposed_ad_variants?.length || 0}`);
      continue;
    }

    const fakeAgent = { slug };
    const result = await persistAgentDeliverables({
      supabase, agent: fakeAgent, clientId: run.client_id, runId: run.id, output,
    });

    if (result.social_posts > 0 || result.campaign_creatives > 0) {
      totalRunsWithDeliverables++;
      totalSocial += result.social_posts;
      totalCreatives += result.campaign_creatives;
      console.log(`  ✓ run=${run.id.slice(0,8)} slug=${slug} → social:${result.social_posts} creatives:${result.campaign_creatives}`);
    }
    if (result.errors.length > 0) {
      console.warn(`  ! run=${run.id.slice(0,8)} errors:`, result.errors.map(e => `${e.kind}:${e.message}`).join(', '));
    }
  }

  console.log('\n── SUMMARY ──');
  console.log(`Runs processed:           ${runs.length}`);
  console.log(`Runs w/ new deliverables: ${totalRunsWithDeliverables}`);
  console.log(`Social posts created:     ${totalSocial}`);
  console.log(`Ad creatives created:     ${totalCreatives}`);
}

main().catch(e => { console.error(e); process.exit(1); });
