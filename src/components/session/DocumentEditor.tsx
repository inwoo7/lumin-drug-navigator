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
  initialContent = ""
}: DocumentEditorProps) => {
  const [content, setContent] = useState(initialContent);
  const [previewContent, setPreviewContent] = useState("");
  const [activeTab, setActiveTab] = useState("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const isProgrammaticChange = useRef(false);

  useEffect(() => {
    if (initialContent !== content) {
      console.log("DocumentEditor: initialContent prop changed, updating internal state.");
      isProgrammaticChange.current = true;
      setContent(initialContent);
    }
  }, [initialContent]);

  useEffect(() => {
    const htmlContent = content
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mb-4 mt-6">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mb-3 mt-5">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mb-2 mt-4">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^\s*-\s+(.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/\n/g, '<br>');
      
    setPreviewContent(htmlContent);
    
    isProgrammaticChange.current = false;
  }, [content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    if (!isProgrammaticChange.current) {
       console.log("DocumentEditor: User input detected, calling onContentChange.");
       onContentChange(newContent);
    }
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

  const handleExportPDF = async () => {
    if (activeTab !== "preview") {
      setActiveTab("preview");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (!previewRef.current) {
      toast.error("Cannot generate PDF at this time");
      return;
    }
    
    setIsPdfExporting(true);
    toast.loading("Generating PDF...", { id: "pdf-export" });
    
    try {
      const pdfContainer = document.createElement('div');
      pdfContainer.className = 'markdown-preview-pdf';
      pdfContainer.innerHTML = previewRef.current.innerHTML;
      pdfContainer.style.width = '595px';
      pdfContainer.style.fontFamily = 'Arial, sans-serif';
      pdfContainer.style.fontSize = '10pt';
      document.body.appendChild(pdfContainer);
      
      const pdf = new jsPDF({
        format: 'a4',
        unit: 'pt',
        orientation: 'portrait'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 72;
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = pdfHeight - margin * 2;
      
      const canvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 595,
        windowWidth: 595,
        scrollY: -window.scrollY
      });
      
      document.body.removeChild(pdfContainer);
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = contentWidth;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      let remainingImageHeight = imgHeight;
      let pageNum = 1;

      while (remainingImageHeight > 0) {
        if (pageNum > 1) {
          pdf.addPage();
        }
        const imageOffsetY = margin - (imgHeight - remainingImageHeight);
        
        pdf.addImage(imgData, 'PNG', margin, imageOffsetY, imgWidth, imgHeight);

        remainingImageHeight -= contentHeight;
        pageNum++;
      }
      
      const totalPages = pageNum - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text('Lumin Placeholder Logo', margin, margin - 20);
        const docTitle = `${drugName} Shortage Plan`;
        const titleWidth = pdf.getStringUnitWidth(docTitle) * pdf.getFontSize() / pdf.internal.scaleFactor;
        pdf.text(docTitle, pdfWidth - margin - titleWidth, margin - 20);
        pdf.setDrawColor(200);
        pdf.line(margin, margin - 10, pdfWidth - margin, margin - 10);

        pdf.text('Generated by: Placeholder User', margin, pdfHeight - margin + 30);
        const pageStr = `Page ${i} of ${totalPages}`;
        const pageStrWidth = pdf.getStringUnitWidth(pageStr) * pdf.getFontSize() / pdf.internal.scaleFactor;
        pdf.text(pageStr, pdfWidth - margin - pageStrWidth, pdfHeight - margin + 30);
        pdf.line(margin, pdfHeight - margin + 20, pdfWidth - margin, pdfHeight - margin + 20);
      }
      
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
