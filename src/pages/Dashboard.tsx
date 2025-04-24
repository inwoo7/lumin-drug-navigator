import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, History, PillIcon, SearchIcon } from "lucide-react";
import DrugSearch from "@/components/drug-search/DrugSearch";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnimatedBackground from "@/components/auth/AnimatedBackground";
import { supabase } from "@/integrations/supabase/client";

interface RecentSession {
  id: string;
  drug_name: string;
  created_at: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRecentSessions = async () => {
      try {
        const { data: sessions, error } = await supabase
          .from('search_sessions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        
        setRecentSessions(sessions || []);
      } catch (error) {
        console.error("Error fetching recent sessions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentSessions();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div className="relative bg-white rounded-lg p-6 overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
            <PillIcon className="h-7 w-7 mr-2 text-synapse-mint" />
            Welcome to SynapseRx
          </h1>
          <p className="text-gray-600 max-w-3xl">
            SynapseRx helps hospital pharmacists respond to drug shortages with real-time information, 
            therapeutic alternatives, and documentation tools. Search for a drug below to get started.
          </p>
          
          <div className="mt-8">
            <DrugSearch />
          </div>
        </div>
        
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <AnimatedBackground />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <History className="h-5 w-5 mr-2 text-synapse-mint" />
              Recent Sessions
            </CardTitle>
            <CardDescription>
              Continue working on your recent drug shortage sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-4 text-center text-gray-500">Loading recent sessions...</div>
            ) : recentSessions.length > 0 ? (
              <ul className="space-y-2">
                {recentSessions.map((session) => (
                  <li key={session.id}>
                    <Link to={`/session/${session.id}`}>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <div className="mr-4">
                          <PillIcon className="h-4 w-4 text-synapse-mint" />
                        </div>
                        <div className="flex-1 flex justify-between items-center">
                          <span>{session.drug_name}</span>
                          <span className="text-xs text-gray-500">
                            {formatDate(session.created_at)}
                          </span>
                        </div>
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-4 text-center text-gray-500">
                No recent sessions found
              </div>
            )}
            
            <div className="mt-4">
              <Link to="/history">
                <Button variant="link" className="w-full">
                  View All Sessions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2 text-synapse-mint" />
              Quick Start Guide
            </CardTitle>
            <CardDescription>
              Learn how to make the most of SynapseRx
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="search">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="search">
                  <SearchIcon className="h-4 w-4 mr-2" />
                  Search
                </TabsTrigger>
                <TabsTrigger value="analyze">
                  <PillIcon className="h-4 w-4 mr-2" />
                  Analyze
                </TabsTrigger>
                <TabsTrigger value="document">
                  <FileText className="h-4 w-4 mr-2" />
                  Document
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="search" className="mt-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Finding Drug Information</h4>
                  <p className="text-sm text-gray-600">
                    Use the search bar to find information about drug shortages. Start typing a drug name and select from the suggestions.
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    <li>Drug names will auto-complete as you type</li>
                    <li>Select a drug to view official shortage information</li>
                    <li>The system will connect to Drug Shortages Canada API</li>
                  </ul>
                </div>
              </TabsContent>
              
              <TabsContent value="analyze" className="mt-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Analyzing Shortage Information</h4>
                  <p className="text-sm text-gray-600">
                    When viewing a drug shortage, you'll see official information and can use the AI assistant to understand implications.
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    <li>View detailed shortage information and status</li>
                    <li>Ask the AI about therapeutic alternatives</li>
                    <li>Get conservation strategies and recommendations</li>
                  </ul>
                </div>
              </TabsContent>
              
              <TabsContent value="document" className="mt-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Creating Response Documents</h4>
                  <p className="text-sm text-gray-600">
                    Create and export professional documents about drug shortages for your institution.
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    <li>Use the document editor tab to create shortage plans</li>
                    <li>Get AI assistance with document content</li>
                    <li>Export your document as a PDF when finished</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
