// Persist agent deliverables from output JSON into their real home tables.
// This is how Facebook proposals, Instagram posts, Google Ads creatives, etc.
// actually become visible in the UI instead of rotting in runs.output.

import crypto from 'crypto';

/**
 * Extract and save deliverables from an agent's output to the right tables.
 * Never throws — failures are logged and returned in the result so the agent
 * run still completes successfully even if persistence partially fails.
 */
export async function persistAgentDeliverables({ supabase, agent, clientId, runId, output }) {
  const result = { social_posts: 0, campaign_creatives: 0, content_drafts: 0, errors: [] };
  if (!output || typeof output !== 'object') return result;

  const agentSlug = agent?.slug || '';

  // ── 1. Social proposals (Facebook, Instagram, Content Distribution) ──
  const proposals = Array.isArray(output.proposals) ? output.proposals
    : Array.isArray(output.social_proposals) ? output.social_proposals
    : Array.isArray(output.posts) ? output.posts
    : [];

  if (proposals.length > 0 && /facebook|instagram|content.distribution|social|meta/i.test(agentSlug)) {
    const platform =
      /instagram/i.test(agentSlug) ? 'instagram' :
      /facebook/i.test(agentSlug) ? 'facebook' :
      'facebook'; // default

    for (const p of proposals) {
      try {
        if (!p || typeof p !== 'object') continue;
        const caption = p.caption || p.text || p.content || p.body || '';
        const title = p.topic || p.title || p.headline || caption.slice(0, 60);
        if (!caption && !title) continue;

        // Build full post content — caption + hashtags + CTA
        const hashtagStr = Array.isArray(p.hashtags) ? p.hashtags.join(' ') : (p.hashtags || '');
        const cta = p.cta || p.call_to_action || '';
        const fullContent = [caption, hashtagStr, cta].filter(Boolean).join('\n\n');

        // Dedupe: skip if we already have the exact same content for this client today
        const { data: existing } = await supabase.from('social_posts')
          .select('id')
          .eq('client_id', clientId)
          .eq('content', fullContent)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();
        if (existing) continue;

        const visualUrl = p.visual_url && !/integration_asset/i.test(p.visual_url) ? p.visual_url : null;

        // DB constraint: post_type must be one of text|image|video|link|carousel|story|reel
        const rawPostType = String(p.post_type || '').toLowerCase();
        const ALLOWED_POST_TYPES = ['text', 'image', 'video', 'link', 'carousel', 'story', 'reel'];
        let postType = ALLOWED_POST_TYPES.includes(rawPostType) ? rawPostType : (visualUrl ? 'image' : 'text');

        const { error } = await supabase.from('social_posts').insert({
          client_id: clientId,
          title,
          content: fullContent,
          platform,
          post_type: postType,
          status: 'draft',
          media_urls: visualUrl ? [visualUrl] : [],
          ai_generated: true,
          ai_prompt: p.topic || null,
          created_by: `agent:${agentSlug}`,
        });
        if (error) {
          result.errors.push({ kind: 'social_posts', message: error.message });
        } else {
          result.social_posts++;
        }
      } catch (e) {
        result.errors.push({ kind: 'social_posts', message: e.message });
      }
    }
  }

  // ── 2. Ad creatives (Google Ads) ──
  // The google-ads-campaign-agent produces `proposed_ad_variants`, but other
  // agents might use the more common ad_creatives / creatives / ads keys.
  // Accept all of them.
  const creatives = Array.isArray(output.ad_creatives) ? output.ad_creatives
    : Array.isArray(output.creatives) ? output.creatives
    : Array.isArray(output.ads) ? output.ads
    : [];
  const variants = Array.isArray(output.proposed_ad_variants) ? output.proposed_ad_variants
    : Array.isArray(output.ad_variants) ? output.ad_variants
    : [];
  const adCopies = Array.isArray(output.ad_copy) ? output.ad_copy
    : Array.isArray(output.ad_copies) ? output.ad_copies
    : [];
  const allAdItems = [...creatives, ...variants, ...adCopies];

  if (allAdItems.length > 0 && /google.ads|ad.campaign/i.test(agentSlug)) {
    // Find or create today's draft campaign for this client. campaign_creatives
    // requires campaign_id NOT NULL, so we bucket all AI-proposed creatives into
    // a single per-client-per-day draft campaign. This keeps the UI coherent
    // (one "AI Proposals — 2026-04-17" row with N creatives inside).
    const today = new Date().toISOString().slice(0, 10);
    const draftCampaignName = `AI Google Ads Proposals — ${today}`;
    let campaignId = null;
    try {
      const { data: existingCampaign } = await supabase
        .from('campaigns')
        .select('id')
        .eq('client_id', clientId)
        .eq('name', draftCampaignName)
        .maybeSingle();
      if (existingCampaign) {
        campaignId = existingCampaign.id;
      } else {
        const { data: newCampaign, error: campErr } = await supabase
          .from('campaigns')
          .insert({
            client_id: clientId,
            name: draftCampaignName,
            objective: 'TRAFFIC',
            status: 'draft',
            platforms: ['google'],
            currency: 'ILS',
            created_by: `agent:${agentSlug}`,
            notes: `Auto-created by persistAgentDeliverables from run ${runId}`,
          })
          .select('id')
          .single();
        if (campErr) {
          result.errors.push({ kind: 'campaign_creatives', message: `create campaign: ${campErr.message}` });
        } else {
          campaignId = newCampaign?.id;
        }
      }
    } catch (e) {
      result.errors.push({ kind: 'campaign_creatives', message: `campaign bucket: ${e.message}` });
    }
    if (!campaignId) return result;

    for (const c of allAdItems) {
      try {
        if (!c || typeof c !== 'object') continue;

        // The agent variants have headlines[] + descriptions[] — take the first
        // of each as the display value, but keep the whole array in google_creative
        // so the UI can render all of them.
        const headlinesArr = Array.isArray(c.headlines) ? c.headlines.filter(Boolean) : [];
        const descriptionsArr = Array.isArray(c.descriptions) ? c.descriptions.filter(Boolean) : [];
        const headline = c.headline || c.title || headlinesArr[0] || null;
        const primary = c.primary_text || c.body || descriptionsArr[0] || c.description || c.caption || null;
        const description = descriptionsArr[1] || descriptionsArr[0] || c.description || null;
        if (!headline && !primary) continue;

        const imageUrl = c.image_url || c.visual_url || (Array.isArray(c.images) ? c.images[0] : null);
        // Skip pseudo-URLs from integration_asset placeholders
        const realImageUrl = imageUrl && !/integration_asset/i.test(imageUrl) ? imageUrl : null;

        const { data: existing } = await supabase.from('campaign_creatives')
          .select('id')
          .eq('client_id', clientId)
          .eq('headline', headline || '')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();
        if (existing) continue;

        // Build a richer google_creative payload that the UI can unpack
        const googleCreative = {
          ...c,
          _all_headlines: headlinesArr,
          _all_descriptions: descriptionsArr,
          _ad_group: c.ad_group || null,
          _target_audience: c.target_audience || null,
          _engagement_style: c.engagement_style || null,
        };

        // DB constraint: format must be one of single_image|carousel|video
        const ALLOWED_FORMATS = ['single_image', 'carousel', 'video'];
        const rawFormat = String(c.format || '').toLowerCase();
        const format = ALLOWED_FORMATS.includes(rawFormat) ? rawFormat : 'single_image';

        const { error } = await supabase.from('campaign_creatives').insert({
          campaign_id: campaignId,
          client_id: clientId,
          headline,
          primary_text: primary,
          description,
          call_to_action: c.cta || c.call_to_action || null,
          image_url: realImageUrl,
          destination_url: c.destination_url || c.landing_url || null,
          google_creative: googleCreative,
          status: 'draft',
          format,
        });
        if (error) {
          result.errors.push({ kind: 'campaign_creatives', message: error.message });
        } else {
          result.campaign_creatives++;
        }
      } catch (e) {
        result.errors.push({ kind: 'campaign_creatives', message: e.message });
      }
    }
  }

  return result;
}
