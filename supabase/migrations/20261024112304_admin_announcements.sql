-- WanTone operation announcements; no changes to existing notifications.
CREATE TABLE public.wt_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'owner', 'coach')),
  is_published boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_date_order CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX wt_announcements_publication_idx ON public.wt_announcements(is_published, starts_at DESC);
CREATE TABLE public.wt_announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.wt_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX wt_announcement_reads_user_idx ON public.wt_announcement_reads(user_id);

ALTER TABLE public.wt_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wt_announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select" ON public.wt_announcements FOR SELECT TO authenticated
USING (
  (SELECT public.wt_is_admin())
  OR (
    is_published = true AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
    AND EXISTS (
      SELECT 1 FROM public.wt_user_roles AS role
      WHERE role.user_id = (SELECT auth.uid())
        AND (audience = 'all' OR audience = role.role)
    )
  )
);
CREATE POLICY "announcements_admin_insert" ON public.wt_announcements FOR INSERT TO authenticated
WITH CHECK ((SELECT public.wt_is_admin()) AND created_by = (SELECT auth.uid()));
CREATE POLICY "announcements_admin_update" ON public.wt_announcements FOR UPDATE TO authenticated
USING ((SELECT public.wt_is_admin()))
WITH CHECK ((SELECT public.wt_is_admin()) AND created_by IS NOT NULL);
CREATE POLICY "announcements_admin_delete" ON public.wt_announcements FOR DELETE TO authenticated
USING ((SELECT public.wt_is_admin()));

CREATE POLICY "announcement_reads_select" ON public.wt_announcement_reads FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "announcement_reads_insert" ON public.wt_announcement_reads FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.wt_announcements a WHERE a.id = announcement_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wt_announcements TO authenticated;
GRANT SELECT, INSERT ON public.wt_announcement_reads TO authenticated;
-- Ownership, audience and publication are always enforced by RLS above.
