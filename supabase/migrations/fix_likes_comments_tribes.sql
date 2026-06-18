-- ============================================================
-- Run this entire file in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. post_likes table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_likes (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own likes" ON post_likes;
CREATE POLICY "Users manage own likes" ON post_likes
  FOR ALL USING (auth.uid() = user_id);

-- ── 2. toggle_like RPC (atomic, deduplicated) ──────────────
CREATE OR REPLACE FUNCTION toggle_like(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid    uuid    := auth.uid();
  v_exists bool;
  v_liked  bool;
  v_count  int;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM post_likes WHERE post_id = p_post_id AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM post_likes WHERE post_id = p_post_id AND user_id = v_uid;
    UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_post_id;
    v_liked := false;
  ELSE
    INSERT INTO post_likes (post_id, user_id) VALUES (p_post_id, v_uid)
      ON CONFLICT DO NOTHING;
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = p_post_id;
    v_liked := true;
  END IF;

  SELECT likes_count INTO v_count FROM posts WHERE id = p_post_id;
  RETURN jsonb_build_object('liked', v_liked, 'likes_count', v_count);
END;
$$;

-- ── 3. comments_count trigger ──────────────────────────────
CREATE OR REPLACE FUNCTION sync_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS sync_comments_count_trigger ON comments;
CREATE TRIGGER sync_comments_count_trigger
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION sync_comments_count();

-- Fix existing comments_count values
UPDATE posts
SET comments_count = (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id);

-- ── 4. tribe member_count trigger ─────────────────────────
CREATE OR REPLACE FUNCTION sync_tribe_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tribes SET member_count = member_count + 1 WHERE id = NEW.tribe_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tribes SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.tribe_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS sync_tribe_member_count_trigger ON tribe_members;
CREATE TRIGGER sync_tribe_member_count_trigger
  AFTER INSERT OR DELETE ON tribe_members
  FOR EACH ROW EXECUTE FUNCTION sync_tribe_member_count();

-- Fix existing tribe member_counts
UPDATE tribes
SET member_count = (SELECT COUNT(*) FROM tribe_members WHERE tribe_members.tribe_id = tribes.id);

-- ── 5. tribe member_count default fix ─────────────────────
-- Default was 1; with the trigger incrementing on every insert,
-- new tribes would start at 1 and immediately become 2.
ALTER TABLE tribes ALTER COLUMN member_count SET DEFAULT 0;
