import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { fetchRxNormDisplayTerms, RxNormDisplayTerm } from "@/integrations/rxnorm";
import { formatDrugNameForDisplay } from "@/utils/drugNameUtils";

const DrugSearch = () => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [drugs, setDrugs] = useState<RxNormDisplayTerm[]>([]);
  const [allDrugs, setAllDrugs] = useState<RxNormDisplayTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch RxNorm display terms once (on mount or first search)
  useEffect(() => {
    if (allDrugs.length === 0 && searchTerm.length >= 3) {
      setLoading(true);
      setError(null);
      fetchRxNormDisplayTerms()
        .then((terms) => {
          setAllDrugs(terms);
          setLoading(false);
        })
        .catch((err) => {
          setError("Failed to load drug names. Try again later.");
          setLoading(false);
        });
    }
  }, [searchTerm, allDrugs.length]);

  // Filter drugs client-side
  useEffect(() => {
    if (searchTerm.length >= 3 && allDrugs.length > 0) {
      const filteredDrugs = allDrugs.filter((drug) =>
        drug.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log("Filtered drugs for search '", searchTerm, "':", filteredDrugs.slice(0, 10), `...total: ${filteredDrugs.length}`);
      setDrugs(filteredDrugs);
    } else {
      setDrugs([]);
    }
  }, [searchTerm, allDrugs]);

  const handleSelectDrug = (drug: RxNormDisplayTerm) => {
    setOpen(false);
    setSearchTerm("");
    // Use formatted drug name for better display
    const formattedName = formatDrugNameForDisplay(drug.name);
    navigate(`/session`, { state: { drugName: formattedName } });
  };

  return (
    <div className="relative w-full">
      <Command className="rounded-lg border shadow-md">
        <CommandInput
          placeholder="Search for a drug... (type at least 3 characters)"
          value={searchTerm}
          onValueChange={setSearchTerm}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        <CommandList className="max-h-[300px] overflow-y-auto">
          {searchTerm.length >= 3 && (
            <div>
              {loading && (
                <div className="py-4 text-center text-gray-500">Loading drug names...</div>
              )}
              {!loading && error && (
                <div className="py-4 text-center text-red-500">{error}</div>
              )}
              {!loading && !error && (
                <div>
                  <CommandEmpty>No drugs found.</CommandEmpty>
                  <CommandGroup heading="Drugs">
                    {drugs.map((drug) => (
                      <CommandItem
                        key={drug.id}
                        value={drug.name}
                        onSelect={() => handleSelectDrug(drug)}
                      >
                        {formatDrugNameForDisplay(drug.name)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              )}
            </div>
          )}
        </CommandList>
      </Command>
    </div>
  );
};

export default DrugSearch;
