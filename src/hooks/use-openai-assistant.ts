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
      // 9. We are restoring a session from the database
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
        // If we're a document assistant but won't generate, still mark as initialized
        if (assistantType === "document" && !isInitialized && !isLoading && !isRestoredSession) {
          console.log("Document assistant not generating document but marking as initialized");
          setIsInitialized(true);
          if (onStateChange) {
            onStateChange({ isInitialized: true, isLoading: false });
          }
        }
        return;
      }
      
      console.log("Starting document generation from drug data");
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
        
        // Add a placeholder message while we wait
        setMessages([initialMessage]);
        
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
        
        // Update document via callback
        if (onDocumentUpdate && data.message) {
          console.log("Calling onDocumentUpdate with document content");
          onDocumentUpdate(data.message);
        } else {
          console.warn("Document update callback missing or no message content received");
        }
        
        // Update the chat with a confirmation message instead of showing system instructions
        const completionMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: "I've generated a document based on the drug shortage data. You can now ask me to make changes or explain any part of it.",
          timestamp: new Date(),
        };
        
        // Replace the placeholder message with the completion message
        setMessages([completionMessage]);
        
        // Save this conversation to the database
        if (sessionId && data.threadId) {
          try {
            await supabase.rpc('save_ai_conversation', {
              p_session_id: sessionId,
              p_assistant_type: assistantType,
              p_thread_id: data.threadId,
              p_messages: JSON.stringify([completionMessage])
            });
            console.log("Saved conversation to database");
          } catch (saveErr) {
            console.error("Error saving conversation:", saveErr);
          }
        }
        
        // After first generation, we don't need to send raw data anymore
        setShouldSendRawData(false);
        setIsInitialized(true);
        
        if (onStateChange) {
          onStateChange({ isInitialized: true, isLoading: false });
        }
      } catch (err: any) {
        console.error("Error generating document:", err);
        setError(err.message || "An error occurred");
        toast.error("Error generating document. Please try again later.");
        if (onStateChange) {
          onStateChange({ isInitialized: false, isLoading: false });
        }
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
    shouldSendRawData,
    onStateChange,
    isInitialized
  ]);

  // This effect handles loading drug data for the information assistant
  useEffect(() => {
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
      // 6. This isn't a restored session from another loading method
      if (
        assistantType === "shortage" && 
        !hasAttemptedGeneration && 
        drugShortageData && 
        !isInitialized && 
        !isLoading &&
        !isRestoredSession // Don't initialize if we're in a restored session
      ) {
        console.log("Initializing shortage assistant with comprehensive analysis");
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
              
              // Save this conversation to the database
              saveConversation([responseMessage]);
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
      } else if (assistantType === "shortage" && !isInitialized && !isLoading && !isRestoredSession) {
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

  useEffect(() => {
    const initialize = async () => {
      // Skip if we've already initialized, are loading, restoring, or missing data
      if (isInitialized || isLoading || isRestoredSession || !drugShortageData || hasAttemptedGeneration) {
        return;
      }
      
      // Skip initialization if we already have messages (e.g., from DB load)
      if (messages.length > 0) {
        setIsInitialized(true);
        setHasAttemptedGeneration(true);
        return;
      }
      
      // Skip this initialization for the shortage assistant, it's handled separately
      if (assistantType === "shortage") {
        return;
      }
            
      if (autoInitialize && sessionId && !threadId) {
          console.log("Running generic auto-initialize effect");
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
                rawData: shouldSendRawData
              },
            });
            
            if (error) {
              console.error("Error initializing assistant (generic effect):", error);
              setError(error.message);
              setIsInitialized(true);
              setHasAttemptedGeneration(true);
              return;
            }
            
            if (data && data.error) {
              console.error("Error from OpenAI assistant (generic effect):", data.error);
              setError(data.error);
              setIsInitialized(true);
              setHasAttemptedGeneration(true);
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
              console.error("Error in initializing assistant (generic effect):", err);
              setError(err.message || "An error occurred");
              setIsInitialized(true);
              setHasAttemptedGeneration(true);
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
