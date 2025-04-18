
-- Create a table to store AI conversations (threads and messages)
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  assistant_type TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index on session_id for faster lookups
CREATE INDEX IF NOT EXISTS ai_conversations_session_id_idx ON public.ai_conversations(session_id);

-- Add index on thread_id for faster lookups
CREATE INDEX IF NOT EXISTS ai_conversations_thread_id_idx ON public.ai_conversations(thread_id);

-- Create a table to store session documents
CREATE TABLE IF NOT EXISTS public.session_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.search_sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index on session_id for faster lookups
CREATE INDEX IF NOT EXISTS session_documents_session_id_idx ON public.session_documents(session_id);
