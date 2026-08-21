-- MyNotes initial schema.
-- Apply to a fresh Supabase/PostgreSQL database.
-- The application still uses LocalStorage; this schema is not wired up yet.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- folders: unlimited nesting via parent_id (NULL = root)
-- ---------------------------------------------------------------------------

CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.folders (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_important boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folders_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT folders_sort_order_non_negative CHECK (sort_order >= 0),
  CONSTRAINT folders_parent_not_self CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX folders_parent_id_sort_order_idx
  ON public.folders (parent_id, sort_order);

CREATE TRIGGER folders_set_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks: belong directly to one folder (not nested under other tasks)
-- ---------------------------------------------------------------------------

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.folders (id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_important boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_not_empty CHECK (length(btrim(title)) > 0),
  CONSTRAINT tasks_sort_order_non_negative CHECK (sort_order >= 0)
);

CREATE INDEX tasks_folder_id_sort_order_idx
  ON public.tasks (folder_id, sort_order);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subtasks: unlimited nesting via parent_subtask_id (NULL = direct child of task)
-- ---------------------------------------------------------------------------

CREATE TABLE public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  parent_subtask_id uuid REFERENCES public.subtasks (id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subtasks_title_not_empty CHECK (length(btrim(title)) > 0),
  CONSTRAINT subtasks_parent_not_self CHECK (parent_subtask_id IS DISTINCT FROM id)
);

CREATE INDEX subtasks_task_id_idx
  ON public.subtasks (task_id);

CREATE INDEX subtasks_parent_subtask_id_idx
  ON public.subtasks (parent_subtask_id);

CREATE TRIGGER subtasks_set_updated_at
  BEFORE UPDATE ON public.subtasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- attachments: metadata only. Files will live in Storage later (storage_path).
-- ---------------------------------------------------------------------------

CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  storage_path text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_name_not_empty CHECK (length(btrim(name)) > 0),
  CONSTRAINT attachments_mime_type_not_empty CHECK (length(btrim(mime_type)) > 0),
  CONSTRAINT attachments_type_allowed CHECK (
    type IN ('image', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv')
  ),
  CONSTRAINT attachments_file_size_non_negative CHECK (
    file_size IS NULL OR file_size >= 0
  )
);

CREATE INDEX attachments_task_id_idx
  ON public.attachments (task_id);

CREATE TRIGGER attachments_set_updated_at
  BEFORE UPDATE ON public.attachments
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Enabled now so tables are not accidentally exposed via PostgREST.
-- No policies are created: anon/authenticated cannot read or write until
-- authentication exists and explicit policies are added.
-- The service role (dashboard, migrations) bypasses RLS.
-- ---------------------------------------------------------------------------

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
