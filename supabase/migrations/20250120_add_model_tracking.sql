-- Add model_type column to ai_conversations table
ALTER TABLE public.ai_conversations 
ADD COLUMN IF NOT EXISTS model_type TEXT DEFAULT 'openai';

-- Add index on model_type for faster lookups
CREATE INDEX IF NOT EXISTS ai_conversations_model_type_idx ON public.ai_conversations(model_type);

-- Update the save_ai_conversation function to handle model_type
CREATE OR REPLACE FUNCTION public.save_ai_conversation(
  p_session_id UUID,
  p_assistant_type TEXT,
  p_thread_id TEXT,
  p_messages JSONB,
  p_model_type TEXT DEFAULT 'openai'
)
RETURNS VOID AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Check if conversation exists for this model type
  SELECT id INTO v_conversation_id 
  FROM public.ai_conversations 
  WHERE session_id = p_session_id 
    AND assistant_type = p_assistant_type
    AND model_type = p_model_type;
  
  IF v_conversation_id IS NOT NULL THEN
    -- Update existing conversation
    UPDATE public.ai_conversations
    SET 
      thread_id = p_thread_id,
      messages = p_messages,
      updated_at = NOW()
    WHERE id = v_conversation_id;
  ELSE
    -- Create new conversation
    INSERT INTO public.ai_conversations (
      session_id,
      assistant_type,
      thread_id,
      messages,
      model_type,
      created_at,
      updated_at
    ) VALUES (
      p_session_id,
      p_assistant_type,
      p_thread_id,
      p_messages,
      p_model_type,
      NOW(),
      NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update the get_ai_conversation function to handle model_type
CREATE OR REPLACE FUNCTION public.get_ai_conversation(
  p_session_id UUID,
  p_assistant_type TEXT,
  p_model_type TEXT DEFAULT 'openai'
)
RETURNS TABLE (
  thread_id TEXT,
  messages JSONB,
  model_type TEXT
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    ai_conversations.thread_id,
    ai_conversations.messages,
    ai_conversations.model_type
  FROM 
    public.ai_conversations
  WHERE 
    ai_conversations.session_id = p_session_id AND
    ai_conversations.assistant_type = p_assistant_type AND
    ai_conversations.model_type = p_model_type;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get all conversations for a session (for model switching)
CREATE OR REPLACE FUNCTION public.get_all_session_conversations(
  p_session_id UUID,
  p_assistant_type TEXT
)
RETURNS TABLE (
  thread_id TEXT,
  messages JSONB,
  model_type TEXT
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    ai_conversations.thread_id,
    ai_conversations.messages,
    ai_conversations.model_type
  FROM 
    public.ai_conversations
  WHERE 
    ai_conversations.session_id = p_session_id AND
    ai_conversations.assistant_type = p_assistant_type
  ORDER BY ai_conversations.created_at ASC;
END;
$$ LANGUAGE plpgsql; 