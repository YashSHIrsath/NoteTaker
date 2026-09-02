-- Notifications, rebuilt on top of the permission model.
--
-- The rule this migration exists to make true: nothing is ever sent to a recipient list that was
-- decided earlier than the send. A reminder configured on Monday for a task shared with A and B, with
-- B removed on Tuesday, must reach A alone on Friday -- and it must do so without anybody having
-- remembered to go and cancel something.
--
-- The way that is achieved is by not storing recipients at all. There is no queue of addressed
-- messages anywhere in this design; there is a queue of *events* (this reminder is due, this deadline
-- has arrived), and the audience is computed from the item's current visibility when the sender reads
-- the queue. Revocation therefore needs no revocation step: removing a share removes a row that the
-- next audience calculation simply does not find. Every one of the requirement's edge cases --
-- removed before the reminder, removed and re-added, left the space, content made private, private to
-- selected, selected to everyone, everyone to selected -- is the same single mechanism, which is why
-- none of them has its own code here.
--
-- Two bugs in the existing path are fixed on the way through, both from the same line. due_reminders
-- and pending_task_emails each picked their recipient as `f.user_id`: the *folder's creator*. In a
-- personal workspace that is the owner and is correct. In a space it is whoever happened to make the
-- folder -- so a reminder B set on a shared note emailed A, and B, who asked for it, got nothing.

-- ---------------------------------------------------------------- preferences
--
-- Per space rather than per account, because that is the unit the choice is about: "tell me about
-- things in the work space, not the house-move space" is a sentence people mean, and a single global
-- switch is not.
--
-- A missing row means the defaults below, so nothing has to be created when somebody joins a space,
-- and a member who has never opened settings behaves exactly as they did before this existed.
--
-- Personal notes have no row and no space, and fall through to the same defaults -- which is what
-- keeps every existing personal reminder working unchanged.

CREATE TABLE IF NOT EXISTS public.space_notification_prefs (
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  /* Reminders somebody set on a note. On by default: a reminder is a thing a person deliberately
     asked for, and the people sharing the note are the people it concerns. */
  reminders boolean NOT NULL DEFAULT true,
  /* A deadline arriving, and a task being completed. On by default, same reasoning. */
  due_dates boolean NOT NULL DEFAULT true,
  /* Somebody edited something. Off by default -- this is the class that becomes a firehose in an
     active space, and nobody has asked to be told about every keystroke. */
  content_updates boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

ALTER TABLE public.space_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS space_notification_prefs_select ON public.space_notification_prefs;
DROP POLICY IF EXISTS space_notification_prefs_insert ON public.space_notification_prefs;
DROP POLICY IF EXISTS space_notification_prefs_update ON public.space_notification_prefs;
DROP POLICY IF EXISTS space_notification_prefs_delete ON public.space_notification_prefs;

-- Your own row, in a space you are actually in. Both halves matter: the first is privacy, the second
-- stops a row being left behind for a space somebody has left.
CREATE POLICY space_notification_prefs_select
  ON public.space_notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY space_notification_prefs_insert
  ON public.space_notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_space_member(space_id));

CREATE POLICY space_notification_prefs_update
  ON public.space_notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_space_member(space_id));

CREATE POLICY space_notification_prefs_delete
  ON public.space_notification_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.space_notification_prefs TO authenticated;

DROP TRIGGER IF EXISTS space_notification_prefs_set_updated_at ON public.space_notification_prefs;
CREATE TRIGGER space_notification_prefs_set_updated_at
  BEFORE UPDATE ON public.space_notification_prefs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------- which space an item is in

CREATE OR REPLACE FUNCTION public.content_space(p_entity_type text, p_entity_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE p_entity_type
    WHEN 'folder' THEN (SELECT f.space_id FROM public.folders AS f WHERE f.id = p_entity_id)
    WHEN 'task' THEN (
      SELECT f.space_id
      FROM public.tasks AS t
      JOIN public.folders AS f ON f.id = t.folder_id
      WHERE t.id = p_entity_id
    )
    ELSE NULL
  END;
$fn$;

/*
 * Does this person want to hear about this class of thing in this space?
 *
 * Never consulted before access -- see notification_allowed. A preference decides whether somebody
 * who *may* be told actually is; it can never be the reason somebody without access is told, which is
 * the requirement that preferences must not override privacy.
 *
 * A NULL space (a personal note) matches no preferences row and falls through to the defaults.
 */
CREATE OR REPLACE FUNCTION public.notification_enabled(
  p_user_id uuid,
  p_space_id uuid,
  p_class text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT CASE p_class
    WHEN 'reminders' THEN coalesce(
      (SELECT prefs.reminders FROM public.space_notification_prefs AS prefs
        WHERE prefs.space_id = p_space_id AND prefs.user_id = p_user_id),
      true)
    WHEN 'due_dates' THEN coalesce(
      (SELECT prefs.due_dates FROM public.space_notification_prefs AS prefs
        WHERE prefs.space_id = p_space_id AND prefs.user_id = p_user_id),
      true)
    WHEN 'content_updates' THEN coalesce(
      (SELECT prefs.content_updates FROM public.space_notification_prefs AS prefs
        WHERE prefs.space_id = p_space_id AND prefs.user_id = p_user_id),
      false)
    -- An unrecognised class sends to nobody. The safe direction for a value that reached here by
    -- mistake is silence, not everybody.
    ELSE false
  END;
$fn$;

-- ---------------------------------------------------------------- the audience
--
-- Everyone who can currently reach an item. The single answer both the data side and the notification
-- side are built on -- which is the whole point: "who can see this" and "who may be emailed about
-- this" are not two questions that have to be kept in agreement, they are one question asked twice.
--
-- Four arms because there are two entity kinds and two workspace kinds. A personal item's audience is
-- its one owner, and the space arms walk the membership asking the same visibility functions the RLS
-- policies ask. Nothing here is a second implementation of the rule.

CREATE OR REPLACE FUNCTION public.content_audience(p_entity_type text, p_entity_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT folder.user_id
  FROM public.folders AS folder
  WHERE p_entity_type = 'folder'
    AND folder.id = p_entity_id
    AND folder.space_id IS NULL

  UNION

  SELECT member.user_id
  FROM public.folders AS folder
  JOIN public.space_members AS member ON member.space_id = folder.space_id
  WHERE p_entity_type = 'folder'
    AND folder.id = p_entity_id
    AND folder.space_id IS NOT NULL
    AND public.folder_chain_visible(folder.id, member.user_id)

  UNION

  SELECT folder.user_id
  FROM public.tasks AS task
  JOIN public.folders AS folder ON folder.id = task.folder_id
  WHERE p_entity_type = 'task'
    AND task.id = p_entity_id
    AND folder.space_id IS NULL

  UNION

  SELECT member.user_id
  FROM public.tasks AS task
  JOIN public.folders AS folder ON folder.id = task.folder_id
  JOIN public.space_members AS member ON member.space_id = folder.space_id
  WHERE p_entity_type = 'task'
    AND task.id = p_entity_id
    AND folder.space_id IS NOT NULL
    AND public.task_content_visible(task.id, member.user_id);
$fn$;

/*
 * The gate every channel must pass through, for one recipient, immediately before delivery.
 *
 * Access first and separately, then the preference. Written in that order because the order is the
 * guarantee: no preference can be the reason somebody gets something they cannot see.
 *
 * This exists as well as the recipient lists below, not instead of them, and the duplication is
 * deliberate. A list is read once at the top of a run that may then spend a minute talking to an SMTP
 * server; this is called in the instant before each message goes. It is what makes "checked at the
 * exact time it executes" true rather than approximately true, and it is the one function a new
 * channel -- push, in-app, a digest -- has to call to inherit all of this.
 */
CREATE OR REPLACE FUNCTION public.notification_allowed(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_class text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.content_audience(p_entity_type, p_entity_id) AS audience
    WHERE audience = p_user_id
  )
  AND public.notification_enabled(
    p_user_id,
    public.content_space(p_entity_type, p_entity_id),
    p_class
  );
$fn$;

/*
 * The audience as addresses, ready to send to.
 *
 * Returned as jsonb rather than a table so it can be one column of the queue views below -- the sender
 * gets the event and the people to tell in a single read, instead of a query per row.
 *
 * A recipient with no address is dropped rather than reported: an account can exist without a
 * confirmed email, and a run that failed over it would stop telling everybody else.
 */
CREATE OR REPLACE FUNCTION public.notification_recipients(
  p_entity_type text,
  p_entity_id uuid,
  p_class text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $fn$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', account.id,
        'email', account.email,
        -- The account's own zone, used only when the reminder itself carries none.
        'timezone', nullif(btrim(coalesce(account.raw_user_meta_data ->> 'timezone', '')), ''),
        'name', nullif(btrim(coalesce(account.raw_user_meta_data ->> 'full_name', '')), '')
      )
      ORDER BY account.email
    ),
    '[]'::jsonb
  )
  FROM public.content_audience(p_entity_type, p_entity_id) AS audience
  JOIN auth.users AS account ON account.id = audience
  WHERE account.email IS NOT NULL
    AND public.notification_enabled(
      audience,
      public.content_space(p_entity_type, p_entity_id),
      p_class
    );
$fn$;

REVOKE ALL ON FUNCTION public.content_space(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_enabled(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_audience(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_allowed(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_recipients(text, uuid, text) FROM PUBLIC;

-- The sender is the service role. `authenticated` gets content_audience and notification_enabled so
-- the app can show "who gets told about this" beside "who can see this" -- both are answers about the
-- caller's own item, and both already refuse anything they cannot reach.
GRANT EXECUTE ON FUNCTION public.content_space(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notification_enabled(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_audience(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notification_allowed(uuid, text, uuid, text) TO service_role;
-- Deliberately service_role only: it carries email addresses, which the audience ids do not.
GRANT EXECUTE ON FUNCTION public.notification_recipients(text, uuid, text) TO service_role;

-- ---------------------------------------------------------------- the reminder queue
--
-- `user_id` is now the reminder's own owner -- the person who set it -- rather than the folder's
-- creator. That is the bug described at the top of this file. It is kept in the view because it is
-- worth having in a log, but it is no longer who the mail goes to: `recipients` is.

DROP VIEW IF EXISTS public.due_reminders;

CREATE VIEW public.due_reminders AS
SELECT
  r.id,
  r.task_id,
  r.kind,
  r.message,
  r.timezone,
  r.next_run_at,
  r.offset_minutes,
  r.offset_direction,
  t.title,
  t.due_at,
  t.folder_id,
  t.note_kind,
  r.user_id,
  f.space_id,
  public.notification_recipients('task', r.task_id, 'reminders') AS recipients
FROM public.reminders r
JOIN public.tasks t ON t.id = r.task_id
JOIN public.folders f ON f.id = t.folder_id
WHERE r.is_active
  AND r.next_run_at IS NOT NULL
  -- A finished task stops nagging. A plain note has nothing to finish, so its recurring reminders
  -- keep running -- that is the whole point of a reminder that is not a deadline.
  AND NOT (t.note_kind = 'due_task' AND t.completed);

REVOKE ALL ON public.due_reminders FROM anon, authenticated;
GRANT SELECT ON public.due_reminders TO service_role;

-- ---------------------------------------------------------------- the task-email queue

DROP VIEW IF EXISTS public.pending_task_emails;

CREATE VIEW public.pending_task_emails AS
SELECT
  t.id AS task_id,
  'completed'::text AS reason,
  t.title,
  t.due_at,
  t.completed_at,
  t.folder_id,
  -- The task's own creator now that it has one, falling back to the folder's for a row written
  -- before owner_id existed and never touched since.
  coalesce(t.owner_id, f.user_id) AS user_id,
  f.space_id,
  public.task_lifecycle(t.note_kind, t.completed, t.completed_at, t.due_at) AS lifecycle,
  false AS has_reminders,
  public.notification_recipients('task', t.id, 'due_dates') AS recipients
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.note_kind = 'due_task'
  AND t.completed
  AND t.completion_email_sent_at IS NULL

UNION ALL

SELECT
  t.id,
  'due_passed'::text,
  t.title,
  t.due_at,
  t.completed_at,
  t.folder_id,
  coalesce(t.owner_id, f.user_id),
  f.space_id,
  public.task_lifecycle(t.note_kind, t.completed, t.completed_at, t.due_at),
  EXISTS (
    SELECT 1 FROM public.reminders r
    WHERE r.task_id = t.id AND r.is_active
  ) AS has_reminders,
  public.notification_recipients('task', t.id, 'due_dates')
FROM public.tasks t
JOIN public.folders f ON f.id = t.folder_id
WHERE t.note_kind = 'due_task'
  AND t.due_at IS NOT NULL
  AND t.due_at <= now()
  AND t.due_summary_email_sent_at IS NULL;

REVOKE ALL ON public.pending_task_emails FROM anon, authenticated;
GRANT SELECT ON public.pending_task_emails TO service_role;

-- ---------------------------------------------------------------- reading your own preferences
--
-- One call rather than a select against the table, so a member who has never set anything gets the
-- defaults back instead of an empty result the client would have to know how to interpret.

CREATE OR REPLACE FUNCTION public.my_notification_prefs(p_space_id uuid)
RETURNS TABLE (space_id uuid, reminders boolean, due_dates boolean, content_updates boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT
    p_space_id,
    public.notification_enabled(auth.uid(), p_space_id, 'reminders'),
    public.notification_enabled(auth.uid(), p_space_id, 'due_dates'),
    public.notification_enabled(auth.uid(), p_space_id, 'content_updates')
  WHERE public.is_space_member(p_space_id);
$fn$;

CREATE OR REPLACE FUNCTION public.set_notification_prefs(
  p_space_id uuid,
  p_reminders boolean DEFAULT NULL,
  p_due_dates boolean DEFAULT NULL,
  p_content_updates boolean DEFAULT NULL
)
RETURNS TABLE (space_id uuid, reminders boolean, due_dates boolean, content_updates boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
/* Same reason as set_content_visibility, and the same placement rule: space_id, reminders, due_dates
   and content_updates are all output parameters here *and* columns of the table being written. */
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'You are not in this space';
  END IF;

  -- NULL leaves a switch alone, so the client can send one change without having to hold the other
  -- two -- the same key-presence semantics the op patches use.
  INSERT INTO public.space_notification_prefs AS prefs (
    space_id, user_id, reminders, due_dates, content_updates
  )
  VALUES (
    p_space_id,
    auth.uid(),
    coalesce(p_reminders, true),
    coalesce(p_due_dates, true),
    coalesce(p_content_updates, false)
  )
  ON CONFLICT (space_id, user_id) DO UPDATE SET
    reminders = coalesce(p_reminders, prefs.reminders),
    due_dates = coalesce(p_due_dates, prefs.due_dates),
    content_updates = coalesce(p_content_updates, prefs.content_updates);

  RETURN QUERY
  SELECT
    p_space_id,
    public.notification_enabled(auth.uid(), p_space_id, 'reminders'),
    public.notification_enabled(auth.uid(), p_space_id, 'due_dates'),
    public.notification_enabled(auth.uid(), p_space_id, 'content_updates');
END;
$fn$;

REVOKE ALL ON FUNCTION public.my_notification_prefs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_notification_prefs(uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_notification_prefs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_notification_prefs(uuid, boolean, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
