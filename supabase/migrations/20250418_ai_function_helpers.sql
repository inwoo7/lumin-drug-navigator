
-- Create a function to get AI conversation by session_id and assistant_type
CREATE OR REPLACE FUNCTION public.get_ai_conversation(
  p_session_id UUID,
  p_assistant_type TEXT
)
RETURNS TABLE (
  thread_id TEXT,
  messages JSONB
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    ai_conversations.thread_id,
    ai_conversations.messages
  FROM 
    public.ai_conversations
  WHERE 
    ai_conversations.session_id = p_session_id AND
    ai_conversations.assistant_type = p_assistant_type;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get session document by session_id
CREATE OR REPLACE FUNCTION public.get_session_document(
  p_session_id UUID
)
RETURNS TABLE (
  id UUID,
  content TEXT
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    session_documents.id,
    session_documents.content
  FROM 
    public.session_documents
  WHERE 
    session_documents.session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Create a function to save or update session document
CREATE OR REPLACE FUNCTION public.save_session_document(
  p_session_id UUID,
  p_content TEXT
)
RETURNS VOID AS $$
DECLARE
  v_document_id UUID;
BEGIN
  -- Check if document exists
  SELECT id INTO v_document_id 
  FROM public.session_documents 
  WHERE session_id = p_session_id;
  
  IF v_document_id IS NOT NULL THEN
    -- Update existing document
    UPDATE public.session_documents
    SET 
      content = p_content,
      updated_at = NOW()
    WHERE id = v_document_id;
  ELSE
    -- Create new document
    INSERT INTO public.session_documents (
      session_id,
      content,
      created_at,
      updated_at
    ) VALUES (
      p_session_id,
      p_content,
      NOW(),
      NOW()
    );
    
    -- Update the session to indicate it has a document
    UPDATE public.search_sessions
    SET has_document = TRUE
    WHERE id = p_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a function to save AI conversation
CREATE OR REPLACE FUNCTION public.save_ai_conversation(
  p_session_id UUID,
  p_assistant_type TEXT,
  p_thread_id TEXT,
  p_messages JSONB
)
RETURNS VOID AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Check if conversation exists
  SELECT id INTO v_conversation_id 
  FROM public.ai_conversations 
  WHERE session_id = p_session_id AND assistant_type = p_assistant_type;
  
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
      created_at,
      updated_at
    ) VALUES (
      p_session_id,
      p_assistant_type,
      p_thread_id,
      p_messages,
      NOW(),
      NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql;
