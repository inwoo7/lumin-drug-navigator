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
  onStateChange?: (state: { isInitialized: boolean; isLoading: boolean }) => void; // Callback for state changes
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
  onStateChange,
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
        console.log(`[${assistantType}] Attempting to load conversation for session ${sessionId}`);
        
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
          
              console.log(`[${assistantType}] Processed ${storedMessages.length} messages to display`);
              
              // Set messages from database
          setMessages(storedMessages);
          setIsInitialized(true);
          setHasAttemptedGeneration(true);
          setIsRestoredSession(true);
          setShouldSendRawData(false);
          console.log(`[${assistantType}] Session restored with ${storedMessages.length} messages.`);
          if (onStateChange) {
            onStateChange({ isInitialized: true, isLoading: false });
          }
            } else {
              console.log(`[${assistantType}] No messages found in the conversation data`);
            }
          } else {
            console.log(`[${assistantType}] No messages array in conversation data`);
          }
        } else {
          console.log(`[${assistantType}] No conversation found for session ${sessionId}`);
        }
      } catch (err) {
        console.error(`[${assistantType}] Error loading conversation:`, err);
      }
    };
    
    loadConversation();
  }, [sessionId, assistantType]);

  // This effect triggers document generation when drug data is available
  useEffect(() => {
    if (isRestoredSession) {
      console.log(`[document] Skipping document generation because session was restored.`);
      if (!isInitialized) setIsInitialized(true);
      return;
    }

    const generateDocumentFromData = async () => {
      if (
        assistantType !== "document" || 
        !generateDocument || 
        !drugShortageData || 
        hasAttemptedGeneration || 
        !sessionId ||
        isLoading ||
        (documentContent && documentContent.length > 0)
      ) {
        if (assistantType === "document" && !isInitialized && !isLoading && !isRestoredSession) {
          console.log("Document assistant not generating document but marking as initialized");
          setIsInitialized(true);
          if (onStateChange) {
            onStateChange({ isInitialized: true, isLoading: false });
          }
        }
        return;
      }
      
      console.log("[document] Starting document generation from drug data (not a restored session).");
      setHasAttemptedGeneration(true);
      setIsLoading(true);
      
      if (onStateChange) {
        onStateChange({ isInitialized: false, isLoading: true });
      }
      
      try {
        // We'll use a simplified message for the UI instead of showing the actual prompt
        const initialMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: "I'm analyzing the drug shortage data to create a comprehensive management plan...",
          timestamp: new Date(),
        };
        
        // Add a placeholder message while we wait - DO NOT add to state
        // setMessages([initialMessage]); // Removed this line
        
        // Generate the document
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

        console.log("Calling OpenAI assistant function to generate document");
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
        
        console.log("Document generation successful, received response");
        
        // Set thread ID for future messages
        if (data.threadId) {
          setThreadId(data.threadId);
          console.log("Thread ID set:", data.threadId);
        }
        
        // Update the chat with a confirmation message instead of showing system instructions
        // Also, do not add this temporary message to the main state
        /* Removed block:
        const completionMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: "I've generated a document based on the drug shortage data. You can now ask me to make changes or explain any part of it.",
          timestamp: new Date(),
        };
        setMessages([completionMessage]); 
        */

        // Ensure conversation is saved *after* potential document generation
        // The actual conversation history (if any exists) should be saved,
        // not the temporary generation messages.
        // We might not have a threadId yet if this was the *very* first action.
        if (data.threadId) {
            // Pass threadId first, then the messages array
            const threadToUse: string | null = data.threadId || null;
            const messagesToSave: Message[] = [];
            saveConversation(threadToUse, messagesToSave); // Save empty messages initially after generation
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error("Error generating document:", err);
        setError(err.message || "An error occurred");
        toast.error("Error generating document. Please try again later.");
        if (onStateChange) {
          onStateChange({ isInitialized: false, isLoading: false });
        }
      }
    };
    
    if (assistantType === "document") {
      generateDocumentFromData();
    }
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
    shouldSendRawData,
    onStateChange,
    isInitialized
  ]);

  // This effect handles loading drug data for the information assistant
  useEffect(() => {
    if (isRestoredSession) {
      console.log(`[shortage] Skipping info assistant initialization because session was restored.`);
      if (!isInitialized) setIsInitialized(true);
      return;
    }

    const initializeInfoAssistant = async () => {
      // Check if this is a restored session from the database first
      if (sessionId && !isInitialized && !hasAttemptedGeneration) {
        try {
          // Check if we already have a conversation in the database
          const { data: existingConversation, error } = await supabase
            .rpc('get_ai_conversation', { 
              p_session_id: sessionId, 
              p_assistant_type: assistantType 
            });
            
          if (existingConversation && existingConversation.length > 0 && existingConversation[0].messages) {
            console.log("Found existing conversation, using that instead of generating new content");
            
            // Mark as restored session to prevent further initialization
            setIsRestoredSession(true);
            setHasAttemptedGeneration(true);
            
            // Parse messages if needed and set initial state
            let existingMessages;
            if (typeof existingConversation[0].messages === 'string') {
              try {
                existingMessages = JSON.parse(existingConversation[0].messages);
              } catch (e) {
                existingMessages = [];
              }
            } else if (Array.isArray(existingConversation[0].messages)) {
              existingMessages = existingConversation[0].messages;
            }
            
            if (existingMessages && existingMessages.length > 0) {
              const formattedMessages = existingMessages.map((msg: any) => ({
                id: msg.id || Date.now().toString(),
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
              }));
              
              // Set messages and thread ID
              setMessages(formattedMessages);
              if (existingConversation[0].thread_id) {
                setThreadId(existingConversation[0].thread_id);
              }
            }
            
            // Set initialized to true and return early to prevent new generation
            setIsInitialized(true);
            if (onStateChange) {
              onStateChange({ isInitialized: true, isLoading: false });
            }
            return;
          }
        } catch (err) {
          console.error("Error checking for existing conversations:", err);
        }
      }
      
      // Only proceed with generation if:
      // 1. We're dealing with the shortage assistant type
      // 2. We haven't attempted generation yet
      // 3. We have drug data available
      // 4. We're not already initialized
      // 5. We're not currently loading
      if (
        assistantType === "shortage" && 
        !hasAttemptedGeneration && 
        drugShortageData && 
        !isInitialized && 
        !isLoading
      ) {
        console.log("[shortage] Initializing shortage assistant with comprehensive analysis (not a restored session).");
        setHasAttemptedGeneration(true);
        setIsLoading(true);
        
        if (onStateChange) {
          onStateChange({ isInitialized: false, isLoading: true });
        }
        
        try {
          // Add a placeholder message showing we're analyzing data (to be displayed to user)
          const initialMessage = {
            id: Date.now().toString(),
            role: "assistant" as const,
            content: "I'm analyzing the drug shortage data and preparing a comprehensive response...",
            timestamp: new Date(),
          };
          
          // Set the placeholder message
          setMessages([initialMessage]);
          
          const initialPrompt = `Generate a comprehensive analysis of the ${drugShortageData?.brand_name || drugShortageData?.drug_name || "drug"} shortage.
Include the following information:
1. Background of the shortage
2. Current status
3. Expected duration
4. Therapeutic alternatives with specific dosing recommendations
5. Conservation strategies
6. Patient prioritization guidance if needed
7. Implementation plan for managing the shortage

Format your response with clear headings and bullet points where appropriate.`;
          
          const { data, error } = await supabase.functions.invoke("openai-assistant", {
            body: {
              assistantType: "shortage",
              messages: [{
                role: "user",
                content: initialPrompt
              }],
              drugData: drugShortageData,
              allShortageData: allShortageData || [],
              sessionId,
              createThreadOnly: false, // Generate a comprehensive first response
              rawData: shouldSendRawData // Only send raw data for initial thread creation
            },
          });
          
          if (error) {
            console.error("Error creating assistant thread:", error);
            toast.error("Error initializing assistant. Using offline mode.");
            
            setIsInitialized(true); // Still mark as initialized so user can interact
            if (onStateChange) {
              onStateChange({ isInitialized: true, isLoading: false });
            }
          } else {
            // Set thread ID for future messages
            if (data.threadId) {
              setThreadId(data.threadId);
            }
            
            // Add the initial comprehensive analysis to the chat
            if (data.message) {
              const responseMessage = {
                id: Date.now().toString(),
                role: "assistant" as const,
                content: data.message,
                timestamp: new Date(),
              };
              
              // Replace the placeholder with the actual response
              setMessages([responseMessage]);
              
              // Save this conversation to the database, passing threadId and messages
              saveConversation(threadId, [responseMessage]);
            }
            
            // After initialization, we don't need to send raw data anymore
            setShouldSendRawData(false);
            // Set initialized to true only AFTER we've processed the response
            setIsInitialized(true);
            if (onStateChange) {
              onStateChange({ isInitialized: true, isLoading: false });
            }
          }
        } catch (err: any) {
          console.error("Error initializing info assistant:", err);
          toast.error("Error connecting to assistant service. Using offline mode.");
          
          setIsInitialized(true); // Still mark as initialized to allow user interaction
          if (onStateChange) {
            onStateChange({ isInitialized: true, isLoading: false });
          }
        } finally {
          setIsLoading(false);
        }
      } else if (assistantType === "shortage" && !isInitialized && !isLoading) {
        // For shortage assistants that don't need generation but aren't initialized (and not restored)
        console.log("Shortage assistant has no data to generate but marking as initialized");
        setIsInitialized(true);
        if (onStateChange) {
          onStateChange({ isInitialized: true, isLoading: false });
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
    shouldSendRawData,
    onStateChange
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
    if (!content.trim() || (isLoading && !isInitialized)) {
      throw new Error("Cannot send message while loading or not initialized");
    }
    
    // Set loading state
    setIsLoading(true);
    
    console.log(`Sending message for ${assistantType} assistant. Document edit: ${content.includes("Please edit")}`);
    
    // Create unique message ID
    const messageId = Date.now().toString();
    
    try {
      // Add user message to chat
      const userMessage = {
        id: messageId,
        role: "user" as const,
        content,
        timestamp: new Date(),
      };
      
      // Check if this is a document edit request
      const isDocEdit = (assistantType === "document" &&
        (content.includes("Please edit the document") || 
         content.toLowerCase().includes("update the document")));
      
      // Update messages in UI (optimistic update)
      addMessage("user", content);
      
      // If we don't have a thread ID yet, we need to initialize
      if (!threadId && !isRestoredSession) {
        // We can't generate a thread here, so return a fallback message
        console.log("No thread ID available and not initialized yet");
      }
      
      // Return early with a message if we're in offline mode
      if (!threadId) {
        console.log("No thread ID available, returning fallback response");
        
        const fallbackMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: "I'm unable to connect to the AI service at this time. Please try again later.",
          timestamp: new Date(),
        };
        
        // Add fallback message
        setMessages(prev => [...prev, fallbackMessage]);
        
        // Save conversation
        saveConversation();
        
        return fallbackMessage.content;
      }
      
      // Send the message to the assistant
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          messages: [{ role: "user", content }],
          sessionId,
          threadId,
          drugData: drugShortageData,
          allShortageData: allShortageData || [],
          documentContent,
          isDocumentEdit: isDocEdit,
          rawData: false // Never send raw data for regular messages
        },
      });
      
      // If there was an error, handle it
      if (error) {
        console.error("Error sending message:", error);
        
        const errorMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: "I'm sorry, there was an error processing your request. Please try again.",
          timestamp: new Date(),
        };
        
        // Add error message
        setMessages(prev => [...prev, errorMessage]);
        
        // Save conversation
        saveConversation();
        
        // Return error message
        return errorMessage.content;
      }
      
      // Handle the response
      if (data && data.message) {
        let assistantResponse = data.message;
        let chatResponse = data.message;
        
        // Function to detect if response contains document structure
        const isDocumentContent = (text: string) => {
          return assistantType === "document" && (
            // Full document or sections
            text.startsWith("# ") || 
            text.includes("## Executive Summary") ||
            text.includes("## Product Details") ||
            text.includes("## Shortage Impact Assessment") ||
            text.includes("## Therapeutic Alternatives") ||
            text.includes("## Conservation Strategies") ||
            
            // Markdown formatting indicates document
            (text.split("\n").filter(line => line.startsWith("#")).length >= 3) ||
            
            // Document language
            text.includes("Drug Shortage Management Plan") ||
            
            // Explicit document edit confirmation
            text.includes("I've updated the document")
          );
        };
        
        // For document edits or content, handle appropriately
        if (isDocEdit || isDocumentContent(assistantResponse)) {
          // For document edits, use standardized message
          if (isDocEdit) {
            chatResponse = "I've updated the document according to your instructions. The changes have been applied to the document editor.";
          } else if (isDocumentContent(assistantResponse)) {
            // For content that looks like a document but wasn't an explicit edit
            chatResponse = "I've prepared content for your document based on the drug shortage data. The changes have been automatically applied to the document.";
          }
          
          console.log("Document content detected, updating document");
          
          // For the document update, use the full content
          if (onDocumentUpdate) {
            onDocumentUpdate(assistantResponse);
          }
        }
        
        // Add AI response to messages
        const responseMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: chatResponse, // Use the chat-friendly version for display
          timestamp: new Date(),
        };
        
        // Update messages
        setMessages(prev => [...prev, responseMessage]);
        
        // Save conversation
        saveConversation();
        
        // Return the full response for document purposes, or the chat response otherwise
        return isDocEdit || isDocumentContent(assistantResponse) ? assistantResponse : chatResponse;
      } else {
        console.error("No message in response:", data);
        
        // If no message was returned but we didn't get an error, add a fallback message
        const fallbackMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: "I'm sorry, I couldn't generate a response. Please try again with a different question.",
          timestamp: new Date(),
        };
        
        // Add fallback message
        setMessages(prev => [...prev, fallbackMessage]);
        
        // Save conversation
        saveConversation();
        
        // Return fallback message
        return fallbackMessage.content;
      }
    } catch (err) {
      console.error("Error in send message:", err);
      
      // Add error message
      const errorMessage = {
        id: Date.now().toString(),
        role: "assistant" as const,
        content: "I'm sorry, something went wrong. Please try again later.",
        timestamp: new Date(),
      };
      
      // Update messages
      setMessages(prev => [...prev, errorMessage]);
      
      // Save conversation
      saveConversation();
      
      // Return error message
      return errorMessage.content;
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to save conversation to database
  const saveConversation = async (threadToSave: string | null = threadId, newMessages?: Message[]) => {
    // Use provided threadId or the state one
    const currentThreadId = threadToSave || threadId;
    if (!sessionId || !currentThreadId) return;
    
    try {
      // Prepare the full message list to save (include new messages if provided)
      const allMessages = newMessages 
        ? [...messages, ...newMessages] // Combine existing state with new ones for saving
        : messages; // Save only existing state messages
      
      // Skip saving if there are no messages in the combined list
      if (allMessages.length === 0) {
        console.log(`[${assistantType}] No messages to save for session ${sessionId}`);
        return;
      }
      
      // Format messages for database storage
      const formattedMessages = allMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));
      
      // Save to database - PASS THE OBJECT DIRECTLY, NOT STRINGIFIED
      await supabase.rpc('save_ai_conversation', {
        p_session_id: sessionId,
        p_assistant_type: assistantType,
        p_thread_id: currentThreadId,
        p_messages: formattedMessages // Pass the object directly
      });
      
      console.log(`Saved ${formattedMessages.length} messages for ${assistantType} conversation using thread ${currentThreadId}`);
    } catch (saveErr) {
      console.error(`[${assistantType}] Error saving conversation:`, saveErr);
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
              console.log("[Debug] Setting messages from debug load (parsed string)");
              
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
        } else if (Array.isArray(data[0].messages) && data[0].messages.length > 0 && messages.length === 0) {
           // Handle case where messages are already a JSON array/object
           console.log("[Debug] Setting messages from debug load (direct array/object)");
           const directMessages = data[0].messages;
           const formattedMessages = directMessages.map((msg: any) => ({
             id: msg.id || Date.now().toString(),
             role: msg.role as "user" | "assistant",
             content: msg.content,
             timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
           }));

           setMessages(formattedMessages);
           setIsInitialized(true);
           setIsRestoredSession(true);

        } else if (messages.length > 0) {
            console.log("[Debug] Messages already loaded, skipping debug set.");
        } else {
             console.log("[Debug] No usable messages found in debug data.");
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

  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isInitialized, isLoading });
    }
  }, [isInitialized, isLoading, onStateChange]);

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
