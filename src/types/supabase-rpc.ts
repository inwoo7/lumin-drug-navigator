
export interface SessionDocument {
  id: string;
  content: string;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface AIConversation {
  id: string;
  session_id: string;
  thread_id: string;
  assistant_type: string;
  messages: {
    id: string;
    role: string;
    content: string;
    timestamp: string;
  }[];
  created_at: string;
  updated_at: string;
}
