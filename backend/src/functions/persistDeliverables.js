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
  const creatives = Array.isArray(output.ad_creatives) ? output.ad_creatives
    : Array.isArray(output.creatives) ? output.creatives
    : Array.isArray(output.ads) ? output.ads
    : [];
  const adCopies = Array.isArray(output.ad_copy) ? output.ad_copy
    : Array.isArray(output.ad_copies) ? output.ad_copies
    : [];
  const allAdItems = [...creatives, ...adCopies];

  if (allAdItems.length > 0 && /google.ads|ad.campaign/i.test(agentSlug)) {
    for (const c of allAdItems) {
      try {
        if (!c || typeof c !== 'object') continue;
        const headline = c.headline || c.title || (Array.isArray(c.headlines) ? c.headlines[0] : null);
        const primary = c.primary_text || c.body || c.description || c.caption;
        if (!headline && !primary) continue;

        const imageUrl = c.image_url || c.visual_url || (Array.isArray(c.images) ? c.images[0] : null);

        const { data: existing } = await supabase.from('campaign_creatives')
          .select('id')
          .eq('client_id', clientId)
          .eq('headline', headline || '')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from('campaign_creatives').insert({
          client_id: clientId,
          headline: headline || null,
          primary_text: primary || null,
          description: c.description || null,
          call_to_action: c.cta || c.call_to_action || null,
          image_url: imageUrl || null,
          destination_url: c.destination_url || c.landing_url || null,
          google_creative: c,
          status: 'draft',
          format: c.format || 'image',
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
