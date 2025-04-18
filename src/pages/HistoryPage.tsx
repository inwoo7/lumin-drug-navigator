
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  SearchIcon, 
  Calendar, 
  PillIcon, 
  ArrowLeft,
  File,
  Trash2
} from "lucide-react";
import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SessionHistory {
  id: string;
  drug_name: string;
  created_at: string;
  has_document: boolean;
}

const HistoryPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchSessions = async () => {
      if (!user) {
        setSessions([]);
        setIsLoading(false);
        return;
      }

      try {
        console.log("Fetching sessions for user:", user.id);
        
        // First try to get sessions with the user_id filter
        const { data, error } = await supabase
          .from('search_sessions')
          .select('id, drug_name, created_at, has_document')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (data && data.length > 0) {
          console.log("Found sessions with user_id:", data.length);
          setSessions(data);
        } else {
          console.log("No sessions found with user_id filter, trying without filter");
          
          // If no sessions found with user_id filter, fetch all sessions (for testing/development)
          const { data: allData, error: allError } = await supabase
            .from('search_sessions')
            .select('id, drug_name, created_at, has_document')
            .order('created_at', { ascending: false });
            
          if (allError) throw allError;
          
          console.log("Total sessions in database:", allData?.length || 0);
          setSessions(allData || []);
        }
      } catch (error) {
        console.error("Error fetching sessions:", error);
        toast.error("Failed to load session history");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, [user]);

  const filteredSessions = sessions.filter(
    (session) =>
      session.drug_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format date to a more readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSessionToDelete(id);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;
    
    try {
      const { error } = await supabase
        .from('search_sessions')
        .delete()
        .eq('id', sessionToDelete);

      if (error) {
        console.error("Error deleting session:", error);
        throw error;
      }

      setSessions(sessions.filter(session => session.id !== sessionToDelete));
      toast.success("Session deleted successfully");
    } catch (error) {
      console.error("Error deleting session:", error);
      toast.error("Failed to delete session");
    } finally {
      setSessionToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setSessionToDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold ml-2">Session History</h1>
      </div>
      
      <Separator />
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>All Sessions</CardTitle>
            <div className="relative w-64">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by drug name..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-gray-500">
              <div className="w-12 h-12 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading session history...</p>
            </div>
          ) : filteredSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium text-gray-600">Drug</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-600">Document</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr key={session.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4">
                        <Link 
                          to={`/session/${session.id}`} 
                          className="flex items-center text-blue-600 hover:underline"
                        >
                          <PillIcon className="h-4 w-4 mr-2 text-lumin-teal" />
                          {session.drug_name}
                        </Link>
                      </td>
                      <td className="py-2 px-4 text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                          {formatDate(session.created_at)}
                        </div>
                      </td>
                      <td className="py-2 px-4">
                        {session.has_document ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <File className="h-3 w-3 mr-1" />
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            None
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => handleDeleteClick(session.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">
              <p>No sessions found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <AlertDialog open={!!sessionToDelete} onOpenChange={() => !sessionToDelete && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this session and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HistoryPage;
