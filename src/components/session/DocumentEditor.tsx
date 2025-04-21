import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, AlertTriangle, Check, Save, Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SessionDocument } from "@/types/supabase-rpc";
import html2pdf from 'html2pdf.js';

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
  const [content, setContent] = useState<string>(initialContent || "");
  const [previewContent, setPreviewContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const loadDocument = async () => {
      if (!sessionId) {
        initTemplate();
        return;
      }

      try {
        const { data, error } = await supabase
          .from("documents")
          .select("content")
          .eq("session_id", sessionId)
          .single();

        if (error) {
          console.error("Error loading document:", error);
          initTemplate();
          return;
        }

        if (data && data.content) {
          setContent(data.content);
        } else {
          initTemplate();
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error("Error loading document:", err);
        initTemplate();
      }
    };

    loadDocument();
  }, [sessionId]);

  const initTemplate = () => {
    const template = `# Clinical Guidance for ${drugName || "Drug"} Shortage
## Background
[Include background information about the drug shortage]

## Alternative Agents
[List alternative medications that can be used]

## Recommendations
[Provide specific recommendations for clinicians]

## References
[Include references to supporting literature]
  `;
    setContent(template);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isLoading) return;
    
    const htmlContent = content
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
      .replace(/\n/gim, '<br>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');
    
    setPreviewContent(htmlContent);
    onContentChange(content);
  }, [content, onContentChange, isLoading]);

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

  const handleExportPDF = () => {
    try {
      setIsExporting(true);
      toast.loading("Generating PDF...", { id: "pdf-export" });
      
      // Create a dedicated element for PDF export to ensure proper formatting
      const exportElement = document.createElement('div');
      exportElement.className = 'pdf-export';
      
      // Apply professional styling to the PDF document
      exportElement.innerHTML = `
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          .pdf-container {
            font-family: 'Arial', sans-serif;
            color: #333;
            line-height: 1.5;
            padding: 20mm;
            box-sizing: border-box;
            width: 210mm; /* A4 width */
            min-height: 297mm; /* A4 height */
          }
          h1 {
            color: #005a87;
            font-size: 22px;
            margin-bottom: 15px;
            padding-bottom: 7px;
            border-bottom: 1px solid #ccc;
          }
          h2 {
            color: #007bff;
            font-size: 18px;
            margin-top: 20px;
            margin-bottom: 10px;
          }
          h3 {
            color: #0069d9;
            font-size: 16px;
            margin-top: 15px;
            margin-bottom: 8px;
          }
          p {
            margin-bottom: 10px;
          }
          .page-header {
            text-align: center;
            margin-bottom: 20px;
          }
          .document-title {
            font-size: 24px;
            font-weight: bold;
            color: #005a87;
            margin-bottom: 5px;
          }
          .document-subtitle {
            font-size: 16px;
            color: #666;
            margin-bottom: 20px;
          }
          .date {
            text-align: right;
            font-style: italic;
            font-size: 14px;
            color: #666;
            margin-bottom: 20px;
          }
          .placeholder {
            color: #999;
            font-style: italic;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #666;
            margin-top: 30px;
            border-top: 1px solid #eee;
            padding-top: 10px;
          }
        </style>
        <div class="pdf-container">
          <div class="page-header">
            <div class="document-title">${drugName} Shortage Management Plan</div>
            <div class="document-subtitle">Clinical Guidance Document</div>
          </div>
          <div class="date">Generated: ${new Date().toLocaleDateString()}</div>
          ${previewContent
            .replace('<h1 class="text-2xl font-bold mb-4 mt-6">', '<h1>')
            .replace('<h2 class="text-xl font-semibold mb-3 mt-5">', '<h2>')
            .replace('<h3 class="text-lg font-semibold mb-2 mt-4">', '<h3>')
            .replace('<span class="text-gray-500 italic">', '<span class="placeholder">')}
          <div class="footer">
            Generated by Lumin Drug Shortage Navigator | ${new Date().toLocaleDateString()} | Confidential 
          </div>
        </div>
      `;
      
      // Temporarily append to body but hide it
      exportElement.style.position = 'absolute';
      exportElement.style.left = '-9999px';
      document.body.appendChild(exportElement);
      
      // A4 size configuration
      const options = {
        margin: 0, // We're handling margins in the CSS
        filename: `${drugName.replace(/\s+/g, '_')}_Shortage_Management_Plan.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          letterRendering: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], before: '.page-break' }
      };
      
      // Generate PDF with specified options
      html2pdf()
        .from(exportElement)
        .set(options)
        .save()
        .then(() => {
          // Clean up the temporary element
          document.body.removeChild(exportElement);
          toast.success("Document exported as PDF", { 
            id: "pdf-export",
            description: "Your document has been downloaded successfully.", 
            icon: <Check className="h-4 w-4" /> 
          });
        })
        .catch((err) => {
          console.error("Error generating PDF:", err);
          toast.error("Failed to generate PDF", { id: "pdf-export" });
        })
        .finally(() => {
          setIsExporting(false);
        });
    } catch (err) {
      console.error("Error in PDF export:", err);
      toast.error("Failed to generate PDF", { id: "pdf-export" });
      setIsExporting(false);
    }
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden">
      <CardHeader className="p-4 gap-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold">Document Editor</h2>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDocument}
              disabled={isSaving}
              className="flex items-center gap-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-1"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  <span>Export PDF</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "edit" | "preview")}
          className="flex flex-col h-full"
        >
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
