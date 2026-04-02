# AI Growth OS v2.0 — Complete Build
## By Elad Digital | elad.d.keren@gmail.com

### Stack
- **Backend**: Node.js + Express + Supabase + OpenAI gpt-4.1
- **Frontend**: React + Vite + Lucide Icons
- **Database**: Supabase (PostgreSQL)
- **Scheduler**: node-cron (every 5 min)

---

### Setup

#### 1. Supabase
1. Create project at supabase.com
2. Run SQL files IN ORDER:
   ```
   supabase/migrations/001_schema.sql
   supabase/seeds/001_agents.sql
   supabase/seeds/002_yaniv_gil.sql
   ```

#### 2. Backend
```bash
cd backend
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
npm install
npm run dev
# Runs on :3001
```

#### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on :5173
```

---

### What's Built

#### Database: 20 tables
clients, client_profiles, client_rules, agent_templates, client_agent_assignments,
prompt_versions, memory_items, client_documents, run_queue, runs, approvals,
agent_schedules, incidents, audit_trail, baselines, client_keywords, client_competitors,
backlinks, referring_domains, competitor_link_gap, external_sync_log, reports,
client_credentials, link_recommendations

#### 23 Agents (all with full prompts)
1. Master Orchestrator
2. SEO Core Agent
3. Technical SEO / Crawl Agent
4. GSC Daily Monitor
5. Google Ads / Campaign Agent
6. Analytics / Conversion Integrity Agent
7. CRO Agent
8. Website Content Agent
9. Design Consistency Agent
10. Website QA Agent (post-change validator)
11. Local SEO Agent
12. Reviews / GBP / Authority Agent
13. Competitor Intelligence Agent
14. Facebook Agent
15. Instagram Agent
16. Legal Compliance Agent
17. Innovation Strategy Agent
18. Design Enforcement Agent (post-change validator)
19. Hebrew Quality Agent (post-change validator)
20. Regression Agent (post-change validator)
21. Credential Health Agent
22. KPI Integrity Agent
23. Report Composer Agent

#### Backend Functions (all fully implemented)
- executeAgent — full OpenAI execution, memory, prompt versioning, approvals, audit
- processRunQueue — queue worker with cooldown, dependencies, retry logic
- resumeApprovedTask — resumes held tasks after approval
- runPostChangePipeline — queues 4 validators in dependency order
- runLane — runs all agents in a lane by owner→worker→validator order
- runAllAgentsForClient — orchestrator-first, all agents queued
- retryRun — re-queues failed runs
- ingestDocumentToMemory — file→chunks→OpenAI→memory items
- generateLinkRecommendations — AI-powered, cached to DB
- syncGoogleSheetData — CSV import for 5 data types
- generateReportHtml — Hebrew RTL branded HTML report
- sendClientReport — marks sent, audit log
- refreshCredentialHealth — tests each service connection
- validateKpiSources — verifies metric integrity
- enqueueDueRuns — reads schedules, enqueues due runs

#### Frontend: 13 Views
Dashboard, Agents, Runs, Queue, Approvals, Memory, SEO & Links,
Reports, Verification, Credentials, Incidents, Audit Trail, Schedules

#### Yaniv Gil Seeded Data
- 13 memory items (reviews, rankings, performance, technical debt, content, backlinks, ads, social, competitors)
- 12 baselines (mobile PS 60→80, desktop 82→95, Google reviews 18→100, etc.)
- 25 Hebrew target keywords across 8 clusters
- 3 competitors with DA and notes
- 9 service credentials (to be connected)
- All 23 agents assigned
- 10 default schedules (daily/weekly/monthly cron)

---

### Post-Change Validation Chain
Any change that `changed_anything=true` with `post_change_trigger=true` automatically queues:
1. website-qa-agent
2. design-enforcement-agent
3. hebrew-quality-agent
4. regression-agent
(in dependency order — each waits for the previous to complete)

### Credential Rules
- Allowed account: elad.d.keren@gmail.com
- Forbidden account: elad@netop.cloud (checked by Credential Health Agent)
