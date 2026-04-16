// ============================================================
// GT3 Phase 3 — CustomerOnboardingService
//
// Backfills / initializes a customer's profile:
//   - gt3_customers (name, domain, business_type, model, is_local)
//   - gt3_customer_services (primary + secondary)
//   - gt3_customer_locations (cities served)
//   - gt3_customer_conversions (with value_score)
//   - gt3_marketing_channels (default set based on business type + model)
//
// Two modes:
//   1. "initial" — when a new customer signs up
//   2. "refresh" — weekly refresh from site + GBP (to catch changes)
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';

// Default services per business type (fallback if crawler hasn't run yet)
const DEFAULT_SERVICES = {
  lawyer: [
    { service_name: 'divorce',          service_name_he: 'גירושין',         is_primary: true,  business_value_score: 10 },
    { service_name: 'child custody',    service_name_he: 'משמורת ילדים',    is_primary: true,  business_value_score: 9  },
    { service_name: 'alimony',          service_name_he: 'מזונות',          is_primary: true,  business_value_score: 8  },
    { service_name: 'inheritance',      service_name_he: 'ירושה',           is_primary: true,  business_value_score: 9  },
    { service_name: 'inheritance',      service_name_he: 'ירושות',          is_primary: true,  business_value_score: 9  },
    { service_name: 'will',             service_name_he: 'צוואה',           is_primary: false, business_value_score: 8  },
    { service_name: 'will',             service_name_he: 'צוואות',          is_primary: false, business_value_score: 8  },
    { service_name: 'family law',       service_name_he: 'דיני משפחה',      is_primary: true,  business_value_score: 9  },
    { service_name: 'prenup',           service_name_he: 'הסכם ממון',       is_primary: false, business_value_score: 7  },
    { service_name: 'guardianship',     service_name_he: 'אפוטרופוסות',     is_primary: false, business_value_score: 7  },
  ],
  consultant: [
    { service_name: 'mortgage',             service_name_he: 'משכנתא',          is_primary: true,  business_value_score: 10 },
    { service_name: 'mortgage advice',      service_name_he: 'ייעוץ משכנתא',    is_primary: true,  business_value_score: 10 },
    { service_name: 'mortgage advice',      service_name_he: 'יעוץ משכנתא',     is_primary: true,  business_value_score: 10 },
    { service_name: 'mortgage advisor',     service_name_he: 'יועץ משכנתאות', is_primary: true,  business_value_score: 10 },
    { service_name: 'refinance',            service_name_he: 'מחזור משכנתא',   is_primary: true,  business_value_score: 9  },
    { service_name: 'refinance',            service_name_he: 'מחזור',           is_primary: false, business_value_score: 7  },
    { service_name: 'financing',            service_name_he: 'מימון',           is_primary: false, business_value_score: 7  },
    { service_name: 'home loan',            service_name_he: 'הלוואה לדיור',    is_primary: false, business_value_score: 8  },
  ],
  plumber: [
    { service_name: 'blockage removal',  service_name_he: 'פתיחת סתימה',    is_primary: true, business_value_score: 10 },
    { service_name: 'leak repair',       service_name_he: 'תיקון נזילה',    is_primary: true, business_value_score: 9  },
    { service_name: 'emergency plumbing',service_name_he: 'אינסטלטור חירום',is_primary: true, business_value_score: 10 },
    { service_name: 'plumbing',          service_name_he: 'אינסטלציה',      is_primary: true, business_value_score: 8  },
  ],
  custom: [],
};

// Default conversions per business_model
const DEFAULT_CONVERSIONS = {
  local_lead_gen: [
    { conversion_type: 'phone_call',      is_primary: true,  value_score: 10 },
    { conversion_type: 'whatsapp_click',  is_primary: false, value_score: 8  },
    { conversion_type: 'contact_form',    is_primary: false, value_score: 7  },
    { conversion_type: 'directions_click',is_primary: false, value_score: 5  },
  ],
  national_lead_gen: [
    { conversion_type: 'phone_call',      is_primary: true,  value_score: 10 },
    { conversion_type: 'whatsapp_click',  is_primary: false, value_score: 8  },
    { conversion_type: 'contact_form',    is_primary: false, value_score: 8  },
    { conversion_type: 'calendar_booking',is_primary: false, value_score: 8  },
  ],
  ecommerce: [
    { conversion_type: 'checkout',        is_primary: true,  value_score: 10 },
    { conversion_type: 'email_signup',    is_primary: false, value_score: 3  },
  ],
  bookings: [
    { conversion_type: 'booking',         is_primary: true,  value_score: 10 },
    { conversion_type: 'calendar_booking',is_primary: false, value_score: 9  },
    { conversion_type: 'phone_call',      is_primary: false, value_score: 7  },
  ],
  personal_brand: [
    { conversion_type: 'email_signup',    is_primary: true,  value_score: 7  },
    { conversion_type: 'contact_form',    is_primary: false, value_score: 6  },
    { conversion_type: 'demo_request',    is_primary: false, value_score: 8  },
  ],
  subscriptions: [
    { conversion_type: 'checkout',        is_primary: true,  value_score: 10 },
    { conversion_type: 'email_signup',    is_primary: false, value_score: 4  },
  ],
  marketplace: [
    { conversion_type: 'booking',         is_primary: true,  value_score: 9  },
    { conversion_type: 'contact_form',    is_primary: false, value_score: 7  },
  ],
};

// Default channels per business_type
const DEFAULT_CHANNELS = {
  lawyer:     ['seo', 'local_seo', 'google_ads', 'meta_ads', 'organic_social'],
  plumber:    ['seo', 'local_seo', 'google_ads'],
  electrician:['seo', 'local_seo', 'google_ads'],
  locksmith:  ['seo', 'local_seo', 'google_ads'],
  musician:   ['seo', 'meta_ads', 'organic_social', 'youtube'],
  babysitter: ['seo', 'local_seo', 'meta_ads'],
  therapist:  ['seo', 'local_seo', 'google_ads', 'meta_ads'],
  dentist:    ['seo', 'local_seo', 'google_ads', 'meta_ads'],
  medical_clinic: ['seo', 'local_seo', 'google_ads', 'meta_ads'],
  realtor:    ['seo', 'local_seo', 'meta_ads', 'organic_social'],
  consultant: ['seo', 'google_ads', 'meta_ads', 'organic_social'],
  restaurant: ['seo', 'local_seo', 'meta_ads', 'organic_social'],
  ecommerce:  ['seo', 'google_ads', 'meta_ads'],
  custom:     ['seo'],
};

export async function ensureCustomerProfile(customerId, { refresh = false } = {}) {
  const sb = getGT3Supabase();
  const writes = {};

  const { data: customer, error: cErr } = await sb.from('gt3_customers')
    .select('*').eq('id', customerId).single();
  if (cErr || !customer) return svcResult({ ok: false, source: 'onboarding', errors: [cErr?.message || 'customer not found'] });

  // 1. Services — only seed if empty or refresh
  const { data: existingServices } = await sb.from('gt3_customer_services')
    .select('id').eq('customer_id', customerId);
  if (!existingServices?.length || refresh) {
    const defaults = DEFAULT_SERVICES[customer.business_type] || DEFAULT_SERVICES.custom;
    if (defaults.length > 0) {
      // Only insert ones that don't already exist (by service_name)
      const { data: existingRows } = await sb.from('gt3_customer_services')
        .select('service_name, service_name_he').eq('customer_id', customerId);
      const existingKeys = new Set((existingRows || []).map(r => (r.service_name_he || r.service_name).toLowerCase()));
      const toInsert = defaults
        .filter(s => !existingKeys.has((s.service_name_he || s.service_name).toLowerCase()))
        .map(s => ({ customer_id: customerId, ...s }));
      if (toInsert.length) {
        const { error } = await sb.from('gt3_customer_services').insert(toInsert);
        if (error) return svcResult({ ok: false, source: 'onboarding', errors: [`services: ${error.message}`] });
        writes.gt3_customer_services = toInsert.length;
      }
    }
  }

  // 2. Locations — for local businesses, ensure at least the inferred default
  if (customer.is_local_business) {
    const { data: existingLocs } = await sb.from('gt3_customer_locations')
      .select('id').eq('customer_id', customerId);
    if (!existingLocs?.length) {
      // Seed with Tel Aviv as a reasonable default for IL local businesses.
      // SiteCrawlerService will refine this.
      const { error } = await sb.from('gt3_customer_locations').insert({
        customer_id: customerId, country: 'IL', region: null, city: 'תל אביב',
        area_label: 'מרכז', is_primary: true,
      });
      if (!error) writes.gt3_customer_locations = 1;
    }
  }

  // 3. Conversions — seed defaults if missing
  const { data: existingConv } = await sb.from('gt3_customer_conversions')
    .select('id').eq('customer_id', customerId);
  if (!existingConv?.length) {
    const defaults = DEFAULT_CONVERSIONS[customer.business_model] || DEFAULT_CONVERSIONS.local_lead_gen;
    const rows = defaults.map(c => ({ customer_id: customerId, ...c }));
    const { error } = await sb.from('gt3_customer_conversions').insert(rows);
    if (!error) writes.gt3_customer_conversions = rows.length;
    else return svcResult({ ok: false, source: 'onboarding', errors: [`conversions: ${error.message}`] });
  }

  // 4. Marketing channels — ensure default set exists
  const defaultChannels = DEFAULT_CHANNELS[customer.business_type] || DEFAULT_CHANNELS.custom;
  const allowedChannels = defaultChannels
    .filter(ch => (ch !== 'local_seo' || customer.is_local_business)); // no local_seo for national
  const { data: existingChannels } = await sb.from('gt3_marketing_channels')
    .select('channel_type').eq('customer_id', customerId);
  const existingSet = new Set((existingChannels || []).map(r => r.channel_type));
  const toAdd = allowedChannels
    .filter(ch => !existingSet.has(ch))
    .map(ch => ({ customer_id: customerId, channel_type: ch, is_active: true }));
  if (toAdd.length) {
    const { error } = await sb.from('gt3_marketing_channels').insert(toAdd);
    if (!error) writes.gt3_marketing_channels = toAdd.length;
  }

  return svcResult({
    ok: true, source: 'onboarding',
    data: {
      customer_id: customerId,
      business_type: customer.business_type,
      business_model: customer.business_model,
      is_local_business: customer.is_local_business,
      services_seeded: writes.gt3_customer_services || 0,
      conversions_seeded: writes.gt3_customer_conversions || 0,
      channels_seeded: writes.gt3_marketing_channels || 0,
    },
    writes,
  });
}

// Batch: onboard all customers
export async function ensureAllCustomerProfiles() {
  const sb = getGT3Supabase();
  const { data: customers } = await sb.from('gt3_customers').select('id, name');
  const results = [];
  for (const c of customers || []) {
    const r = await ensureCustomerProfile(c.id);
    results.push({ customer: c.name, ...r });
  }
  return results;
}
