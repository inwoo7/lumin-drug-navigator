import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, AlertTriangle, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/types/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import { SessionDocument } from "@/types/supabase-rpc";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { MAATRX_LOGO_BASE64 } from '@/config/logoConfig';

interface DocumentEditorProps {
  drugName: string;
  sessionId?: string;
  onContentChange: (content: string) => void;
  initialContent?: string;
}


// Define a type for the profile data structure
interface UserProfileData {
  hospital_name: string | null;
  full_name: string | null;
  title: string | null;
  extension: string | null;
  contact_email: string | null;
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
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // !!! Placeholder for fetching user profile data !!! REMOVED
  // Replace this with your actual logic (e.g., from context or a hook)
  // const userProfile = {
  //   hospital_name: "Placeholder Hospital Name",
  //   contact_name: "Angelo Panganiban",
  //   contact_title: "Drug Information Pharmacist",
  //   contact_extension: "1560",
  //   contact_email: "angelomari.panganiban@sinaihealth.ca"
  // };

  useEffect(() => {
    const fetchProfile = async () => {
      setProfileLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const typedSupabase = supabase as SupabaseClient<Database>;
          const { data, error } = await typedSupabase
            .from('profiles')
            .select('hospital_name, full_name, title, extension, contact_email')
            .eq('id', user.id)
            .single(); // Fetch a single record

          if (error && error.code !== 'PGRST116') { // PGRST116: 'No rows found' - treat as null profile, not an error
            throw error;
          }
          setProfileData(data as UserProfileData | null);
        } else {
          // Handle case where user is not logged in or session is lost
          console.warn("User not found, cannot fetch profile.");
          setProfileData(null);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast.error("Failed to load user profile for PDF export.");
        setProfileData(null); // Ensure profile data is null on error
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
  }, []); // Empty dependency array ensures this runs once on mount


  // Fallback values if profile data is missing or loading
  const hospitalName = profileLoading ? "Loading..." : profileData?.hospital_name || "Hospital Name Not Set";
  const contactName = profileLoading ? "Loading..." : profileData?.full_name || "Contact Name Not Set";
  const contactTitle = profileLoading ? "Loading..." : profileData?.title || "Contact Title Not Set";
  const contactExtension = profileLoading ? "" : profileData?.extension; // Default to empty string if null/undefined
  const contactEmail = profileLoading ? "" : profileData?.contact_email; // Default to empty string if null/undefined
  // !!! End Placeholder Update !!!

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
      pdfContainer.style.position = 'relative'; // Needed for watermark positioning
      pdfContainer.style.width = '595px';
      pdfContainer.style.fontFamily = 'Arial, sans-serif';
      pdfContainer.style.fontSize = '10pt';
      
      const contentWrapper = document.createElement('div');
      contentWrapper.innerHTML = previewRef.current.innerHTML;
      
      const watermark = document.createElement('div');
      watermark.innerText = 'Powered by MaaTRx';
      watermark.style.position = 'absolute';
      watermark.style.top = '25%';
      watermark.style.left = '50%';
      watermark.style.transform = 'translate(-50%, -50%) rotate(-35deg)';
      watermark.style.fontSize = '46pt';
      watermark.style.color = 'rgba(128, 128, 128, 0.15)';
      watermark.style.fontWeight = 'bold';
      watermark.style.pointerEvents = 'none';
      watermark.style.zIndex = '1';
      watermark.style.whiteSpace = 'nowrap';
      
      contentWrapper.style.position = 'relative';
      contentWrapper.style.zIndex = '2';

      pdfContainer.appendChild(contentWrapper);
      pdfContainer.appendChild(watermark);

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
      
      const fullCanvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 595,
        windowWidth: 595,
        scrollY: -window.scrollY
      });
      
      document.body.removeChild(pdfContainer);
      
      const canvasScaleRatio = contentWidth / fullCanvas.width; 
      const sourceContentHeightPerPage = contentHeight / canvasScaleRatio; // Equivalent content height on the source canvas

      let sourceY = 0; // Current Y position on the source canvas we are slicing from
      let pageNum = 1;

      while (sourceY < fullCanvas.height) {
        if (pageNum > 1) {
          pdf.addPage();
        }

        // Calculate the height of the slice on the source canvas for the current page
        const currentSourceHeight = Math.min(sourceContentHeightPerPage, fullCanvas.height - sourceY);

        // Create a temporary canvas for the slice
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = fullCanvas.width;
        sliceCanvas.height = currentSourceHeight;
        const sliceCtx = sliceCanvas.getContext('2d');

        if (sliceCtx) {
             // Draw the calculated slice from the full canvas onto the temporary slice canvas
             sliceCtx.drawImage(
                 fullCanvas,
                 0, sourceY,                   // Source x, y
                 fullCanvas.width, currentSourceHeight, // Source width, height
                 0, 0,                           // Destination x, y on sliceCanvas
                 fullCanvas.width, currentSourceHeight  // Destination width, height on sliceCanvas
             );

             // Convert the slice canvas to image data
             const sliceImgData = sliceCanvas.toDataURL('image/png');

             // Calculate the scaled height for this specific slice in the PDF
             const sliceImgScaledHeight = currentSourceHeight * canvasScaleRatio;

             // Add the slice image to the PDF, positioned at the top-left margin
             pdf.addImage(sliceImgData, 'PNG', margin, margin, contentWidth, sliceImgScaledHeight);

        } else {
             console.error("Failed to get context for slice canvas");
             toast.error("Error processing PDF page, context missing.");
             break; // Exit loop on error
        }

        // Move to the next slice position on the source canvas
        sourceY += currentSourceHeight;
        pageNum++;
      }
      
      const totalPages = pageNum - 1; // Get total pages based on the loop completion
      const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      });
      // Define logo dimensions (adjust as needed)
      const logoHeight = 20; // Example height in points
      const logoWidth = 80; // Example width in points (adjust based on logo aspect ratio)
      
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i); 
        
        // === Header ===
        pdf.setFontSize(9);
        pdf.setTextColor(100); 
        
        // Hospital Name (Left)
        pdf.text(hospitalName, margin, margin - 20); 
        
        // MaaTRx Logo (Right)
        if (MAATRX_LOGO_BASE64 && MAATRX_LOGO_BASE64.startsWith("data:image")) { // Basic check for valid placeholder
            try {
                pdf.addImage(
                    MAATRX_LOGO_BASE64, 
                    'PNG', // Assuming PNG, adjust if needed (JPEG, WEBP)
                    pdfWidth - margin - logoWidth, // x position (top-right corner)
                    margin - 30, // y position (adjust vertical alignment)
                    logoWidth, // width on page
                    logoHeight // height on page
                );
            } catch (imgError) {
                console.error("Error adding logo image:", imgError);
                pdf.text("[Logo Error]", pdfWidth - margin - 50, margin - 20); // Fallback text
            }
        } else {
             pdf.text("[Logo Missing]", pdfWidth - margin - 50, margin - 20); // Fallback text if placeholder is invalid
        }

        // Header Line
        pdf.setDrawColor(200);
        pdf.line(margin, margin - 10, pdfWidth - margin, margin - 10);

        // === Footer ===
        pdf.setFontSize(8); // Slightly smaller font for footer
        pdf.setTextColor(100); 
        
        // Contact Info Block (Left)
        let footerY = pdfHeight - margin + 25; // Starting Y for footer block
        if (contactName && contactTitle) {
             pdf.text(`${contactName}${contactTitle ? `, ${contactTitle}` : ''}`, margin, footerY); // Handle case where title might be null
             footerY += 10; // Move down for next line
        } else if (contactName) { // If only name is available
             pdf.text(contactName, margin, footerY);
             footerY += 10;
        }

        let contactLine = "";
        if (contactExtension) contactLine += `Ext. ${contactExtension}`;
        if (contactEmail) contactLine += `${contactExtension ? ' | ' : ''}${contactEmail}`;
        if (contactLine) {
            pdf.text(contactLine, margin, footerY);
            footerY += 10;
        }
        pdf.text(currentDate, margin, footerY); // Add date below contact info
        
        // Page Number (Right)
        const pageStr = `Page ${i} of ${totalPages}`;
        const pageStrWidth = pdf.getStringUnitWidth(pageStr) * pdf.getFontSize() / pdf.internal.scaleFactor;
        pdf.text(pageStr, pdfWidth - margin - pageStrWidth, pdfHeight - margin + 30); 
        
        // Footer Line - Drawn below all footer text
        pdf.setDrawColor(200);
        pdf.line(margin, pdfHeight - margin + 15, pdfWidth - margin, pdfHeight - margin + 15);
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
