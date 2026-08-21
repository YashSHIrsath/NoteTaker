-- Per-user marker for the one-time LocalStorage → Supabase notes migration.
-- The frontend never uses a service-role key; RLS limits rows to auth.uid().

CREATE TABLE public.notes_migrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL,
  id_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notes_migrations_status_allowed CHECK (
    status IN ('in_progress', 'failed', 'completed')
  )
);

CREATE TRIGGER notes_migrations_set_updated_at
  BEFORE UPDATE ON public.notes_migrations
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.notes_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_migrations_select_own
  ON public.notes_migrations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notes_migrations_insert_own
  ON public.notes_migrations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notes_migrations_update_own
  ON public.notes_migrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
