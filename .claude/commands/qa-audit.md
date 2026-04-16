Run a full QA audit of the AI Growth OS app. Check systematically:

1. **Every view** in `frontend/src/views/` — verify imports, props, empty states, API calls
2. **Every route** in `backend/src/routes/` — verify handlers exist, error handling, response format
3. **Database consistency** — run SQL queries to check for duplicates, orphaned records, missing data
4. **Cron jobs** — verify all crons in `vercel.json` have matching route handlers
5. **Component usage** — verify all uses of `Empty`, `Btn`, `GradientBtn`, `SortableTable` follow patterns in CLAUDE.md
6. **Agent tools** — verify all INSERT operations have dedup checks

Output a prioritized bug list:
- P0: Crashes, data corruption, security issues
- P1: Broken features, dead buttons, wrong data
- P2: Missing features, bad UX, i18n issues
- P3: Polish, cosmetic, best practices

Include file paths and line numbers for each issue.
