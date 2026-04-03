// ============================================================
// AI GROWTH OS — MAGIC LINK BACKEND
// Create links, validate tokens, handle submissions,
// encrypt credentials, notify admin
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// ============================================================
// ENCRYPTION — for storing client credentials safely
// ============================================================
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex') };
}

function decrypt(encryptedText, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================
// CREATE SETUP LINK
// ============================================================
export async function createSetupLink(clientId, options = {}) {
  const {
    requestedConnectors = [],     // which connectors to ask for
    customMessage = null,
    customMessageHe = null,
    language = 'he',
    notifyEmail = null,
    clientEmail = null,
    clientName = null,
    expiryDays = 14
  } = options;

  // Verify client exists
  const { data: client } = await supabase.from('clients').select('id, name').eq('id', clientId).single();
  if (!client) throw new Error('Client not found');

  // Check if connectors requested are valid
  if (requestedConnectors.length > 0) {
    const { data: validConnectors } = await supabase
      .from('connector_definitions')
      .select('slug')
      .in('slug', requestedConnectors);
    const validSlugs = validConnectors?.map(c => c.slug) || [];
    const invalid = requestedConnectors.filter(s => !validSlugs.includes(s));
    if (invalid.length > 0) throw new Error(`Invalid connector slugs: ${invalid.join(', ')}`);
  }

  // Cancel any existing pending links for this client
  await supabase.from('setup_links')
    .update({ status: 'cancelled' })
    .eq('client_id', clientId)
    .eq('status', 'pending');

  // Create new link
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const { data: link, error } = await supabase.from('setup_links').insert({
    client_id: clientId,
    requested_connectors: requestedConnectors,
    custom_message: customMessage,
    custom_message_he: customMessageHe,
    language,
    notify_email: notifyEmail,
    client_email: clientEmail,
    client_name: clientName || client.name,
    expires_at: expiresAt.toISOString(),
    status: 'pending'
  }).select().single();

  if (error) throw new Error(`Failed to create setup link: ${error.message}`);

  const setupUrl = `${APP_URL}/setup/${link.token}`;

  // Log to audit trail
  await supabase.from('audit_trail').insert({
    client_id: clientId,
    action_type: 'setup_link_created',
    triggered_by: 'admin',
    after_value: JSON.stringify({
      link_id: link.id,
      connectors: requestedConnectors,
      expires_at: expiresAt.toISOString(),
      client_name: clientName || client.name
    })
  });

  return {
    link_id: link.id,
    token: link.token,
    setup_url: setupUrl,
    expires_at: expiresAt.toISOString(),
    requested_connectors: requestedConnectors,
    client_name: clientName || client.name
  };
}

// ============================================================
// GET SETUP LINK BY TOKEN (for client-facing page)
// ============================================================
export async function getSetupLinkByToken(token) {
  const { data: link, error } = await supabase
    .from('setup_links')
    .select('*, clients(name, domain, client_profiles(language, rtl_required, brand_voice))')
    .eq('token', token)
    .single();

  if (error || !link) return { error: 'Link not found' };

  // Check expiry
  if (new Date(link.expires_at) < new Date()) {
    await supabase.from('setup_links').update({ status: 'expired' }).eq('id', link.id);
    return { error: 'This setup link has expired. Please contact your account manager.' };
  }

  if (link.status === 'cancelled') return { error: 'This setup link has been cancelled.' };
  if (link.status === 'completed') {
    return {
      completed: true,
      client_name: link.client_name || link.clients?.name,
      language: link.language
    };
  }

  // Record first open
  if (!link.first_opened_at) {
    await supabase.from('setup_links').update({ first_opened_at: new Date().toISOString(), status: 'in_progress' }).eq('id', link.id);
  }

  // Log event
  await supabase.from('setup_link_events').insert({
    setup_link_id: link.id,
    event_type: 'opened'
  });

  // Get connector definitions for requested connectors
  const { data: connectors } = await supabase
    .from('connector_definitions')
    .select('*')
    .in('slug', link.requested_connectors || [])
    .eq('is_active', true)
    .order('display_order');

  // Get existing submissions
  const { data: submissions } = await supabase
    .from('setup_submissions')
    .select('connector_slug, status, submission_type, meta, oauth_account_email')
    .eq('setup_link_id', link.id);

  const submissionMap = {};
  for (const sub of (submissions || [])) {
    submissionMap[sub.connector_slug] = sub;
  }

  return {
    link_id: link.id,
    token,
    client_name: link.client_name || link.clients?.name,
    language: link.language || 'he',
    rtl: link.language === 'he',
    custom_message: link.language === 'he' ? link.custom_message_he : link.custom_message,
    requested_connectors: link.requested_connectors || [],
    completed_connectors: link.completed_connectors || [],
    skipped_connectors: link.skipped_connectors || [],
    connectors: (connectors || []).map(c => ({
      ...c,
      submission: submissionMap[c.slug] || null,
      is_completed: (link.completed_connectors || []).includes(c.slug),
      is_skipped: (link.skipped_connectors || []).includes(c.slug)
    })),
    expires_at: link.expires_at,
    status: link.status
  };
}

// ============================================================
// SUBMIT CONNECTOR CREDENTIALS (from client)
// ============================================================
export async function submitConnectorCredentials(token, connectorSlug, submissionData) {
  const { data: link } = await supabase
    .from('setup_links')
    .select('id, client_id, requested_connectors, completed_connectors, skipped_connectors, notify_email, client_name')
    .eq('token', token)
    .single();

  if (!link) throw new Error('Invalid setup link');
  if (new Date() > new Date((await supabase.from('setup_links').select('expires_at').eq('id', link.id).single()).data?.expires_at)) {
    throw new Error('Setup link has expired');
  }

  // Validate connector is in requested list
  if (!link.requested_connectors.includes(connectorSlug)) {
    throw new Error('This connector was not requested for this setup');
  }

  const { type, data: credData, meta = {} } = submissionData;

  let encryptedData = null;
  let encryptionIv = null;

  // Encrypt sensitive data
  if (type !== 'skipped' && credData && Object.keys(credData).length > 0) {
    const { encrypted, iv } = encrypt(JSON.stringify(credData));
    encryptedData = encrypted;
    encryptionIv = iv;
  }

  // Upsert submission
  const { data: submission, error: subErr } = await supabase
    .from('setup_submissions')
    .upsert({
      setup_link_id: link.id,
      client_id: link.client_id,
      connector_slug: connectorSlug,
      submission_type: type || 'credentials',
      encrypted_data: encryptedData,
      encryption_iv: encryptionIv,
      meta: meta,
      oauth_account_email: meta?.account_email || null,
      oauth_scope_granted: meta?.scopes || null,
      status: type === 'skipped' ? 'skipped' : 'connected',
      submitted_at: new Date().toISOString(),
      verified_at: new Date().toISOString()
    }, { onConflict: 'setup_link_id,connector_slug' })
    .select().single();

  if (subErr) throw new Error(`Failed to save submission: ${subErr.message}`);

  // Update completed/skipped arrays
  const completed = [...(link.completed_connectors || [])];
  const skipped = [...(link.skipped_connectors || [])];

  if (type === 'skipped') {
    if (!skipped.includes(connectorSlug)) skipped.push(connectorSlug);
  } else {
    if (!completed.includes(connectorSlug)) completed.push(connectorSlug);
    const skipIdx = skipped.indexOf(connectorSlug);
    if (skipIdx > -1) skipped.splice(skipIdx, 1);
  }

  await supabase.from('setup_links').update({
    completed_connectors: completed,
    skipped_connectors: skipped,
    last_activity_at: new Date().toISOString()
  }).eq('id', link.id);

  // Log event
  await supabase.from('setup_link_events').insert({
    setup_link_id: link.id,
    event_type: type === 'skipped' ? 'connector_skipped' : 'connector_completed',
    connector_slug: connectorSlug,
    metadata: { meta, type }
  });

  // Check if all requested connectors are done
  const allDone = link.requested_connectors.every(s =>
    completed.includes(s) || skipped.includes(s)
  );

  if (allDone) {
    await supabase.from('setup_links').update({
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', link.id);

    // Copy verified credentials to client_credentials table (decrypted for system use)
    await syncSubmissionsToClientCredentials(link.id, link.client_id);

    // Send notification to admin
    if (link.notify_email) {
      await sendCompletionNotification(link.notify_email, link.client_name, completed, skipped);
    }

    // Audit
    await supabase.from('audit_trail').insert({
      client_id: link.client_id,
      action_type: 'setup_link_completed',
      triggered_by: 'client',
      after_value: JSON.stringify({ completed, skipped, link_id: link.id })
    });
  }

  return {
    success: true,
    connector: connectorSlug,
    status: type === 'skipped' ? 'skipped' : 'connected',
    all_done: allDone,
    completed_count: completed.length,
    total_count: link.requested_connectors.length
  };
}

// ============================================================
// SYNC SUBMISSIONS → CLIENT_CREDENTIALS (after completion)
// ============================================================
async function syncSubmissionsToClientCredentials(setupLinkId, clientId) {
  const { data: submissions } = await supabase
    .from('setup_submissions')
    .select('*')
    .eq('setup_link_id', setupLinkId)
    .eq('status', 'connected');

  for (const sub of (submissions || [])) {
    let credentialData = {};
    if (sub.encrypted_data && sub.encryption_iv) {
      try {
        credentialData = JSON.parse(decrypt(sub.encrypted_data, sub.encryption_iv));
      } catch (e) {
        console.error(`Failed to decrypt submission ${sub.id}:`, e.message);
        continue;
      }
    }

    await supabase.from('client_credentials').upsert({
      client_id: clientId,
      service: sub.connector_slug,
      label: sub.connector_slug.replace(/_/g, ' '),
      credential_data: credentialData,
      is_connected: true,
      last_checked: new Date().toISOString(),
      last_successful: new Date().toISOString(),
      health_score: 100,
      error: null
    }, { onConflict: 'client_id,service' });
  }
}

// ============================================================
// SEND COMPLETION NOTIFICATION (email to admin)
// ============================================================
async function sendCompletionNotification(toEmail, clientName, completed, skipped) {
  // In production: use Resend API
  // For now: log and store notification
  console.log(`[NOTIFY] ${clientName} completed setup. Connected: ${completed.join(', ')}. Skipped: ${skipped.join(', ')}`);

  // If Resend is configured:
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'AI Growth OS <notifications@elad.digital>',
          to: [toEmail],
          subject: `✓ ${clientName} — Setup Complete`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #1a1a2e;">✓ Client Setup Complete</h2>
              <p><strong>${clientName}</strong> has completed their onboarding setup.</p>
              <p><strong>Connected:</strong> ${completed.join(', ') || 'None'}</p>
              <p><strong>Skipped:</strong> ${skipped.join(', ') || 'None'}</p>
              <p>Log in to your dashboard to review and start running agents.</p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">Open Dashboard →</a>
            </div>
          `
        })
      });
      if (!res.ok) console.error('Resend error:', await res.text());
    } catch (e) {
      console.error('Failed to send completion email:', e.message);
    }
  }
}

// ============================================================
// GET DECRYPTED CREDENTIALS (server-side only)
// ============================================================
export async function getDecryptedCredentials(clientId, connectorSlug) {
  const { data: cred } = await supabase
    .from('client_credentials')
    .select('credential_data')
    .eq('client_id', clientId)
    .eq('service', connectorSlug)
    .eq('is_connected', true)
    .single();

  return cred?.credential_data || null;
}

// ============================================================
// GET ALL SETUP LINKS FOR A CLIENT
// ============================================================
export async function getSetupLinksForClient(clientId) {
  const { data } = await supabase
    .from('setup_links')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return data || [];
}

// ============================================================
// GET ALL SETUP LINKS (admin view)
// ============================================================
export async function getAllSetupLinks(filters = {}) {
  let query = supabase
    .from('setup_links')
    .select('*, clients(name, domain)')
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.clientId) query = query.eq('client_id', filters.clientId);

  const { data } = await query.limit(100);
  return data || [];
}

// ============================================================
// REVOKE SETUP LINK
// ============================================================
export async function revokeSetupLink(linkId) {
  const { data, error } = await supabase
    .from('setup_links')
    .update({ status: 'cancelled' })
    .eq('id', linkId)
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================================
// REGENERATE SETUP LINK (new token, extended expiry)
// ============================================================
export async function regenerateSetupLink(linkId) {
  const { data: existing } = await supabase.from('setup_links').select('*').eq('id', linkId).single();
  if (!existing) throw new Error('Link not found');

  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + 14);

  const newToken = crypto.randomBytes(32).toString('hex');

  const { data, error } = await supabase.from('setup_links').update({
    token: newToken,
    status: 'pending',
    expires_at: newExpiry.toISOString(),
    completed_connectors: existing.completed_connectors || [],
    completed_at: null
  }).eq('id', linkId).select().single();

  if (error) throw new Error(error.message);

  return {
    ...data,
    setup_url: `${APP_URL}/setup/${newToken}`
  };
}

// ============================================================
// GET CONNECTOR DEFINITIONS
// ============================================================
export async function getConnectorDefinitions(slugs = null) {
  let query = supabase.from('connector_definitions').select('*').eq('is_active', true).order('display_order');
  if (slugs?.length > 0) query = query.in('slug', slugs);
  const { data } = await query;
  return data || [];
}
