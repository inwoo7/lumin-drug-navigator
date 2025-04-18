
-- Create a table to store AI interactions
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  assistant_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index on session_id for faster lookups
CREATE INDEX IF NOT EXISTS ai_interactions_session_id_idx ON public.ai_interactions(session_id);

-- Add index on created_at for sorting
CREATE INDEX IF NOT EXISTS ai_interactions_created_at_idx ON public.ai_interactions(created_at);
