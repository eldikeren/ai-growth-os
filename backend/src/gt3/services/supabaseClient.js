// Shared Supabase client for GT3 services
import { createClient } from '@supabase/supabase-js';

export function getGT3Supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('GT3: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  return createClient(url, key);
}

// Result envelope for every service — same truth model as tool envelopes
export function svcResult({ ok = true, source, data = {}, writes = {}, errors = [], warnings = [] }) {
  return {
    ok,
    source,
    ran_at: new Date().toISOString(),
    data,
    writes,       // { table_name: rows_affected }
    errors,
    warnings,
  };
}
