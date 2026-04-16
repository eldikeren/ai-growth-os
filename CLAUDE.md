# AI Growth OS — Project Instructions

## Architecture
- **Frontend**: React SPA with Vite, inline styles (no CSS frameworks), lazy-loaded views
- **Backend**: Express.js API on Vercel serverless (`api/index.mjs`)
- **Database**: Supabase (PostgreSQL), migrations in `supabase/migrations/`
- **AI**: Dual provider via `aiChat()` helper — prefers Anthropic, falls back to OpenAI
- **Deployment**: Vercel with cron jobs defined in `vercel.json`

## Key Patterns
- Components in `frontend/src/components/index.jsx` — use `Card, SH, Badge, Btn, GradientBtn, Spin, Empty, Field, SortableTable`
- `Empty` component takes `icon` (Lucide component, NOT string) and `msg` (string)
- `Btn` component uses boolean `danger` prop, NOT `color="danger"`
- `GradientBtn` accepts `type` prop (defaults to `'button'`)
- Theme tokens in `frontend/src/theme.js` — use `colors, spacing, radius, fontSize, fontWeight`
- `fontSize` has: micro, xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, hero (NO `base`)
- Nav structure in `theme.js` NAV_GROUPS array
- API calls use `api()` helper from `frontend/src/hooks/useApi.js`
- Backend routes: `routes/index.js` (core), `routes/additional.js` (extended), `routes/magic-link.js`
- Migrations: numbered `NNN_name.sql`, run via Supabase Management API (see memory)

## QA Rules (MUST follow)
1. **Before creating any INSERT**: check for existing records to prevent duplicates
2. **URL handling**: always normalize URLs (strip www, trailing slash) before storing
3. **Never pass strings as icon props** — always use Lucide React components
4. **Test empty states**: every view must handle zero-data gracefully
5. **After making changes**: verify the component renders without crashes
6. **Don't hardcode RTL/Hebrew** — respect client's `language` setting from profile
7. **Agent tools**: always deduplicate before inserting (check `propose_website_change` pattern)
8. **Cron awareness**: understand that agents run every hour — anything they create will be created repeatedly unless deduped

## Clients
- **Yaniv Gil Law Firm**: yanivgil.co.il (Hebrew, RTL)
- **Homie Finance**: homie-finance.com (English, LTR)

## Common Mistakes to Avoid
- Using `fontSize.base` (doesn't exist, use `fontSize.md`)
- Using `colors.backgroundAlt` (doesn't exist, use `colors.surface`)
- Passing `title`/`subtitle` to `Empty` (use `msg`)
- Forgetting to normalize URLs before DB operations
- Creating blind INSERTs without dedup checks in agent tools
- Hardcoding `dir="rtl"` on components used by all clients
