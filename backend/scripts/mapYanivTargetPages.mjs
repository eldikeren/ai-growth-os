// Maps each Yaniv ranking keyword to the most appropriate target_page on yanivgil.co.il.
// Idempotent: only updates rows where target_page is NULL or changed.
// Strategy: Hebrew keyword substrings → canonical page slug (hand-curated from real Yaniv pages).
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const DRY = process.env.DRY_RUN === '1';
const YANIV = '00000000-0000-0000-0000-000000000001';
const BASE = 'https://www.yanivgil.co.il';

// Ordered rules: first match wins (more specific patterns first)
const RULES = [
  // ───── BANKRUPTCY ─────
  [/פשיטת\s*רגל|פש"ר|חדלות\s*פרעון|הפטר|חובות/, '/bankruptcy'],

  // ───── INHERITANCE & WILLS ─────
  [/צוואה|עריכת\s*צוואה|עריכת\s*צוואות/, '/will-writing'],
  [/ירושה\s*ללא\s*צוואה|חלוקת\s*ירושה/, '/inheritance-order'],
  [/ירושה\s*בינלאומית/, '/yerusha-beinleumit'],
  [/ירושה|יורש|ירושות|עיזבון|עזבון/, '/inheritance-wills'],

  // ───── CHILD SUPPORT (mezonot yeladim) ─────
  [/מזונות\s*ילדים|מזונות\s*ילד|מזונות\s*קטין/, '/mezonot-yeladim'],
  [/דמי\s*מזונות|גובה\s*(ה)?מזונות|חישוב\s*מזונות/, '/chishov-mezonot-yeladim'],
  [/הגדלת\s*מזונות/, '/hagdalat-mezonot-yeladim'],
  [/הפחתת\s*מזונות|הפחת\s*מזונות/, '/hafchatat-mezonot-yeladim'],
  [/עורך[\s-]?דין\s*מזונות/, '/mezonot-yeladim'],
  [/מזונות\s*אישה|מזונות\s*אשה/, '/mezonot-isha'],
  [/ביטול\s*מזונות/, '/bitul-mezonot-isha'],
  [/מזונות/, '/mezonot-yeladim'],

  // ───── DIVORCE / GET ─────
  [/סרבנות\s*גט|סרבן\s*גט/, '/igun-sarvanut-get'],
  [/הסכם\s*גירושין|הסכמי\s*גירושין/, '/heskem-gerushin'],
  [/גירושין\s*בהסכמה|גירושין\s*בהסכמת/, '/gerushin-behaskama-beit-din'],
  [/חלוקת\s*רכוש.*(גירוש|גרושין)?|חלוקת\s*נכסים/, '/chalokat-rechush-gerushin'],
  [/חלוקת\s*דירה|דירה.*(גירוש|גרושין)/, '/chalokat-dira-gerushin'],
  [/חלוקת\s*עסק|עסק.*(גירוש|גרושין)/, '/chalokat-esek-gerushin'],
  [/חלוקת\s*פנסיה|פנסיה.*(גירוש|גרושין)/, '/chalokat-pansiya-gerushin'],
  [/חלוקת\s*חובות|חובות.*(גירוש|גרושין)/, '/chalokat-hovot-gerushin'],
  [/זכויות\s*(ב|ל)?גירושין|זכויות\s*גרושים/, '/property-division'],
  [/גירושין\s*(בתל\s*אביב|תל[\s-]?אביב)/, '/od-gerushin-telaviv'],
  [/גירושין\s*הייטק|גרושין\s*הייטק/, '/gerushin-hightech'],
  [/עורך[\s-]?דין\s*גירושין\s*(תל[\s-]?אביב|בתל\s*אביב)/, '/divorce-lawyer-tel-aviv'],
  [/עורך[\s-]?דין\s*גירושין|עורכת[\s-]?דין\s*גירושין/, '/divorce-lawyer-tel-aviv'],
  [/גירושין|גירוש|גרושין|גרושים|גט\s*פיטורי|הליך\s*גירושין/, '/divorce'],

  // ───── PRENUP / HESKEM MAMON ─────
  [/הסכם\s*ממון|הסכמי\s*ממון/, '/heskem-mamon'],
  [/ביטול\s*הסכם\s*ממון/, '/bitul-heskem-mamon'],

  // ───── CUSTODY / MISHMORET ─────
  [/משמורת\s*(משותפת|יחידנית)/, '/mishmoret-meshuteft'],
  [/משמורת\s*ילדים|משמורת\s*ילד|משמורת/, '/mishmoret-yeladim'],
  [/עורך[\s-]?דין\s*משמורת/, '/child-custody'],
  [/זמני\s*שהות|הסדרי\s*ראיה/, '/zimnei-shehut-chaluka'],
  [/הגבלת\s*יציאה\s*מהארץ/, '/travel-restriction'],

  // ───── GUARDIANSHIP / POA ─────
  [/ייפוי\s*כוח\s*מתמשך/, '/guardianship'],
  [/אפוטרופוס|מינוי\s*אפוטרופוס/, '/guardianship'],

  // ───── FAMILY COURT / RABBINICAL COURT ─────
  [/בית\s*(ה)?משפט\s*לענייני\s*משפחה|בית\s*משפט\s*משפחה/, '/family-law'],
  [/בית\s*(ה)?דין\s*הרבני|בית\s*דין\s*רבני/, '/gerushin-beit-din-rabani'],

  // ───── LAWYER BRANDS / PRACTICE AREAS ─────
  [/עורך[\s-]?דין\s*משפחה\s*(תל[\s-]?אביב|בתל\s*אביב)/, '/divorce-lawyer-tel-aviv'],
  [/עורך[\s-]?דין\s*משפחה/, '/family-law'],
  [/עורך[\s-]?דין\s*ירושה\s*(תל[\s-]?אביב|בתל\s*אביב)/, '/inheritance-wills'],
  [/עורך[\s-]?דין\s*ירושה/, '/inheritance-wills'],
  [/עורך[\s-]?דין\s*צוואה|עורך[\s-]?דין\s*צוואות/, '/will-writing'],
  [/עורך[\s-]?דין\s*פשיטת\s*רגל|עורך[\s-]?דין\s*חדלות/, '/bankruptcy'],
  [/עורכת[\s-]?דין\s*משפחה/, '/family-law'],

  // ───── MISC SPECIFIC ─────
  [/אישה\s*עגונה|עגונה|עגונות/, '/agunut-ma-laasot'],
  [/ידועים\s*בציבור|ידועה\s*בציבור/, '/yaduyim-batzibur'],
  [/הוצאה\s*לפועל|עיקול/, '/execution'],
  [/הסכם\s*יוודעים|הסכם\s*ידועים\s*בציבור/, '/heskem-yaduyim-batzibur'],
  [/בלוג\s*משפטי|בלוג/, '/blog'],
];

function classify(keyword) {
  for (const [pat, slug] of RULES) {
    if (pat.test(keyword)) return slug;
  }
  return null;
}

const { data: kws, error } = await supabase
  .from('client_keywords')
  .select('id, keyword, volume, current_position, target_page, target_position')
  .eq('client_id', YANIV).eq('is_brand', false).eq('keyword_language', 'he')
  .order('volume', { ascending: false });
if (error) { console.error(error); process.exit(1); }

console.log(`Scanning ${kws.length} keywords…\n`);
let mapped = 0, unchanged = 0, nomatch = 0;
const unmatchedSamples = [];
const updates = [];

for (const k of kws) {
  const slug = classify(k.keyword);
  if (!slug) {
    nomatch++;
    if (unmatchedSamples.length < 20) unmatchedSamples.push(`vol=${k.volume}  pos=${k.current_position||'—'}  "${k.keyword}"`);
    continue;
  }
  const newTarget = `${BASE}${slug}`;
  if (k.target_page === newTarget) { unchanged++; continue; }
  updates.push({ id: k.id, keyword: k.keyword, from: k.target_page, to: newTarget, volume: k.volume, pos: k.current_position });
  mapped++;
}

console.log(`PLAN: map ${mapped}, unchanged ${unchanged}, no-match ${nomatch}\n`);
if (updates.length) {
  console.log(`First 15 planned updates:`);
  for (const u of updates.slice(0, 15)) console.log(`  vol=${String(u.volume).padStart(5)} pos=${String(u.pos||'—').padStart(4)}  "${u.keyword.slice(0, 40).padEnd(40)}"  →  ${u.to}`);
}
console.log(`\nUnmatched samples (${nomatch}):`);
for (const s of unmatchedSamples) console.log(`  ${s}`);

if (DRY) { console.log('\nDRY_RUN=1, not writing.'); process.exit(0); }

// Apply updates
console.log(`\nWriting ${updates.length} updates…`);
let ok = 0, fail = 0;
for (const u of updates) {
  const { error } = await supabase.from('client_keywords').update({ target_page: u.to }).eq('id', u.id);
  if (error) { fail++; console.error(`  fail ${u.id}: ${error.message}`); }
  else ok++;
}
console.log(`Done: ${ok} updated, ${fail} failed.`);
