// ============================================================
// AI GROWTH OS — MAGIC LINK API ROUTES
// ============================================================

import express from 'express';
import {
  createSetupLink, getSetupLinkByToken, submitConnectorCredentials,
  getSetupLinksForClient, getAllSetupLinks, revokeSetupLink,
  regenerateSetupLink, getConnectorDefinitions, getDecryptedCredentials
} from '../functions/magic-link.js';

const router = express.Router();

// ── ADMIN: GET ALL CONNECTOR DEFINITIONS ─────────────────────
router.get('/connector-definitions', async (req, res) => {
  try {
    const data = await getConnectorDefinitions(req.query.slugs?.split(','));
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: CREATE SETUP LINK ──────────────────────────────────
router.post('/clients/:clientId/setup-links', async (req, res) => {
  try {
    const result = await createSetupLink(req.params.clientId, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: GET SETUP LINKS FOR CLIENT ────────────────────────
router.get('/clients/:clientId/setup-links', async (req, res) => {
  try {
    const data = await getSetupLinksForClient(req.params.clientId);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: GET ALL SETUP LINKS ────────────────────────────────
router.get('/setup-links', async (req, res) => {
  try {
    const data = await getAllSetupLinks(req.query);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: REVOKE LINK ────────────────────────────────────────
router.delete('/setup-links/:id', async (req, res) => {
  try {
    const data = await revokeSetupLink(req.params.id);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: REGENERATE LINK ────────────────────────────────────
router.post('/setup-links/:id/regenerate', async (req, res) => {
  try {
    const data = await regenerateSetupLink(req.params.id);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUBLIC: GET SETUP LINK DATA (by token, no auth required) ─
router.get('/setup/:token', async (req, res) => {
  try {
    const data = await getSetupLinkByToken(req.params.token);
    if (data.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUBLIC: SUBMIT CONNECTOR (by token, no auth required) ────
router.post('/setup/:token/submit', async (req, res) => {
  try {
    const { connector_slug, type, data: credData, meta } = req.body;
    if (!connector_slug) return res.status(400).json({ error: 'connector_slug required' });
    const result = await submitConnectorCredentials(req.params.token, connector_slug, { type, data: credData, meta });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
