
import { useState } from "react";
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
};

export const useOpenAIAssistant = ({
  assistantType,
  sessionId,
  drugShortageData,
}: UseOpenAIAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      const messagesForAPI = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      
      // Add the new user message
      messagesForAPI.push({ role: "user", content });
      
      // Call the Supabase Edge Function
      const { data, error } = await supabase.functions.invoke("openai-assistant", {
        body: {
          assistantType,
          messages: messagesForAPI,
          drugData: drugShortageData,
          sessionId,
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
      
      // Add the assistant's response to the chat
      addMessage("assistant", data.message);
      
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
  };
};
