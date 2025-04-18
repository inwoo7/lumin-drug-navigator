
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export type AssistantType = "shortage" | "document";

type UseOpenAIAssistantProps = {
  assistantType: AssistantType;
  sessionId?: string;
  drugShortageData: any; // The drug shortage report data
  allShortageData?: any[]; // All drug shortage data for comprehensive analysis
  documentContent?: string; // Current document content for document assistant
  autoInitialize?: boolean; // Whether to automatically initialize the assistant
};

// Define the types for our custom RPC function responses
type AIConversationResponse = {
  thread_id: string;
  messages: any[];
}

export const useOpenAIAssistant = ({
  assistantType,
  sessionId,
  drugShortageData,
  allShortageData,
  documentContent,
  autoInitialize = false,
}: UseOpenAIAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Load existing conversation if available
  useEffect(() => {
    const loadConversation = async () => {
      if (!sessionId) return;
      
      try {
        // Use RPC function to load conversation since types don't include new tables
        const { data, error } = await supabase.rpc(
          'get_ai_conversation', 
          { 
            p_session_id: sessionId, 
            p_assistant_type: assistantType 
          }
        );
          
        if (error) {
          if (error.code !== 'PGRST116') { // PGRST116 is the "not found" error
            console.error("Error loading conversation:", error);
          }
          return;
        }
        
        if (data && Array.isArray(data) && data.length > 0) {
          const conversationData = data[0] as AIConversationResponse;
          setThreadId(conversationData.thread_id);
          
          // Convert the stored messages to our format
          const storedMessages = conversationData.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp)
          }));
          
          setMessages(storedMessages);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error("Error loading conversation:", err);
      }
    };
    
    loadConversation();
  }, [sessionId, assistantType]);

  // Auto-initialize assistant when requested
  useEffect(() => {
    const initialize = async () => {
      if (autoInitialize && !isInitialized && !isLoading && drugShortageData) {
        // Only initialize if we have a session ID and haven't already done so
        if (sessionId && messages.length === 0 && !threadId) {
          setIsLoading(true);
          
          try {
            const { data, error } = await supabase.functions.invoke("openai-assistant", {
              body: {
                assistantType,
                messages: [],
                drugData: drugShortageData,
                allShortageData,
                documentContent,
                sessionId,
              },
            });
            
            if (error) {
              console.error("Error initializing assistant:", error);
              toast.error("Failed to initialize AI assistant");
              setError(error.message);
              return;
            }
            
            if (data.error) {
              console.error("Error from OpenAI assistant:", data.error);
              toast.error(data.error);
              setError(data.error);
              return;
            }
            
            // Set thread ID and initial message
            setThreadId(data.threadId);
            
            if (data.messages && data.messages.length > 0) {
              setMessages(data.messages.map((msg: any) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: new Date(msg.timestamp)
              })));
            } else {
              // Fallback if we don't get messages back
              setMessages([{
                id: Date.now().toString(),
                role: "assistant",
                content: data.message,
                timestamp: new Date(),
              }]);
            }
            
            setIsInitialized(true);
          } catch (err: any) {
            console.error("Error in initializing assistant:", err);
            setError(err.message || "An error occurred");
            toast.error("Failed to initialize AI assistant");
          } finally {
            setIsLoading(false);
          }
        }
      }
    };
    
    initialize();
  }, [
    autoInitialize, 
    isInitialized, 
    messages.length, 
    sessionId, 
    assistantType, 
    threadId, 
    isLoading, 
    drugShortageData, 
    allShortageData, 
    documentContent
  ]);

  // Function to add a message to the local state
  const addMessage = (role: "user" | "assistant", content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
    };
    
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    return newMessage;
  };

  // Function to send a message to the assistant
  const sendMessage = async (content: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Add the user message to the chat
      addMessage("user", content);
      
      // Prepare the messages in the format expected by OpenAI
      const messagesForAPI = [{
        role: "user",
        content
      }];
      
      // Call the Supabase Edge Function
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          messages: messagesForAPI,
          drugData: drugShortageData,
          allShortageData,
          documentContent,
          sessionId,
          threadId, // Include thread ID for continuing the conversation
        },
      });
      
      if (error) {
        console.error("Error calling OpenAI assistant:", error);
        setError(error.message || "Failed to get response from assistant");
        toast.error("Failed to get response from AI assistant");
        return;
      }
      
      if (data.error) {
        console.error("Error from OpenAI assistant:", data.error);
        setError(data.error);
        toast.error(data.error);
        return;
      }
      
      // Store threadId for future messages
      if (data.threadId && !threadId) {
        setThreadId(data.threadId);
      }
      
      // Add the assistant's response to the chat
      addMessage("assistant", data.message);
      
      // If this is for document content, return the response for potential document updates
      return data.message;
      
    } catch (err: any) {
      console.error("Error in sendMessage:", err);
      setError(err.message || "An error occurred");
      toast.error("Failed to communicate with AI assistant");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    addMessage,
    isInitialized,
    threadId,
  };
};
