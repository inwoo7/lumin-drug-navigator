import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, AlertTriangle, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DocumentEditorProps {
  drugName: string;
  sessionId?: string;
  onContentChange: (content: string) => void;
  initialContent?: string;
}

// Define the type for our custom RPC function response
type SessionDocumentResponse = {
  id: string;
  content: string;
}

const DocumentEditor = ({ 
  drugName, 
  sessionId,
  onContentChange,
  initialContent
}: DocumentEditorProps) => {
  const [content, setContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [activeTab, setActiveTab] = useState("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load document content from database or use initial content
  useEffect(() => {
    const loadDocument = async () => {
      if (!sessionId) {
        // Use template for new sessions
        initializeWithTemplate();
        return;
      }
      
      try {
        // Check if we have a document in the database
        // Use RPC function since types don't include our new tables yet
        const { data, error } = await supabase.rpc(
          'get_session_document', 
          { p_session_id: sessionId }
        );
          
        if (error) {
          if (error.code !== 'PGRST116') { // PGRST116 is the "not found" error
            console.error("Error loading document:", error);
          }
          // Use initial content or template if no document found
          if (initialContent) {
            setContent(initialContent);
          } else {
            initializeWithTemplate();
          }
        } else if (data && Array.isArray(data) && data.length > 0 && data[0].content) {
          setContent(data[0].content);
        } else if (initialContent) {
          setContent(initialContent);
        } else {
          initializeWithTemplate();
        }
        
        setIsLoaded(true);
      } catch (err) {
        console.error("Error loading document:", err);
        // Fallback to template
        initializeWithTemplate();
      }
    };
    
    loadDocument();
  }, [sessionId, initialContent]);

  const initializeWithTemplate = () => {
    // Initialize with a template
    const template = `# ${drugName} Shortage Management Plan

## Overview
[Enter information about the current shortage situation]

## Therapeutic Alternatives
[List alternative medications and dosing information]

## Conservation Strategies
[Document strategies to conserve available supply]

## Patient Prioritization
[Define criteria for patient prioritization]

## Implementation Plan
[Outline steps for implementing this plan]

## Communication Strategy
[Define how to communicate with staff and patients]

## Resources and Contacts
[List important resources and contact information]
`;
    setContent(template);
    setIsLoaded(true);
  };

  useEffect(() => {
    if (!isLoaded) return;
    
    // Simple markdown-to-html conversion for preview
    // In a real app, you would use a proper markdown library
    const htmlContent = content
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mb-4 mt-6">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mb-3 mt-5">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mb-2 mt-4">$1</h3>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\[(.+?)\]/g, '<span class="text-gray-500 italic">$1</span>');
    setPreviewContent(htmlContent);
    onContentChange(content);
  }, [content, onContentChange, isLoaded]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleSaveDocument = async () => {
    if (!sessionId) {
      toast.error("Cannot save document without a session ID");
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Use a custom RPC function to handle saving document
      const { error } = await supabase.rpc(
        'save_session_document', 
        { 
          p_session_id: sessionId,
          p_content: content
        }
      );
        
      if (error) throw error;
      
      toast.success("Document saved successfully", {
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      console.error("Error saving document:", err);
      toast.error("Failed to save document");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPDF = () => {
    // In a real application, you would generate a PDF here
    // For now, we'll just show a toast
    toast.success("Document exported as PDF", {
      description: "Your document has been exported successfully.",
      icon: <Check className="h-4 w-4" />,
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="px-4 py-3 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-md">Document Editor</CardTitle>
        <div className="flex gap-2">
          {sessionId && (
            <Button
              size="sm"
              onClick={handleSaveDocument}
              disabled={isSaving}
              variant="outline"
            >
              {isSaving ? (
                <>Saving</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleExportPDF}
            className="bg-lumin-teal hover:bg-lumin-teal/90"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="px-4 pt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">
                <FileText className="h-4 w-4 mr-2" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="preview">
                <FileText className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="edit" className="flex-1 p-4 mt-0">
            <div className="bg-amber-50 p-3 rounded-md border border-amber-200 mb-3">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-700">
                    Use the AI Assistant to help with content. Press the Save button to store your changes.
                  </p>
                </div>
              </div>
            </div>
            <textarea
              value={content}
              onChange={handleContentChange}
              className="w-full h-full min-h-[400px] p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-lumin-teal focus:border-transparent"
              placeholder="Start typing your document here..."
            />
          </TabsContent>
          
          <TabsContent value="preview" className="flex-1 p-4 mt-0 overflow-auto">
            <div className="bg-white p-6 border rounded-md min-h-[400px] markdown-preview" dangerouslySetInnerHTML={{ __html: previewContent }} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DocumentEditor;
