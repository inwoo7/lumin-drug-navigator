import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AIConversation } from "@/types/supabase-rpc";
import { getAssistantConfig } from "@/integrations/txagent/config";

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
  const [threadId, _setThreadId] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);

  // Custom setter for threadId to keep ref in sync
  const setThreadId = (newThreadId: string | null) => {
    _setThreadId(newThreadId);
    threadIdRef.current = newThreadId;
  };

  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState<boolean>(false);
  const [isRestoredSession, setIsRestoredSession] = useState<boolean>(false);
  const [shouldSendRawData, setShouldSendRawData] = useState<boolean>(rawApiData);

  // Get assistant configuration (TxAgent or OpenAI)
  const assistantConfig = getAssistantConfig();

  // Helper function to call assistant API (TxAgent or OpenAI)
  const callAssistantAPI = async (payload: any) => {
    if (assistantConfig.type === 'txagent' && assistantConfig.client) {
      console.log(`[${assistantType}] Using TxAgent assistant`);
      return await assistantConfig.client.callAssistant(payload);
    } else {
      console.log(`[${assistantType}] Using OpenAI assistant (fallback)`);
      return await supabase.functions.invoke("openai-assistant", {
        body: payload
      });
    }
  };

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

        console.log(`Calling ${assistantConfig.type} assistant function to generate document`);
        const { data, error } = await callAssistantAPI({
          assistantType,
          messages: [{ role: "user", content: generationPrompt }],
          drugData: drugShortageData,
          allShortageData,
          documentContent,
          sessionId,
          threadId: threadIdRef.current,
          generateDocument: true
        });
        
        if (error) {
          console.error("Error generating document:", error);
          setError(error);
          
          // Replace the placeholder with an error message
          setMessages([{
            id: Date.now().toString(),
            role: "assistant",
            content: `I encountered an error while generating the document: ${error}. Please try again or contact support if the issue persists.`,
            timestamp: new Date(),
          }]);
          
          if (onStateChange) {
            onStateChange({ isInitialized: false, isLoading: false });
          }
          return;
        }
        
        if (data?.threadId) {
          setThreadId(data.threadId);
        }
        
        // Extract the document content from messages
        const generatedMessages = data?.messages || [];
        console.log(`Generated ${generatedMessages.length} messages`);
        
        if (generatedMessages.length > 0) {
          // Convert timestamps and find the assistant's response
          const formattedMessages = generatedMessages.map((msg: any) => ({
            id: msg.id || Date.now().toString(),
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          
          setMessages(formattedMessages);
          
          // Find the assistant's message and call the document update callback
          const assistantMessage = formattedMessages.find(msg => msg.role === "assistant");
          if (assistantMessage && onDocumentUpdate) {
            onDocumentUpdate(assistantMessage.content);
          }
          
          setIsInitialized(true);
          if (onStateChange) {
            onStateChange({ isInitialized: true, isLoading: false });
          }
          
          console.log(`[document] Document generated successfully with ${formattedMessages.length} messages`);
        } else {
          console.error("No messages returned from assistant");
          setError("No response received from assistant");
          
          setMessages([{
            id: Date.now().toString(),
            role: "assistant",
            content: "I was unable to generate a document at this time. Please try again.",
            timestamp: new Date(),
          }]);
          
          if (onStateChange) {
            onStateChange({ isInitialized: false, isLoading: false });
          }
        }
        
      } catch (err: any) {
        console.error("Unexpected error during document generation:", err);
        setError(err.message || "An unexpected error occurred");
        
        setMessages([{
          id: Date.now().toString(),
          role: "assistant",
          content: `An unexpected error occurred: ${err.message || "Unknown error"}. Please try again.`,
          timestamp: new Date(),
        }]);
        
        if (onStateChange) {
          onStateChange({ isInitialized: false, isLoading: false });
        }
      } finally {
        setIsLoading(false);
      }
    };

    generateDocumentFromData();
  }, [drugShortageData, assistantType, generateDocument, hasAttemptedGeneration, sessionId, isLoading, documentContent, isRestoredSession, isInitialized, onDocumentUpdate, onStateChange, allShortageData]);

  // Auto-initialize effect for shortage assistant
  useEffect(() => {
    const initializeInfoAssistant = async () => {
      if (assistantType !== "shortage" || !autoInitialize || !drugShortageData || isInitialized || isLoading || isRestoredSession) {
        return;
      }
      
      console.log("[shortage] Auto-initializing assistant with drug shortage data");
      setIsLoading(true);
      setIsInitialized(true);
      
      if (onStateChange) {
        onStateChange({ isInitialized: false, isLoading: true });
      }
      
      try {
        console.log(`Calling ${assistantConfig.type} assistant function for shortage analysis`);
        const functionPayload = {
          assistantType,
          drugData: shouldSendRawData ? drugShortageData : drugShortageData,
          allShortageData: shouldSendRawData ? allShortageData : allShortageData,
          sessionId,
          threadId: threadIdRef.current,
          rawApiData: shouldSendRawData
        };
        
        const { data, error } = await callAssistantAPI(functionPayload);
        
        if (error) {
          console.error(`Error calling ${assistantConfig.type} assistant:`, error);
          setError(error);
          toast.error("Failed to initialize assistant");
          
          if (onStateChange) {
            onStateChange({ isInitialized: false, isLoading: false });
          }
          return;
        }
        
        console.log("Assistant response received:", data);
        
        if (data?.threadId) {
          setThreadId(data.threadId);
        }
        
        // Process the response messages
        const responseMessages = data?.messages || [];
        if (responseMessages.length > 0) {
          const formattedMessages = responseMessages.map((msg: any) => ({
            id: msg.id || Date.now().toString(),
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          
          setMessages(formattedMessages);
          console.log(`[shortage] Received ${formattedMessages.length} messages from assistant`);
        }
        
        if (onStateChange) {
          onStateChange({ isInitialized: true, isLoading: false });
        }
        
      } catch (err: any) {
        console.error("Unexpected error during assistant initialization:", err);
        setError(err.message || "Failed to initialize assistant");
        toast.error("Failed to initialize assistant");
        
        if (onStateChange) {
          onStateChange({ isInitialized: false, isLoading: false });
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeInfoAssistant();
  }, [assistantType, autoInitialize, drugShortageData, isInitialized, isLoading, isRestoredSession, sessionId, threadIdRef.current, shouldSendRawData, allShortageData, onStateChange]);

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
    if (!content.trim() || !isInitialized) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
        content,
        timestamp: new Date(),
      };
      
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);
    if (onStateChange) {
      onStateChange({ isInitialized: true, isLoading: true });
    }

    // Prepare message history (limit to keep payload reasonable)
    const history = [...messages, userMessage]
      .slice(-10) // Limit history to keep payload reasonable
      .map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));

    let functionPayload: any = {
      assistantType,
      messages: history,
      sessionId,
      threadId: threadIdRef.current,
      drugData: drugShortageData,
      allShortageData: allShortageData,
    };

    let isPotentialEditRequest = false; // Flag to track if user INTENDS to edit

    // Specific handling for Document Assistant updates
    if (assistantType === 'document' && isInitialized && documentContent !== undefined) {
      // Check for keywords indicating an edit request
      const editKeywords = ['edit', 'change', 'update', 'modify', 'add', 'remove', 'insert', 'delete', 'revise', 'rewrite'];
      const lowerCaseContent = content.toLowerCase();
      isPotentialEditRequest = editKeywords.some(keyword => lowerCaseContent.includes(keyword));

      if (isPotentialEditRequest) {
        console.log("[document] Potential edit request detected based on keywords.");
        functionPayload = {
          ...functionPayload,
          generateDocument: false, // We're updating, not generating new
          documentContent: documentContent, // Current state
        };
      } else {
         console.log("[document] Sending standard query/question to document assistant.");
         functionPayload = {
           ...functionPayload,
           documentContent: documentContent, // Pass current content for context
         };
      }
    } else {
      console.log(`[${assistantType}] Preparing standard chat request.`);
    }

    try {
      console.log(`[${assistantType}] Calling ${assistantConfig.type} assistant... Payload keys:`, Object.keys(functionPayload));
      const { data, error } = await callAssistantAPI(functionPayload);

      setIsLoading(false);
      if (onStateChange) {
        onStateChange({ isInitialized: true, isLoading: false });
      }

      if (error) {
        console.error(`[${assistantType}] Assistant function error:`, error);
        setError(`Error: ${error}`);
        toast.error(`Assistant error: ${error}`);
        return; // Stop processing on error
      }

      if (data?.error) {
        console.error(`[${assistantType}] Error from assistant function:`, data.error);
        setError(`Assistant error: ${data.error}`);
        toast.error(`Assistant error: ${data.error}`);
        return; // Stop processing on error
      }

      // Handle thread ID persistence
      if (data?.threadId) {
        if (!threadIdRef.current) {
          console.log(`[${assistantType}] Received initial thread ID: ${data.threadId}`);
          setThreadId(data.threadId);
        } else if (data.threadId !== threadIdRef.current) {
          console.warn(`[${assistantType}] Backend returned a different thread ID (${data.threadId}) than expected (${threadIdRef.current}). Updating local thread ID.`);
          setThreadId(data.threadId);
        }
      }
      const currentThreadIdForSaving = data?.threadId || threadIdRef.current;

      // Process response messages
      const responseMessages = data?.messages || [];
      if (responseMessages.length > 0) {
        console.log(`[${assistantType}] Received response with ${responseMessages.length} messages.`);
        
        // Convert response messages to our format
        const formattedMessages = responseMessages.map((msg: any) => ({
          id: msg.id || Date.now().toString(),
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
        }));
        
        // Update messages with the complete conversation
        setMessages(formattedMessages);
        
        // Handle document updates for document assistant
        if (assistantType === 'document' && isPotentialEditRequest) {
          // Find the assistant's response that might contain updated document
          const assistantResponse = formattedMessages.find(msg => msg.role === "assistant" && msg.content.length > 100);
          
          if (assistantResponse && isDocumentContent(assistantResponse.content)) {
            console.log("[document] Document update detected in response.");
            if (onDocumentUpdate) {
              onDocumentUpdate(assistantResponse.content);
            }
          }
        }
        
        // Save conversation state
        saveConversation(formattedMessages, currentThreadIdForSaving); 

      } else {
        console.warn(`[${assistantType}] No message content received from assistant.`);
        // Save conversation state even if no message content received
        saveConversation([...messages, userMessage], currentThreadIdForSaving);
      }
    } catch (err: any) {
      console.error(`[${assistantType}] Error sending message:`, err);
      setError(err.message || "An unexpected error occurred.");
      toast.error(`Error: ${err.message || "An unexpected error occurred."}`);
      setIsLoading(false);
      if (onStateChange) {
        onStateChange({ isInitialized: true, isLoading: false });
      }
      // Save state even on error
      saveConversation([...messages, userMessage], threadIdRef.current);
    }
  };

  // Utility function to check if text looks like a markdown document
  // Very basic check - might need refinement
  const isDocumentContent = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    // Look for multiple markdown headers or typical document length
    const headerCount = (text.match(/^#{1,3}\s/gm) || []).length;
    return headerCount > 2 || text.length > 500; // Arbitrary thresholds
  };

  // Helper function to save conversation to database
  const saveConversation = async (messagesToSaveExplicit?: Message[], currentThreadId?: string | null) => {
    const currentSessionId = sessionId;
    const threadToSave = currentThreadId !== undefined ? currentThreadId : threadIdRef.current;

    if (!currentSessionId || !threadToSave) {
      console.warn("Cannot save conversation: Missing sessionId or threadId.", { currentSessionId, threadToSave });
      return;
    }

    const messagesToSave = messagesToSaveExplicit || messages;
    if (messagesToSave.length === 0) {
      console.log("No messages to save.");
      return;
    }

    console.log(`Saving conversation for session: ${currentSessionId}, thread: ${threadToSave}, assistant: ${assistantType}`);

    try {
      const payload = {
        p_session_id: currentSessionId,
        p_assistant_type: assistantType,
        p_thread_id: threadToSave,
        p_messages: JSON.stringify(messagesToSave.map(m => ({ // Ensure consistent format
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp.toISOString() // Store as ISO string
        }))),
      };
      console.log("Payload for save_ai_conversation:", payload);

      const { error: rpcError } = await supabase.rpc('save_ai_conversation', payload);

      if (rpcError) {
        console.error("Error saving conversation via RPC:", rpcError);
        toast.error("Error saving conversation progress.");
      } else {
        console.log("Conversation saved successfully.");
      }
    } catch (err) {
      console.error("Exception saving conversation:", err);
      toast.error("Failed to save conversation progress.");
    }
  };

  // Function to load messages explicitly if needed (e.g., refresh button)
  const loadMessages = async () => {
      if (!sessionId) return;
      setIsLoading(true);
    try {
        console.log(`[${assistantType}] Manually reloading conversation for session ${sessionId}`);
        const { data: conversations, error } = await supabase
        .rpc('get_ai_conversation', { 
          p_session_id: sessionId, 
          p_assistant_type: assistantType 
        });
        
        if (error) throw error;
        
        if (conversations && conversations.length > 0) {
          const conversationData = conversations[0];
          setThreadId(conversationData.thread_id);
          
          let messagesArray = [];
          if (conversationData.messages) {
            if (typeof conversationData.messages === 'string') {
              try { messagesArray = JSON.parse(conversationData.messages); } catch (e) { /* handle error */ }
            } else if (typeof conversationData.messages === 'object') {
              messagesArray = Array.isArray(conversationData.messages) ? conversationData.messages : [];
            }
          }
          
          if (messagesArray.length > 0) {
            const storedMessages = messagesArray.map((msg: any) => ({
                id: msg.id || Date.now().toString(),
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
              }));
            setMessages(storedMessages);
              setIsInitialized(true);
            setIsRestoredSession(true); // Mark as restored
            console.log(`[${assistantType}] Successfully reloaded ${storedMessages.length} messages.`);
          } else {
              setMessages([]); // Clear messages if none found
              setIsInitialized(false); // Reset initialization if no messages
              setIsRestoredSession(false);
              console.log(`[${assistantType}] Reloaded session, but no messages found.`);
          }
        } else {
          setMessages([]); // Clear if no conversation found
          setIsInitialized(false);
          setIsRestoredSession(false);
           console.log(`[${assistantType}] No conversation found during reload.`);
    }
      } catch (err) {
        console.error(`[${assistantType}] Error reloading conversation:`, err);
        toast.error("Failed to reload conversation.");
      } finally {
        setIsLoading(false);
      }
  };

  return { messages, isLoading, error, sendMessage, addMessage, threadId: threadIdRef.current, isInitialized };
};
