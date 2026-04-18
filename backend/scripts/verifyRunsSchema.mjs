#!/usr/bin/env node
// Verify actual columns on the runs table
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get a single row to inspect its columns
const { data, error } = await sb.from('runs').select('*').limit(1).maybeSingle();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('Columns on runs table:');
console.log(Object.keys(data || {}).sort().join('\n'));

// Explicitly check tool_calls
console.log('\ntool_calls present?', 'tool_calls' in (data || {}));
