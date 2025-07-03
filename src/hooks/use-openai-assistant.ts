import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AIConversation } from "@/types/supabase-rpc";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: ModelType;
};

export type AssistantType = "shortage" | "document";
export type ModelType = "openai" | "txagent";

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
  modelType?: ModelType; // Which AI model to use (default: "openai")
  onModelSwitch?: (newModel: ModelType) => void; // Callback when model is switched
  sharedThreadId?: string | null; // Optional shared thread ID for multi-assistant conversations
  onThreadIdUpdate?: (threadId: string) => void; // Callback when thread ID is created/updated
  drugName?: string; // Drug name for cases without API data
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
  modelType = "openai",
  onModelSwitch,
  sharedThreadId,
  onThreadIdUpdate,
  drugName,
}: UseOpenAIAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState<boolean>(false);
  const [isRestoredSession, setIsRestoredSession] = useState<boolean>(false);
  const [shouldSendRawData, setShouldSendRawData] = useState<boolean>(rawApiData);
  const [currentModel, setCurrentModel] = useState<ModelType>(modelType);
  const [allConversations, setAllConversations] = useState<Record<ModelType, Message[]>>({
    openai: [],
    txagent: []
  });

  const watermark = "\n\n*Powered by MaaTRx*";

  // Load existing conversation from database
  useEffect(() => {
    const loadConversation = async () => {
      if (!sessionId) return;
      
      try {
        console.log(`[${assistantType}] Attempting to load conversation for session ${sessionId}`);
        
        const { data: conversations, error } = await supabase
          .rpc('get_ai_conversation' as any, { 
            p_session_id: sessionId, 
            p_assistant_type: assistantType,
            p_model_type: currentModel
          } as any);
          
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
      // REMOVE API DEPENDENCY: Allow generation with drug name even without API data
      const hasDrugInfo = drugShortageData || drugName;
      
      if (
        assistantType !== "document" || 
        !generateDocument || 
        !hasDrugInfo || 
        hasAttemptedGeneration || 
        !sessionId ||
        isLoading ||
        (documentContent && documentContent.length > 0)
      ) {
        if (assistantType === "document" && !isInitialized && !isLoading && !isRestoredSession) {
          console.log("Document assistant not generating document but marking as initialized");
          console.log(`Debug - generateDocument: ${generateDocument}, hasDrugInfo: ${!!hasDrugInfo}, hasAttemptedGeneration: ${hasAttemptedGeneration}, sessionId: ${!!sessionId}, documentContent length: ${documentContent?.length || 0}`);
          setIsInitialized(true);
          if (onStateChange) {
            onStateChange({ isInitialized: true, isLoading: false });
          }
        }
        return;
      }
      
      console.log("[document] Starting document generation from drug data (not a restored session).");
      console.log(`Debug - All conditions met for generation. drugShortageData: ${!!drugShortageData}, drugName: ${drugName}`);
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
        const generationPrompt = `Generate a comprehensive drug shortage management plan for ${drugShortageData?.brand_name || drugShortageData?.drug_name || drugName || 'the requested drug'}. 
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
            modelType: currentModel,
            messages: [{
              role: "user",
              content: generationPrompt
            }],
            drugData: drugShortageData,
            allShortageData: allShortageData || [],
            sessionId,
            generateDocument: true,
            drugName // NEW: Pass drug name for cases without API data
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
          onDocumentUpdate(data.message + watermark);
        } else {
          console.warn("Document update callback missing or no message content received");
        }
        
        // For document generation, show a friendly completion message instead of the raw prompt/response
        const completionMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: `✅ I've successfully generated a comprehensive drug shortage management plan for ${drugShortageData?.brand_name || drugShortageData?.drug_name || drugName}. The document has been created with detailed clinical guidance, therapeutic alternatives, and implementation strategies. You can view the full document in the editor on the right, or ask me questions about any specific section.`,
          timestamp: new Date(),
          model: currentModel
        };
        setMessages([completionMessage]);
        
        // Save this conversation to the database
        if (sessionId && data.threadId) {
          try {
            // Save the friendly completion message instead of the raw TxAgent data
            const messagesToSave = [{
              id: completionMessage.id,
              role: completionMessage.role,
              content: completionMessage.content,
              timestamp: completionMessage.timestamp.getTime(),
              model: completionMessage.model
            }];
            
            await supabase.rpc('save_ai_conversation', {
              p_session_id: sessionId,
              p_assistant_type: assistantType,
              p_thread_id: data.threadId,
              p_messages: JSON.stringify(messagesToSave)
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
      
      // For shortage assistant, DO NOT auto-generate anything
      // Just mark as ready for user interaction
      if (assistantType === "shortage" && !isInitialized) {
        console.log("Shortage assistant has no data to generate but marking as initialized");
        setIsInitialized(true);
        if (onStateChange) {
          onStateChange({ isInitialized: true, isLoading: false });
        }
        return;
      }
    };
    
    if (assistantType === "shortage") {
      initializeInfoAssistant();
    }
  }, [
    assistantType,
    sessionId, 
    isRestoredSession, 
    isInitialized,
    hasAttemptedGeneration,
    onStateChange
  ]);

  // Initialize thread ID with shared thread if provided
  useEffect(() => {
    if (sharedThreadId && !threadId) {
      console.log(`[${assistantType}] Using shared thread ID: ${sharedThreadId}`);
      setThreadId(sharedThreadId);
    } else if (sharedThreadId && threadId && sharedThreadId !== threadId) {
      console.warn(`[${assistantType}] Thread ID mismatch! Local: ${threadId}, Shared: ${sharedThreadId}`);
      console.log(`[${assistantType}] Updating to use shared thread: ${sharedThreadId}`);
      setThreadId(sharedThreadId);
    }
  }, [sharedThreadId, threadId, assistantType]);

  // Notify parent when our thread ID changes
  useEffect(() => {
    if (threadId && onThreadIdUpdate) {
      onThreadIdUpdate(threadId);
    }
  }, [threadId, onThreadIdUpdate]);

  // Helper function to get appropriate thread ID for the current model
  const getModelSpecificThreadId = () => {
    if (!threadId) return null;
    
    // ALWAYS return the current thread ID for shared conversation continuity
    // The server will handle thread format conversion as needed
    console.log(`[${assistantType}] Using thread ID: ${threadId} for model: ${currentModel}`);
    return threadId;
  };

  const addMessage = (role: "user" | "assistant", content: string, model?: ModelType) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      model: role === 'user' ? undefined : model,
    };
    
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    return newMessage;
  };

  // Enhanced function to send messages with document context
  const sendMessage = async (content: string, isRetry = false) => {
    if (!content.trim()) return;
    
    setIsLoading(true);
    setError(null);

    // Add user message to the conversation
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
        content,
        timestamp: new Date(),
      };
      
    setMessages((prev) => [...prev, userMessage]);
    
    try {
      const isDocumentEdit = assistantType === "document" && (
        content.toLowerCase().includes("remove") ||
        content.toLowerCase().includes("add") ||
        content.toLowerCase().includes("change") ||
        content.toLowerCase().includes("update") ||
        content.toLowerCase().includes("edit") ||
        content.toLowerCase().includes("modify") ||
        content.toLowerCase().includes("delete") ||
        content.toLowerCase().includes("list") ||
        content.toLowerCase().includes("what are") ||
        content.toLowerCase().includes("can you") ||
        content.toLowerCase().includes("for each")
      );
      
      if (isDocumentEdit) {
        console.log(`[${assistantType}] Potential edit request detected based on keywords.`);
      }
      
      // Use model-specific thread ID
      const modelThreadId = getModelSpecificThreadId();
      
      console.log(`[${assistantType}] Preparing standard chat request.`);
      console.log(`[${assistantType}] Calling Supabase function 'openai-assistant'... Payload keys:`, Object.keys({
        assistantType,
        modelType: currentModel,
        messages: [{ role: "user", content }],
        drugData: drugShortageData,
        allShortageData: allShortageData || [],
        documentContent: assistantType === "document" ? documentContent : undefined,
        sessionId,
        threadId: modelThreadId,
        isDocumentEdit: isDocumentEdit && assistantType === "document",
        drugName // NEW: Pass drug name for cases without API data
      }));
      
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          modelType: currentModel,
          messages: [{ role: "user", content }],
          drugData: drugShortageData,
          allShortageData: allShortageData || [],
          documentContent: assistantType === "document" ? documentContent : undefined,
          sessionId,
          threadId: modelThreadId, // Use model-specific thread ID
          isDocumentEdit: isDocumentEdit && assistantType === "document",
          drugName // NEW: Pass drug name for cases without API data
        },
      });

      if (error) {
        console.error(`[${assistantType}] Supabase function error:`, error);
        throw error;
      }

      if (data.error) {
        console.error(`[${assistantType}] Backend error:`, data.error);
        throw new Error(data.error);
      }
      
      console.log(`[${assistantType}] Received response message from ${currentModel} model.`);
      console.log(`[${assistantType}] Server reported model: ${data.modelType || 'unknown'}`);
      
      // Handle the response based on assistant type
      if (assistantType === "document" && isDocumentEdit && onDocumentUpdate) {
        // Document edit response - ALWAYS update document content for document edits
        console.log(`[${assistantType}] Document edit detected - updating content directly`);
        console.log(`[${assistantType}] Response from ${currentModel} (${data.modelType}), content length: ${data.message?.length || 0}`);
        
        // Update the document with the response content
        onDocumentUpdate(data.message + watermark);
        
        // Add a confirmation message to the chat
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: "✅ Document has been updated successfully with your requested changes.",
          timestamp: new Date(),
          model: data.modelType || currentModel,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Regular chat response
        console.log(`[${assistantType}] Chat response from ${currentModel} (${data.modelType}), content length: ${data.message?.length || 0}`);
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
          model: data.modelType || currentModel,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      
      // Update thread ID if we got a new one (especially important for first message)
      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        if (onThreadIdUpdate) {
          onThreadIdUpdate(data.threadId);
        }
      }
      
      // Save the conversation
      await saveConversation();
      
    } catch (err: any) {
      console.error(`[${assistantType}] Error sending message:`, err);
      setError(err.message || "Failed to send message");
      
      // Add error message to chat
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
        model: currentModel,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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

  // Function to switch between models
  const switchModel = async (newModel: ModelType) => {
    if (newModel === currentModel) return;
    
    console.log(`[${assistantType}] Switching from ${currentModel} to ${newModel}`);
    
    // Save current conversation in the background (don't block UI)
    const saveCurrentConversation = async () => {
      if (messages.length > 0 && sessionId && threadId) {
        try {
          console.log(`[${assistantType}] Saving ${messages.length} messages for ${currentModel} before switch`);
          await supabase.rpc('save_ai_conversation' as any, {
            p_session_id: sessionId,
            p_assistant_type: assistantType,
            p_thread_id: threadId,
            p_messages: JSON.stringify(messages),
            p_model_type: currentModel
          } as any);
        } catch (err) {
          console.error("Error saving conversation during model switch:", err);
        }
      }
    };
    
    // Save current conversation and switch model immediately
    await saveCurrentConversation();
    setCurrentModel(newModel);
    
    // Update all conversations state
    setAllConversations(prev => ({
      ...prev,
      [currentModel]: messages
    }));
    
    // Notify parent component of model switch
    if (onModelSwitch) {
      onModelSwitch(newModel);
    }
    
    // IMPORTANT: Keep the same thread ID across model switches
    // This ensures both models participate in the same conversation
    console.log(`[${assistantType}] Model switched to ${newModel}, keeping shared thread ID: ${threadId}`);
    console.log(`[${assistantType}] Thread continuity: Messages from ${currentModel} should be accessible to ${newModel}`);
  };

  return { 
    messages, 
    isLoading, 
    error, 
    sendMessage, 
    addMessage, 
    threadId, 
    isInitialized,
    currentModel,
    switchModel,
    allConversations
  };
};
