Pre-deployment checklist. Run before every commit/push:

1. **Build check**: Run `cd /Users/elad/SEO/ai-growth-os/frontend && npx vite build` and verify no errors
2. **Import check**: Verify all lazy imports in `App.jsx` point to existing files
3. **Route check**: Verify all nav items in `theme.js` have matching routes in `App.jsx`
4. **API check**: Verify all frontend `api()` calls have matching backend route handlers
5. **Migration check**: Verify any new migration files have been run against Supabase
6. **Duplicate check**: Run SQL to verify no duplicate proposed_changes, tasks, or other records

Report any issues found. If all checks pass, confirm ready to deploy.
