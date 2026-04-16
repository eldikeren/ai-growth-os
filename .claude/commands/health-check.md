Run a health check on the live app data. Query Supabase to verify:

1. **Clients**: List all active clients with their profiles
2. **Connectors**: Check which connectors are connected vs not connected for each client
3. **Proposed Changes**: Count by status, check for duplicates
4. **Tasks**: Count by status, check for stale tasks
5. **Social Posts**: Count by status, check for stuck posts
6. **Runs**: Check for failed or stuck runs in the last 24h
7. **Cron health**: Check if crons are running (last execution timestamps)
8. **Backlinks**: Count per client, last sync date
9. **Agent assignments**: Which agents are enabled per client

Use the Supabase Management API (credentials in memory) to run SQL queries.
Report any anomalies, stale data, or broken connections.
