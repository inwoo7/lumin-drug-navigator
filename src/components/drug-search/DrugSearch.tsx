
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

interface Drug {
  id: string;
  name: string;
}

interface SessionOption {
  id: string;
  drugName: string;
  created_at: string;
}

const mockDrugs: Drug[] = [
  { id: "1", name: "Amoxicillin" },
  { id: "2", name: "Azithromycin" },
  { id: "3", name: "Ciprofloxacin" },
  { id: "4", name: "Doxycycline" },
];

const DrugSearch = () => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [drugs, setDrugs] = useState<Drug[]>(mockDrugs);
  const [recentSessions, setRecentSessions] = useState<SessionOption[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // In a real application, you would fetch drugs from an API
    // Here, we use mock data and filter it based on the search term
    const filteredDrugs = mockDrugs.filter((drug) =>
      drug.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setDrugs(filteredDrugs);
  }, [searchTerm]);
  
  useEffect(() => {
    // Load recent sessions from Supabase
    const loadRecentSessions = async () => {
      try {
        const { data, error } = await supabase
          .from('search_sessions')
          .select('id, drug_name, created_at')
          .order('created_at', { ascending: false })
          .limit(5);
          
        if (error) throw error;
        
        if (data) {
          const sessions: SessionOption[] = data.map(session => ({
            id: session.id,
            drugName: session.drug_name,
            created_at: session.created_at
          }));
          
          setRecentSessions(sessions);
        }
      } catch (err) {
        console.error('Error loading recent sessions:', err);
      }
    };
    
    loadRecentSessions();
  }, []);

  const handleSelectDrug = (drug: Drug) => {
    setOpen(false);
    setSearchTerm("");
    navigate(`/session`, { state: { drugName: drug.name } });
  };
  
  const handleSelectSession = (session: SessionOption) => {
    setOpen(false);
    setSearchTerm("");
    navigate(`/session/${session.id}`);
  };

  return (
    <div className="relative w-full">
      <Command className="rounded-lg border shadow-md">
        <CommandInput
          placeholder="Search for a drug..."
          value={searchTerm}
          onValueChange={setSearchTerm}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {open && (
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>No drugs found.</CommandEmpty>
            
            {recentSessions.length > 0 && (
              <CommandGroup heading="Recent Sessions">
                {recentSessions.map((session) => (
                  <CommandItem
                    key={session.id}
                    value={`session-${session.id}`}
                    onSelect={() => handleSelectSession(session)}
                  >
                    <div className="flex flex-col">
                      <span>{session.drugName}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            <CommandGroup heading="Drugs">
              {drugs.map((drug) => (
                <CommandItem
                  key={drug.id}
                  value={drug.name}
                  onSelect={() => handleSelectDrug(drug)}
                >
                  {drug.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        )}
      </Command>
    </div>
  );
};

export default DrugSearch;
