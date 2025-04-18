
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
  onDocumentUpdate?: (content: string) => void; // Callback to update document
  generateDocument?: boolean; // Flag to generate document on initialization
};

// Define the type for conversation in the database
interface AIConversation {
  id: string;
  thread_id: string;
  assistant_type: string;
  session_id: string;
  messages: {
    id: string;
    role: string;
    content: string;
    timestamp: string;
  }[];
  created_at: string;
  updated_at: string;
}

export const useOpenAIAssistant = ({
  assistantType,
  sessionId,
  drugShortageData,
  allShortageData,
  documentContent,
  autoInitialize = false,
  onDocumentUpdate,
  generateDocument = false,
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
        // Use RPC function to load conversation
        const { data, error } = await supabase.rpc('get_ai_conversation', { 
          p_session_id: sessionId, 
          p_assistant_type: assistantType 
        });
          
        if (error) {
          console.error("Error loading conversation:", error);
          return;
        }
        
        if (data && Array.isArray(data) && data.length > 0) {
          const conversationData = data[0] as AIConversation;
          setThreadId(conversationData.thread_id);
          
          // Convert the stored messages to our format
          if (conversationData.messages && Array.isArray(conversationData.messages)) {
            const storedMessages = conversationData.messages.map((msg) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              timestamp: new Date(msg.timestamp)
            }));
            
            setMessages(storedMessages);
            setIsInitialized(true);
          }
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
                allShortageData: allShortageData || [], // Send all data regardless
                documentContent,
                sessionId,
                generateDocument: generateDocument || assistantType === "document", // Flag to generate document
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
              const formattedMessages = data.messages.map((msg: any) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: new Date(msg.timestamp)
              }));
              
              setMessages(formattedMessages);
              
              // If this is a document assistant, update document with the first response
              if (assistantType === "document" && onDocumentUpdate && formattedMessages.length > 0) {
                const assistantMessages = formattedMessages.filter(msg => msg.role === "assistant");
                if (assistantMessages.length > 0) {
                  onDocumentUpdate(assistantMessages[0].content);
                }
              }
            } else {
              // Fallback if we don't get messages back
              const initialMessage = {
                id: Date.now().toString(),
                role: "assistant" as const,
                content: data.message,
                timestamp: new Date(),
              };
              
              setMessages([initialMessage]);
              
              // If this is a document assistant, update document
              if (assistantType === "document" && onDocumentUpdate) {
                onDocumentUpdate(data.message);
              }
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
    documentContent,
    onDocumentUpdate,
    generateDocument
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
          allShortageData: allShortageData || [], // Send all data regardless
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
      
      // If this is for document content, update document automatically
      if (assistantType === "document" && onDocumentUpdate) {
        onDocumentUpdate(data.message);
      }
      
      // Save the conversation to the database if we have a session ID
      if (sessionId && data.threadId) {
        try {
          await supabase.rpc('save_ai_conversation', {
            p_session_id: sessionId,
            p_assistant_type: assistantType,
            p_thread_id: data.threadId,
            p_messages: JSON.stringify(
              [...messages, { 
                id: Date.now().toString(),
                role: "assistant",
                content: data.message,
                timestamp: new Date().toISOString() 
              }]
            )
          });
        } catch (saveErr) {
          console.error("Error saving conversation:", saveErr);
        }
      }
      
      // Return the response for potential document updates
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
