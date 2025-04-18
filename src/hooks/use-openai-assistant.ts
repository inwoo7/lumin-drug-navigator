import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AIConversation } from "@/types/supabase-rpc";

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
  rawApiData?: boolean; // Flag to indicate we should send the raw API data
};

export const useOpenAIAssistant = ({
  assistantType,
  sessionId,
  drugShortageData,
  allShortageData,
  documentContent,
  autoInitialize = false,
  onDocumentUpdate,
  generateDocument = false,
  rawApiData = false,
}: UseOpenAIAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState<boolean>(false);

  useEffect(() => {
    const loadConversation = async () => {
      if (!sessionId) return;
      
      try {
        const { data: conversations, error } = await supabase
          .rpc('get_ai_conversation', { 
            p_session_id: sessionId, 
            p_assistant_type: assistantType 
          });
          
        if (error) {
          console.error("Error loading conversation:", error);
          return;
        }
        
        if (conversations && conversations.length > 0) {
          const conversationData = conversations[0];
          setThreadId(conversationData.thread_id);
          
          if (conversationData.messages && Array.isArray(conversationData.messages)) {
            const storedMessages = conversationData.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              timestamp: new Date(msg.timestamp)
            }));
            
            setMessages(storedMessages);
            setIsInitialized(true);
            
            // Skip auto-initialization if we loaded messages from DB
            if (storedMessages.length > 0) {
              setHasAttemptedGeneration(true);
            }
          }
        }
      } catch (err) {
        console.error("Error loading conversation:", err);
      }
    };
    
    loadConversation();
  }, [sessionId, assistantType]);

  // This effect triggers document generation when drug data is available
  useEffect(() => {
    const generateDocumentFromData = async () => {
      if (
        assistantType === "document" && 
        generateDocument && 
        drugShortageData && 
        !hasAttemptedGeneration && 
        sessionId &&
        !isLoading
      ) {
        setHasAttemptedGeneration(true);
        setIsLoading(true);
        
        try {
          const generationPrompt = `Generate a comprehensive drug shortage management plan for ${drugShortageData.brand_name || drugShortageData.drug_name}. 
Include the following sections:
1. Executive Summary - Overview of the shortage situation
2. Product Details - Information about the affected medication
3. Shortage Impact Assessment - How this affects patient care
4. Therapeutic Alternatives - Available alternatives with dosing information
5. Conservation Strategies - How to manage limited supply
6. Patient Prioritization - Criteria for allocation if needed
7. Implementation Plan - Steps for implementing the management plan
8. Communication Strategy - How to communicate with staff and patients

Use the complete drug shortage data to create a professional, detailed, and actionable document. 
Include evidence-based recommendations where possible.
Format the document in Markdown with clear headings and sections.`;

          const { data, error } = await supabase.functions.invoke("openai-assistant", {
            body: {
              assistantType: "document",
              messages: [{
                role: "user",
                content: generationPrompt
              }],
              drugData: drugShortageData,
              allShortageData: allShortageData || [],
              sessionId,
              generateDocument: true,
              rawData: true // Flag to indicate we need raw API data
            },
          });
          
          if (error) {
            console.error("Error generating document:", error);
            return;
          }
          
          if (data.error) {
            console.error("Error from document generation:", data.error);
            return;
          }
          
          // Set thread ID for future messages
          if (data.threadId) {
            setThreadId(data.threadId);
          }
          
          // Update document via callback
          if (onDocumentUpdate && data.message) {
            onDocumentUpdate(data.message);
          }
          
          // Add the system message to chat history
          addMessage("assistant", "I've generated a document based on the drug shortage data. You can now ask me to make changes or explain any part of it.");
          
          // Save this conversation to the database
          if (sessionId && data.threadId) {
            try {
              await supabase.rpc('save_ai_conversation', {
                p_session_id: sessionId,
                p_assistant_type: assistantType,
                p_thread_id: data.threadId,
                p_messages: JSON.stringify([{
                  id: Date.now().toString(),
                  role: "assistant",
                  content: "I've generated a document based on the drug shortage data. You can now ask me to make changes or explain any part of it.",
                  timestamp: new Date().toISOString()
                }])
              });
            } catch (saveErr) {
              console.error("Error saving conversation:", saveErr);
            }
          }
          
          setIsInitialized(true);
        } catch (err: any) {
          console.error("Error generating document:", err);
          setError(err.message || "An error occurred");
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    generateDocumentFromData();
  }, [
    assistantType, 
    generateDocument, 
    drugShortageData, 
    hasAttemptedGeneration,
    sessionId, 
    isLoading,
    onDocumentUpdate,
    allShortageData
  ]);

  useEffect(() => {
    const initialize = async () => {
      if (autoInitialize && !isInitialized && !isLoading && drugShortageData) {
        // Skip initialization if we already have messages (e.g., from DB load)
        if (messages.length > 0) {
          setIsInitialized(true);
          return;
        }
        
        if (sessionId && !threadId) {
          setIsLoading(true);
          
          try {
            const { data, error } = await supabase.functions.invoke("openai-assistant", {
              body: {
                assistantType,
                messages: [],
                drugData: drugShortageData,
                allShortageData: allShortageData || [],
                documentContent,
                sessionId,
                generateDocument: generateDocument || assistantType === "document",
                rawData: true // Always send raw API data
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
            
            setThreadId(data.threadId);
            
            if (data.messages && data.messages.length > 0) {
              const formattedMessages = data.messages.map((msg: any) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: new Date(msg.timestamp)
              }));
              
              setMessages(formattedMessages);
              
              if (assistantType === "document" && onDocumentUpdate && formattedMessages.length > 0) {
                const assistantMessages = formattedMessages.filter(msg => msg.role === "assistant");
                if (assistantMessages.length > 0) {
                  onDocumentUpdate(assistantMessages[0].content);
                }
              }
            } else {
              const initialMessage = {
                id: Date.now().toString(),
                role: "assistant" as const,
                content: data.message,
                timestamp: new Date(),
              };
              
              setMessages([initialMessage]);
              
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
    generateDocument,
    rawApiData
  ]);

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

  const sendMessage = async (content: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      addMessage("user", content);
      
      const messagesForAPI = [{
        role: "user",
        content
      }];
      
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          messages: messagesForAPI,
          drugData: drugShortageData,
          allShortageData: allShortageData || [],
          documentContent,
          sessionId,
          threadId,
          rawData: true, // Always send raw API data
          isDocumentEdit: content.includes("Please edit the document with the following instructions:")
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
      
      if (data.threadId && !threadId) {
        setThreadId(data.threadId);
      }
      
      addMessage("assistant", data.message);
      
      if (assistantType === "document" && onDocumentUpdate) {
        onDocumentUpdate(data.message);
      }
      
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
