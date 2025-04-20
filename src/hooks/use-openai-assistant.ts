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
  const [isRestoredSession, setIsRestoredSession] = useState<boolean>(false);
  const [shouldSendRawData, setShouldSendRawData] = useState<boolean>(rawApiData);

  // Load existing conversation from database
  useEffect(() => {
    const loadConversation = async () => {
      if (!sessionId) return;
      
      try {
        console.log(`Loading ${assistantType} conversation for session ${sessionId}...`);
        
        const { data: conversations, error } = await supabase
          .rpc('get_ai_conversation', { 
            p_session_id: sessionId, 
            p_assistant_type: assistantType 
          });
          
        if (error) {
          console.error("Error loading conversation:", error);
          return;
        }
        
        console.log(`Retrieved conversations:`, conversations);
        
        if (conversations && conversations.length > 0) {
          const conversationData = conversations[0];
          console.log(`Found conversation with thread ID ${conversationData.thread_id}`);
          setThreadId(conversationData.thread_id);
          
          // The message format might be different depending on how it was saved
          // It could be a string that needs parsing or already a parsed object
          let messageArray = conversationData.messages;
          
          // Parse if it's a string
          if (typeof conversationData.messages === 'string') {
            try {
              messageArray = JSON.parse(conversationData.messages);
            } catch (parseErr) {
              console.error("Error parsing message JSON:", parseErr);
              messageArray = [];
            }
          }
          
          if (messageArray && Array.isArray(messageArray)) {
            console.log(`Loaded ${messageArray.length} messages`);
            
            const storedMessages = messageArray.map((msg: any) => ({
              id: msg.id || Date.now().toString() + Math.random().toString(),
              role: msg.role as "user" | "assistant",
              content: msg.content,
              timestamp: new Date(msg.timestamp)
            }));
            
            console.log("Setting stored messages:", storedMessages);
            
            // Only set messages if we actually have some
            if (storedMessages.length > 0) {
              setMessages(storedMessages);
              setIsInitialized(true);
              setHasAttemptedGeneration(true);
              setIsRestoredSession(true);
              setShouldSendRawData(false); // Don't send raw data for restored sessions
            }
          } else {
            console.warn("No messages found in conversation data or invalid format");
          }
        } else {
          console.log(`No existing ${assistantType} conversation found for session ${sessionId}`);
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
      // Don't generate if:
      // 1. We're not dealing with a document assistant
      // 2. We don't want to generate a document
      // 3. We don't have drug data
      // 4. We've already attempted generation
      // 5. We don't have a session ID
      // 6. We're already loading something
      // 7. We're in a restored session (i.e., session loaded from DB)
      // 8. We already have document content
      if (
        assistantType !== "document" || 
        !generateDocument || 
        !drugShortageData || 
        hasAttemptedGeneration || 
        !sessionId ||
        isLoading ||
        isRestoredSession ||
        (documentContent && documentContent.length > 0)
      ) {
        return;
      }
      
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
            rawData: shouldSendRawData // Only send raw data for new document generations
          },
        });
        
        if (error) {
          console.error("Error generating document:", error);
          toast.error("Error generating document. Please try again later.");
          setIsLoading(false);
          return;
        }
        
        if (data.error) {
          console.error("Error from document generation:", data.error);
          toast.error("Error generating document: " + data.error);
          setIsLoading(false);
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
        
        // After first generation, we don't need to send raw data anymore
        setShouldSendRawData(false);
        setIsInitialized(true);
      } catch (err: any) {
        console.error("Error generating document:", err);
        setError(err.message || "An error occurred");
        toast.error("Error generating document. Please try again later.");
      } finally {
        setIsLoading(false);
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
    allShortageData,
    isRestoredSession,
    documentContent,
    shouldSendRawData
  ]);

  // This effect handles loading drug data for the information assistant
  useEffect(() => {
    const initializeInfoAssistant = async () => {
      if (
        assistantType === "shortage" && 
        !hasAttemptedGeneration && 
        drugShortageData && 
        !isInitialized && 
        !isLoading &&
        !isRestoredSession // Don't initialize if we're in a restored session
      ) {
        setHasAttemptedGeneration(true);
        setIsLoading(true);
        
        try {
          // Don't send any initial message - let the user start the conversation
          setIsInitialized(true);
          setHasAttemptedGeneration(true);
          
          // Create a thread silently, so it's ready for when the user asks a question
          const { data, error } = await supabase.functions.invoke("openai-assistant", {
            body: {
              assistantType: "shortage",
              messages: [],
              drugData: drugShortageData,
              allShortageData: allShortageData || [],
              sessionId,
              createThreadOnly: true, // Only create thread, don't generate a message
              rawData: shouldSendRawData // Only send raw data for initial thread creation
            },
          });
          
          if (error) {
            console.error("Error creating assistant thread:", error);
            toast.error("Error initializing assistant. Using offline mode.");
          } else if (data.threadId) {
            setThreadId(data.threadId);
          }
          
          // After initialization, we don't need to send raw data anymore
          setShouldSendRawData(false);
        } catch (err: any) {
          console.error("Error initializing info assistant:", err);
          toast.error("Error connecting to assistant service. Using offline mode.");
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    // Only run this for the shortage information assistant
    if (assistantType === "shortage") {
      initializeInfoAssistant();
    }
  }, [
    assistantType,
    drugShortageData,
    isInitialized,
    isLoading,
    hasAttemptedGeneration,
    allShortageData,
    sessionId,
    isRestoredSession,
    shouldSendRawData
  ]);

  useEffect(() => {
    const initialize = async () => {
      // Skip if we've already initialized or if we're in the loading state
      if (hasAttemptedGeneration || isInitialized || isLoading || !drugShortageData) {
        return;
      }
      
      // Skip initialization if we already have messages (e.g., from DB load)
      if (messages.length > 0) {
        setIsInitialized(true);
        setHasAttemptedGeneration(true);
        return;
      }
      
      // Skip this initialization for the shortage assistant, it's handled in the separate effect
      if (assistantType === "shortage") {
        return;
      }
      
      // Skip if we're in a restored session with document content
      if (isRestoredSession && documentContent && documentContent.length > 0) {
        setIsInitialized(true);
        setHasAttemptedGeneration(true);
        return;
      }
      
      if (autoInitialize && sessionId && !threadId) {
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
              rawData: shouldSendRawData // Only send raw data for initial document generation
              },
            });
            
            if (error) {
              console.error("Error initializing assistant:", error);
            toast.error("Failed to initialize AI assistant. Using offline mode.");
              setError(error.message);
              return;
            }
            
          if (data && data.error) {
              console.error("Error from OpenAI assistant:", data.error);
            toast.error(data.error || "Error processing request");
              setError(data.error);
              return;
            }
            
          if (data) {
            if (data.threadId) {
            setThreadId(data.threadId);
            }
            
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
            } else if (data.message) {
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
          }
          
          // After initialization, we don't need to send raw data anymore
          setShouldSendRawData(false);
            setIsInitialized(true);
          setHasAttemptedGeneration(true);
          } catch (err: any) {
            console.error("Error in initializing assistant:", err);
            setError(err.message || "An error occurred");
          toast.error("Failed to initialize AI assistant. Using offline mode.");
          } finally {
            setIsLoading(false);
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
    isRestoredSession,
    hasAttemptedGeneration,
    shouldSendRawData
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

  // Enhanced function to send messages with document context
  const sendMessage = async (content: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Create a new message for UI
      const userMessage = addMessage("user", content);
      
      // Check if this is a document edit request
      const isDocEdit = content.includes("Please edit the document with the following instructions:");
      
      // For document editing, ensure the LLM has context of the current document
      // (note: we now include this in the prompt from ChatInterface, but we're
      // ensuring it's also included in the API call)
      let contextualContent = content;
      
      // Make the API call
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          messages: [{
            role: "user",
            content: contextualContent // Send contextual content with document if needed
          }],
          drugData: drugShortageData,
          allShortageData: allShortageData || [],
          documentContent, // Always include current document content
          sessionId,
          threadId,
          rawData: false, // Never send raw data for regular messages
          isDocumentEdit: isDocEdit
        },
      }).catch(err => {
        console.error("Error invoking assistant function:", err);
        throw new Error("Network error connecting to assistant service");
      });
      
      if (error) {
        console.error("Error calling OpenAI assistant:", error);
        setError(error.message || "Failed to get response from assistant");
        toast.error("Failed to get response from AI assistant");
        
        // Add a fallback message
        const fallbackMessage = addMessage("assistant", "I'm sorry, I couldn't process your request due to a connection issue. Please try again later.");
        saveConversation([userMessage, fallbackMessage]);
        return;
      }
      
      if (data && data.error) {
        console.error("Error from OpenAI assistant:", data.error);
        setError(data.error);
        toast.error(data.error || "Error processing your request");
        
        // Add a fallback message
        const fallbackMessage = addMessage("assistant", "I'm sorry, there was an error processing your request. Please try again with a different question.");
        saveConversation([userMessage, fallbackMessage]);
        return;
      }
      
      if (data && data.threadId && !threadId) {
        setThreadId(data.threadId);
      }
      
      if (data && data.message) {
        const assistantMessage = addMessage("assistant", data.message);
        
        if (assistantType === "document" && onDocumentUpdate && isDocEdit) {
          onDocumentUpdate(data.message);
        }
        
        // Save conversation after adding new messages
        saveConversation([userMessage, assistantMessage]);
        
      return data.message;
      } else {
        // Fallback message if no response
        const fallbackMessage = addMessage("assistant", "I'm sorry, I wasn't able to generate a proper response. Please try rephrasing your question.");
        saveConversation([userMessage, fallbackMessage]);
      }
    } catch (err: any) {
      console.error("Error in sendMessage:", err);
      setError(err.message || "An error occurred");
      toast.error("Failed to communicate with AI assistant");
      
      // Add a fallback message
      const errorMessage = addMessage("assistant", "I apologize, but I encountered a technical error. Please try again later.");
      saveConversation([addMessage("user", content), errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to save conversation to database
  const saveConversation = async (newMessages?: Message[]) => {
    if (!sessionId || !threadId) return;
    
    try {
      // Prepare the full message list to save (include new messages if provided)
      const allMessages = newMessages 
        ? [...messages, ...newMessages]
        : messages;
      
      // Skip saving if there are no messages
      if (allMessages.length === 0) return;
      
      // Format messages for database storage
      const formattedMessages = allMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));
      
      // Save to database
      await supabase.rpc('save_ai_conversation', {
        p_session_id: sessionId,
        p_assistant_type: assistantType,
        p_thread_id: threadId,
        p_messages: JSON.stringify(formattedMessages)
      });
      
      console.log(`Saved ${formattedMessages.length} messages for ${assistantType} conversation`);
    } catch (saveErr) {
      console.error("Error saving conversation:", saveErr);
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
