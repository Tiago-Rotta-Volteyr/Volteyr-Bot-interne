-- ============================================================
-- Politique RLS : autoriser le renommage des conversations
-- ============================================================
--
-- 1. Va sur https://supabase.com/dashboard et ouvre ton projet
-- 2. Menu de gauche : SQL Editor
-- 3. New query
-- 4. Colle ce script ci-dessous et clique sur Run (ou Ctrl+Enter)
--
-- ============================================================

-- Activer RLS sur la table chats (si pas déjà fait)
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Politique UPDATE : l'utilisateur peut modifier uniquement ses propres conversations
DROP POLICY IF EXISTS "Users can update own chats" ON public.chats;
CREATE POLICY "Users can update own chats"
  ON public.chats
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
