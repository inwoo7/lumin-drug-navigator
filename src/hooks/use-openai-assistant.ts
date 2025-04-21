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
        console.log(`Attempting to load conversation for session ${sessionId}, assistant type: ${assistantType}`);
        
        const { data: conversations, error } = await supabase
          .rpc('get_ai_conversation', { 
            p_session_id: sessionId, 
            p_assistant_type: assistantType 
          });
          
        if (error) {
          console.error("Error loading conversation:", error);
          return;
        }
        
        console.log(`Loaded conversations data:`, conversations);
        
        if (conversations && conversations.length > 0) {
          const conversationData = conversations[0];
          setThreadId(conversationData.thread_id);
          console.log(`Set thread ID to ${conversationData.thread_id}`);
          
          // Handle various possible message formats
          if (conversationData.messages) {
            let messagesArray;
            
            // Handle string JSON
            if (typeof conversationData.messages === 'string') {
              try {
                messagesArray = JSON.parse(conversationData.messages);
              } catch (e) {
                console.error("Failed to parse messages JSON string:", e);
                messagesArray = [];
              }
            } 
            // Handle JSONB/object
            else if (typeof conversationData.messages === 'object') {
              messagesArray = Array.isArray(conversationData.messages) 
                ? conversationData.messages 
                : [];
            } else {
              messagesArray = [];
            }
            
            console.log(`Processing ${messagesArray.length} stored messages`);
            
            if (messagesArray.length > 0) {
              const storedMessages = messagesArray.map((msg: any) => ({
                id: msg.id || Date.now().toString(),
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
              }));
              
              console.log(`Processed ${storedMessages.length} messages to display`);
              
              // Set messages from database
              setMessages(storedMessages);
              setIsInitialized(true);
              
              // Skip auto-initialization if we loaded messages from DB
              if (storedMessages.length > 0) {
                setHasAttemptedGeneration(true);
                setIsRestoredSession(true);
                setShouldSendRawData(false); // Don't send raw data for restored sessions
                console.log(`Session restored with ${storedMessages.length} messages`);
              }
            } else {
              console.log("No messages found in the conversation data");
            }
          } else {
            console.log("No messages array in conversation data");
          }
        } else {
          console.log(`No conversation found for session ${sessionId} and assistant type ${assistantType}`);
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
      // Only generate a report if:
      // 1. We're dealing with a shortage assistant
      // 2. We haven't attempted generation before
      // 3. We have drug data to work with
      // 4. We're not already initialized
      // 5. We're not currently loading anything
      // 6. This is NOT a restored session from database
      // 7. We don't already have messages loaded
      // 8. We don't have existing document content
      if (
        assistantType === "shortage" && 
        !hasAttemptedGeneration && 
        drugShortageData && 
        !isInitialized && 
        !isLoading &&
        !isRestoredSession && // Don't initialize if we're in a restored session
        messages.length === 0 && // Don't generate if we already have messages
        (!documentContent || documentContent.length === 0) // Don't generate if we already have document content
      ) {
        console.log("Starting comprehensive report generation for new session");
        setHasAttemptedGeneration(true);
        setIsLoading(true);
        
        try {
          console.log("Initializing shortage info assistant with comprehensive report generation");
          
          // Generate a comprehensive report when first initializing the assistant
          const comprehensivePrompt = `Generate a comprehensive report about ${drugShortageData.brand_name || drugShortageData.drug_name} shortage using the provided data. Include:
1. Overview of the shortage situation
2. Expected timeline for resolution
3. Therapeutic alternatives with dosing information
4. Conservation strategies
5. Patient prioritization criteria if needed

Format the response with clear headings and concise information.`;

          const { data, error } = await supabase.functions.invoke("openai-assistant", {
            body: {
              assistantType: "shortage",
              messages: [{
                role: "user",
                content: comprehensivePrompt
              }],
              drugData: drugShortageData,
              allShortageData: allShortageData || [],
              sessionId,
              rawData: shouldSendRawData, // Only send raw data for initial thread creation
              generateReport: true // Flag to indicate we want to generate a comprehensive report
            },
          });
          
          if (error) {
            console.error("Error initializing shortage assistant:", error);
            toast.error("Error initializing assistant. Using offline mode.");
          } else {
            // Set thread ID for future messages
            if (data.threadId) {
              setThreadId(data.threadId);
            }
            
            // Add the assistant's response to the chat
            if (data.message) {
              const assistantMessage = {
                id: Date.now().toString(),
                role: "assistant" as const,
                content: data.message,
                timestamp: new Date(),
              };
              
              setMessages(prevMessages => [...prevMessages, assistantMessage]);
              
              // Save the comprehensive report to the database
              if (sessionId && data.threadId) {
                try {
                  await supabase.rpc('save_ai_conversation', {
                    p_session_id: sessionId,
                    p_assistant_type: assistantType,
                    p_thread_id: data.threadId,
                    p_messages: JSON.stringify([assistantMessage])
                  });
                  console.log("Saved comprehensive report conversation to database");
                } catch (saveErr) {
                  console.error("Error saving conversation:", saveErr);
                }
              }
            }
          }
          
          // After initialization, we don't need to send raw data anymore
          setShouldSendRawData(false);
          setIsInitialized(true);
        } catch (err: any) {
          console.error("Error initializing info assistant:", err);
          toast.error("Error connecting to assistant service. Using offline mode.");
        } finally {
          setIsLoading(false);
        }
      } else if (assistantType === "shortage" && !isInitialized && !isLoading && (isRestoredSession || messages.length > 0 || (documentContent && documentContent.length > 0))) {
        // If we're restoring a session or already have messages or document content, just mark as initialized
        console.log("Restored session or existing content detected, skipping report generation");
        setIsInitialized(true);
        setHasAttemptedGeneration(true);
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
    shouldSendRawData,
    messages.length, // Add messages.length as dependency
    documentContent // Add documentContent as dependency
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
    if (!content.trim()) return;
    
    // If we're not initialized, we can't send messages
    if (!isInitialized) {
      toast.error("Assistant is not initialized yet. Please wait.");
      return;
    }
    
    // Add user message immediately for better UX
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          threadId,
          messages: [{ role: "user", content }],
          drugData: drugShortageData,
          documentContent: assistantType === "document" ? documentContent : undefined,
          allShortageData: allShortageData || [],
          saveToDatabase: true, // Flag to indicate this message should be saved to database
        },
      });
      
      if (error) {
        console.error("Error sending message:", error);
        handleError(error);
        return;
      }
      
      if (data && data.message) {
        // Add the assistant's response
        const assistantMessage: Message = {
          id: data.messageId || Date.now().toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        };
        
        setMessages((prev) => [...prev, assistantMessage]);
        
        // For document assistant, we might want to update the document content
        if (assistantType === "document" && onDocumentUpdate) {
          onDocumentUpdate(data.message);
        }
        
        // Save this conversation to the database if we have a session ID and thread ID
        if (sessionId && threadId) {
          try {
            await saveConversation([userMessage, assistantMessage]);
          } catch (saveErr) {
            console.error("Error saving conversation:", saveErr);
          }
        }
        
        // Return the assistant's message in case the component needs it
        return data.message;
      }
    } catch (err: any) {
      console.error("Error in sending message:", err);
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to handle errors consistently
  const handleError = (error: any) => {
    setError(error.message || "An error occurred");
    toast.error("Failed to communicate with AI assistant");
    
    // Add a fallback message if appropriate
    const errorMessage = {
      id: Date.now().toString(),
      role: "assistant" as const,
      content: "I apologize, but I encountered a technical error. Please try again later.",
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, errorMessage]);
    
    // Try to save the error conversation if we have the necessary IDs
    if (sessionId && threadId) {
      try {
        saveConversation([errorMessage]);
      } catch (saveErr) {
        console.error("Error saving error conversation:", saveErr);
      }
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

  // Utility function to debug saved conversation state
  const loadMessages = async () => {
    if (!sessionId) {
      console.log("Cannot load messages without a session ID");
      return;
    }
    
    try {
      console.log(`Attempting to load conversation for debug: ${sessionId}, ${assistantType}`);
      
      const { data, error } = await supabase
        .rpc('get_ai_conversation', { 
          p_session_id: sessionId, 
          p_assistant_type: assistantType 
        });
        
      if (error) {
        console.error("Debug loading error:", error);
        return;
      }
      
      console.log("Debug conversation data:", data);
      
      if (data && data.length > 0) {
        console.log("Thread ID:", data[0].thread_id);
        console.log("Messages:", data[0].messages);
        
        // Check messages format
        if (typeof data[0].messages === 'string') {
          try {
            const parsed = JSON.parse(data[0].messages);
            console.log("Parsed messages:", parsed);
            
            // If there are messages and we don't have any loaded, use them
            if (Array.isArray(parsed) && parsed.length > 0 && messages.length === 0) {
              console.log("Setting messages from debug load");
              
              const formattedMessages = parsed.map((msg: any) => ({
                id: msg.id || Date.now().toString(),
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
              }));
              
              setMessages(formattedMessages);
              setIsInitialized(true);
              setIsRestoredSession(true);
            }
          } catch (e) {
            console.error("Failed to parse debug messages:", e);
          }
        }
      } else {
        console.log("No debug conversation data found");
      }
    } catch (err) {
      console.error("Debug loading error:", err);
    }
  };
  
  // If no messages were loaded but we have a session, try debug load
  useEffect(() => {
    if (sessionId && isInitialized && messages.length === 0) {
      console.log("No messages loaded but session exists, trying debug load");
      loadMessages();
    }
  }, [sessionId, isInitialized, messages.length]);

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
