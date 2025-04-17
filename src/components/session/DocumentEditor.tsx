
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

interface DocumentEditorProps {
  drugName: string;
  onContentChange: (content: string) => void;
}

const DocumentEditor = ({ drugName, onContentChange }: DocumentEditorProps) => {
  const [content, setContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [activeTab, setActiveTab] = useState("edit");

  useEffect(() => {
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
  }, [drugName]);

  useEffect(() => {
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
  }, [content, onContentChange]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
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
        <Button
          size="sm"
          onClick={handleExportPDF}
          className="bg-lumin-teal hover:bg-lumin-teal/90"
        >
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
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
                    All changes are automatically saved. Use the AI Assistant for help with content.
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
