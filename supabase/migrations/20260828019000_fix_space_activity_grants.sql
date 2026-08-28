-- The activity migration was recorded remotely before the feed function was present. Recreate the
-- complete RPC here so the client and database agree on its five-argument signature.
CREATE OR REPLACE FUNCTION public.space_activity_feed(
	p_space_id uuid,
	p_before_id bigint DEFAULT NULL,
	p_limit integer DEFAULT 50,
	p_actor_ids uuid[] DEFAULT NULL,
	p_actions text[] DEFAULT NULL
)
RETURNS TABLE (
	id bigint,
	occurred_at timestamptz,
	action text,
	entity_type text,
	entity_id uuid,
	entity_title text,
	path_label text,
	intent text,
	before jsonb,
	after jsonb,
	actor_id uuid,
	actor_name text,
	actor_email text,
	actor_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
	SELECT
		a.id, a.occurred_at, a.action, a.entity_type, a.entity_id,
		a.entity_title, a.path_label, a.intent, a.before, a.after,
		a.actor_id,
		nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
		u.email,
		nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), '')
	FROM public.space_activity AS a
	LEFT JOIN auth.users AS u ON u.id = a.actor_id
	WHERE a.space_id = p_space_id
		AND public.is_space_member(p_space_id)
		AND (p_before_id IS NULL OR a.id < p_before_id)
		AND (p_actor_ids IS NULL OR cardinality(p_actor_ids) = 0 OR a.actor_id = ANY (p_actor_ids))
		AND (p_actions IS NULL OR cardinality(p_actions) = 0 OR a.action = ANY (p_actions))
	ORDER BY a.occurred_at DESC, a.id DESC
	LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.space_activity_feed(uuid, bigint, integer, uuid[], text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';