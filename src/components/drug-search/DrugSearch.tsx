
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SearchIcon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDrugShortageSearch } from "@/hooks/use-drug-shortages";
import { toast } from "sonner";

// Mock drug list for initial suggestions
const mockDrugs = [
  "Atorvastatin",
  "Lisinopril",
  "Levothyroxine",
  "Metformin",
  "Metoprolol",
  "Amlodipine",
  "Albuterol",
  "Omeprazole",
  "Losartan",
  "Gabapentin",
  "Amoxicillin",
  "Hydrochlorothiazide",
  "Sertraline",
  "Simvastatin",
  "Montelukast",
  "Pantoprazole",
  "Furosemide",
  "Escitalopram",
  "Fluticasone",
  "Carvedilol"
];

const DrugSearch = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Only search if we have at least 3 characters to avoid unnecessary API calls
  const searchTerm = searchQuery.length > 2 ? searchQuery : "";
  
  // Use our hook to prefetch drug shortage data when the user types
  const { shortages, isLoading: isShortageLoading } = useDrugShortageSearch(searchTerm);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Don't try to update suggestions if there's no query
    if (searchQuery.trim() === "") {
      setSuggestions([]);
      return;
    }

    // Filter the mock drugs list for suggestions
    const filteredDrugs = mockDrugs.filter(drug =>
      drug.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // Only update suggestions from shortages when we have results
    // This prevents unnecessary state updates during rendering
    if (shortages && shortages.length > 0) {
      const shortageNames = shortages.map(s => s.brand_name);
      
      // Combine and deduplicate
      const combinedSuggestions = [...new Set([...filteredDrugs, ...shortageNames])];
      setSuggestions(combinedSuggestions);
    } else {
      setSuggestions(filteredDrugs);
    }
  }, [searchQuery, shortages]);

  const handleSearch = async (drug: string) => {
    setIsLoading(true);
    
    try {
      // Create a new session in Supabase
      const { data, error } = await supabase
        .from('search_sessions')
        .insert([
          { drug_name: drug, created_at: new Date().toISOString() }
        ])
        .select();
      
      if (error) throw error;
      
      // Navigate to the session page with the new session ID
      if (data && data[0]) {
        toast.success(`Searching for information on ${drug}`);
        navigate(`/session/${data[0].id}`, { state: { drugName: drug } });
      }
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Error creating session");
      // In case of error, still navigate but with a temporary ID
      navigate(`/session/new`, { state: { drugName: drug } });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto" ref={searchRef}>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="Search for a drug..."
              className="pl-10"
              disabled={isLoading}
            />
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>
          <Button 
            onClick={() => searchQuery && handleSearch(searchQuery)}
            disabled={!searchQuery || isLoading}
            className="bg-lumin-teal hover:bg-lumin-teal/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching
              </>
            ) : (
              "Search"
            )}
          </Button>
        </div>

        {isFocused && suggestions.length > 0 && (
          <Card className="absolute mt-1 w-full z-10">
            <CardContent className="p-0">
              <ul className="max-h-60 overflow-auto">
                {suggestions.map((drug, index) => (
                  <li 
                    key={index}
                    className="p-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setSearchQuery(drug);
                      setIsFocused(false);
                      handleSearch(drug);
                    }}
                  >
                    {drug}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DrugSearch;
