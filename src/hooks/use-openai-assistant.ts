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
          
          // DO NOT add the initialPrompt itself to the message history.
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
          
          console.log("[shortage] Calling Supabase function with initial prompt...");
          const { data, error } = await supabase.functions.invoke("openai-assistant", {
            body: {
              assistantType: "shortage",
              // Send the PROMPT to the backend, not the chat history
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
            // Replace placeholder with an error message
            setMessages([{ 
              id: Date.now().toString(), 
              role: 'assistant', 
              content: 'Error initializing assistant. Could not connect to AI service.', 
              timestamp: new Date() 
            }]);
            setIsInitialized(true); // Still mark as initialized so user can interact
            if (onStateChange) {
              onStateChange({ isInitialized: true, isLoading: false });
            }
          } else if (data.error) {
            console.error("Error from assistant function:", data.error);
            toast.error(`Assistant Error: ${data.error}`);
             setMessages([{ 
              id: Date.now().toString(), 
              role: 'assistant', 
              content: `Assistant Error: ${data.error}`, 
              timestamp: new Date() 
            }]);
            setIsInitialized(true);
            if (onStateChange) {
              onStateChange({ isInitialized: true, isLoading: false });
            }
          } else {
            // Set thread ID for future messages
            if (data.threadId) {
              setThreadId(data.threadId);
               console.log(`[shortage] Thread ID set: ${data.threadId}`);
            }
            
            // Add the initial comprehensive analysis to the chat
            if (data.message) {
                console.log("[shortage] Received initial analysis response.");
              const responseMessage: Message = {
                id: Date.now().toString(),
                role: "assistant" as const,
                content: data.message, // This is the actual analysis, not the prompt
                timestamp: new Date(),
              };
              
              // Replace the placeholder with the actual response
              setMessages([responseMessage]);
              
              // Save this conversation to the database with the response message and threadId
              if (data.threadId) {
                 saveConversation([responseMessage], data.threadId);
              } else {
                 console.warn("[shortage] No threadId received after initialization, cannot save initial conversation.");
              }
            } else {
                 console.warn("[shortage] Initialization successful, but no message content received.");
                 // Replace placeholder with a confirmation/info message
                 setMessages([{ 
                   id: Date.now().toString(), 
                   role: 'assistant', 
                   content: 'Assistant initialized. Ask me anything about the shortage.', 
                   timestamp: new Date() 
                 }]);
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

    // Prepare message history (limit?) - consider token limits
    const history = [...messages, userMessage]
      .slice(-10) // Limit history to keep payload reasonable
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    let functionPayload: any = {
      assistantType,
      messages: history,
      sessionId,
      threadId, // Include threadId if available
      drugData: drugShortageData, // Pass context for the AI
      allShortageData: allShortageData, // Pass context for the AI
      rawData: false, // Raw data only needed for initial generation
    };

    let isDocumentUpdateRequest = false; // Flag to track

    // Specific handling for Document Assistant updates
    if (assistantType === 'document' && isInitialized && documentContent !== undefined) {
      console.log("[document] Preparing document update request.");
      isDocumentUpdateRequest = true;
      functionPayload = {
        ...functionPayload,
        updateDocument: true, // Flag for backend
        currentDocumentContent: documentContent, // Current state
        userRequest: content, // The user's specific request
        // Override messages potentially - send only user request for clarity?
        // messages: [{ role: 'user', content: content }] // Let's keep history for now
      };
    } else {
      console.log(`[${assistantType}] Preparing standard chat request.`);
    }

    try {
      console.log(`[${assistantType}] Calling Supabase function 'openai-assistant'... Payload keys:`, Object.keys(functionPayload));
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: functionPayload,
      });

      setIsLoading(false);
      if (onStateChange) {
        onStateChange({ isInitialized: true, isLoading: false });
      }

      if (error) {
        console.error(`[${assistantType}] Supabase function error:`, error);
        setError(`Error: ${error.message}`);
        toast.error(`Assistant error: ${error.message}`);
        // Remove the user message if the call failed?
        // setMessages(prev => prev.slice(0, -1));
        return; // Stop processing on error
      }

      if (data.error) {
        console.error(`[${assistantType}] Error from assistant function:`, data.error);
        setError(`Assistant error: ${data.error}`);
        toast.error(`Assistant error: ${data.error}`);
        return; // Stop processing on error
      }

      // Handle thread ID persistence
      if (data.threadId && !threadId) {
          console.log(`[${assistantType}] Received new thread ID: ${data.threadId}`);
          setThreadId(data.threadId);
          // Immediately save conversation state with the new thread ID
          saveConversation([...messages, userMessage], data.threadId); 
      }

      if (data.message) {
        console.log(`[${assistantType}] Received response message.`);
        const assistantMessage: Message = {
          id: data.id || Date.now().toString(), // Use ID from response if available
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        };

        let finalMessages = [...messages, userMessage]; // Start with history + user message

        // Handle document update response
        if (isDocumentUpdateRequest) {
            let updatedDocContent = null;
            if (data.updatedDocumentContent) {
                updatedDocContent = data.updatedDocumentContent;
            } else if (isDocumentContent(data.message)) {
                // Fallback: check if the main message IS the document
                 console.warn("[document] No 'updatedDocumentContent' field, checking if main message is the document.");
                 updatedDocContent = data.message;
                 // Adjust chat message to be a confirmation
                 assistantMessage.content = "I've updated the document based on your request.";
            }

            if (updatedDocContent !== null) {
                console.log("[document] Calling onDocumentUpdate.");
                if (onDocumentUpdate) {
                    onDocumentUpdate(updatedDocContent);
                } else {
                    console.warn("[document] onDocumentUpdate callback is missing!");
                }
            } else {
                console.warn("[document] Document update requested, but no updated content received or identified.");
                 // Use the assistant message as is (might be explanation/error)
            }
            // Add the (potentially modified) assistant message to chat
             finalMessages.push(assistantMessage);
        } else {
           // Standard chat response
           finalMessages.push(assistantMessage);
        }

        setMessages(finalMessages);
        // Save conversation after state is updated
        saveConversation(finalMessages, threadId || data.threadId); // Pass threadId

      } else {
        console.warn(`[${assistantType}] No message content received from assistant.`);
        // Save conversation state even if no message content received?
        saveConversation([...messages, userMessage], threadId || data.threadId);
      }
    } catch (err: any) {
      console.error(`[${assistantType}] Error sending message:`, err);
      setError(err.message || "An unexpected error occurred.");
      toast.error(`Error: ${err.message || "An unexpected error occurred."}`);
      setIsLoading(false);
      if (onStateChange) {
        onStateChange({ isInitialized: true, isLoading: false });
      }
      // Consider saving state even on catch?
      saveConversation([...messages, userMessage], threadId);
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
    const threadToSave = currentThreadId !== undefined ? currentThreadId : threadId;

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

  return { messages, isLoading, error, sendMessage, addMessage, threadId, isInitialized };
};
