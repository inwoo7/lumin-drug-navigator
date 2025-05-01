import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, AlertTriangle, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SessionDocument } from "@/types/supabase-rpc";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface DocumentEditorProps {
  drugName: string;
  sessionId?: string;
  onContentChange: (content: string) => void;
  initialContent?: string;
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
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDocument = async () => {
      if (isLoaded) return;

      if (!sessionId) {
        if (initialContent !== undefined) {
            setContent(initialContent);
        } else {
            initializeWithTemplate();
        }
        setIsLoaded(true);
        return;
      }
      
      try {
        console.log(`DocumentEditor: Attempting load for session ${sessionId}`);
        const { data: docs, error } = await supabase
          .rpc('get_session_document', { 
            p_session_id: sessionId 
          }) as { data: SessionDocument[] | null, error: any };
          
        if (error) {
          console.error("DocumentEditor: Error loading document:", error);
          if (initialContent !== undefined) {
            setContent(initialContent);
          } else {
            initializeWithTemplate();
          }
        } else if (docs && docs.length > 0 && docs[0]?.content) {
          console.log("DocumentEditor: Loaded from database");
          setContent(docs[0].content);
        } else if (initialContent !== undefined) {
          console.log("DocumentEditor: Using initialContent prop");
          setContent(initialContent);
        } else {
          console.log("DocumentEditor: Initializing with template");
          initializeWithTemplate();
        }
        
        setIsLoaded(true);
      } catch (err) {
        console.error("DocumentEditor: Exception loading document:", err);
        if (initialContent !== undefined) {
            setContent(initialContent);
        } else {
            initializeWithTemplate();
        }
        setIsLoaded(true);
      }
    };
    
    loadDocument();
  }, [sessionId, initialContent, isLoaded]);

  useEffect(() => {
    if (initialContent !== undefined && initialContent !== content && isLoaded) {
        console.log("DocumentEditor: Syncing internal state with updated initialContent prop.");
        setContent(initialContent);
    }
  }, [initialContent, isLoaded]);

  const initializeWithTemplate = () => {
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

  // Effect to update the preview content whenever the internal content changes
  useEffect(() => {
    if (!isLoaded) return;
    
    // Simple Markdown to HTML conversion for preview
    const htmlContent = content
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mb-4 mt-6">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mb-3 mt-5">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mb-2 mt-4">$1</h3>')
      .replace(/\n\n/g, '<br><br>') // Basic paragraph separation
      .replace(/\n/g, '<br>') // Basic line breaks
      .replace(/\[(.+?)\]/g, '<span class="text-gray-500 italic">$1</span>'); // Placeholders
      
    setPreviewContent(htmlContent);
    
    // DO NOT call onContentChange here. This effect is only for the preview.
    // Parent is notified of user changes via handleContentChange.
  }, [content, isLoaded]); // Removed onContentChange dependency

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    // Notify parent ONLY when user types in the textarea
    onContentChange(newContent);
  };

  const handleSaveDocument = async () => {
    if (!sessionId) {
      toast.error("Cannot save document without a session ID");
      return;
    }
    
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .rpc('save_session_document', { 
          p_session_id: sessionId,
          p_content: content
        });
        
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

  // Function to export the document as PDF in A4 size
  const handleExportPDF = async () => {
    // Switch to preview tab if not already there
    if (activeTab !== "preview") {
      setActiveTab("preview");
      // Wait for the preview to render
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (!previewRef.current) {
      toast.error("Cannot generate PDF at this time");
      return;
    }
    
    setIsPdfExporting(true);
    toast.loading("Generating PDF...", { id: "pdf-export" });
    
    try {
      // Create a temporary container for the PDF content
      const pdfContainer = document.createElement('div');
      pdfContainer.innerHTML = previewRef.current.innerHTML;
      pdfContainer.style.width = '595px'; // A4 width in pixels at 72 DPI
      pdfContainer.style.padding = '40px';
      pdfContainer.style.fontFamily = 'Arial, sans-serif';
      document.body.appendChild(pdfContainer);
      
      // Generate PDF with A4 dimensions
      const pdf = new jsPDF({
        format: 'a4',
        unit: 'pt',
        orientation: 'portrait'
      });
      
      // Get the content scaled to A4 size
      const canvas = await html2canvas(pdfContainer, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: false
      });
      
      // Remove the temporary container
      document.body.removeChild(pdfContainer);
      
      // Add the captured content to the PDF
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 595; // A4 width in points
      const imgHeight = canvas.height * imgWidth / canvas.width;
      
      // Add multiple pages if content is too long
      let heightLeft = imgHeight;
      let position = 0;
      let pageHeight = 842; // A4 height in points
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      // Add new pages if content is too long
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Save the PDF with the drug name
      const filename = `${drugName.replace(/\s+/g, '-')}_Shortage_Management_Plan.pdf`;
      pdf.save(filename);
      
      toast.success("PDF exported successfully", { 
        id: "pdf-export",
        description: `Saved as ${filename}`,
        icon: <Check className="h-4 w-4" />
      });
    } catch (err) {
      console.error("Error generating PDF:", err);
      toast.error("Failed to generate PDF", { id: "pdf-export" });
    } finally {
      setIsPdfExporting(false);
    }
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
            disabled={isPdfExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {isPdfExporting ? "Exporting..." : "Export PDF"}
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
            <div 
              ref={previewRef}
              className="bg-white p-6 border rounded-md min-h-[400px] markdown-preview" 
              dangerouslySetInnerHTML={{ __html: previewContent }} 
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DocumentEditor;
