-- ============================================================
-- 027: TASKS & IDEAS — Per-client task board with AI assistance
-- ============================================================

CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Core fields
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task'
    CHECK (type IN ('task', 'idea', 'comment', 'bug', 'improvement')),
  category TEXT DEFAULT 'general'
    CHECK (category IN ('general', 'seo', 'content', 'design', 'technical', 'marketing', 'ads', 'social', 'analytics', 'other')),

  -- Status
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'archived', 'rejected')),
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),

  -- AI assistance
  ai_analysis TEXT,          -- AI's evaluation/suggestions for this task
  ai_action_plan JSONB,     -- structured action plan from AI
  ai_analyzed_at TIMESTAMPTZ,

  -- Tracking
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin',
  assigned_to TEXT,
  tags JSONB DEFAULT '[]',   -- ["urgent", "homepage", "meta-tags"]
  notes TEXT,                -- additional notes/comments

  -- Metadata
  related_url TEXT,          -- page URL this task relates to
  related_agent TEXT,        -- agent slug if created by an agent
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_tasks_client ON client_tasks(client_id, status, created_at DESC);
CREATE INDEX idx_client_tasks_type ON client_tasks(client_id, type);
CREATE INDEX idx_client_tasks_priority ON client_tasks(client_id, priority);

-- Task comments / activity log
CREATE TABLE IF NOT EXISTS client_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  author TEXT DEFAULT 'admin',  -- 'admin', 'ai', 'system'
  is_ai_response BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON client_task_comments(task_id, created_at);
