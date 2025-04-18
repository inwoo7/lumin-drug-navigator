
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";

interface Drug {
  id: string;
  name: string;
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
  const navigate = useNavigate();

  useEffect(() => {
    // Filter drugs based on search term
    const filteredDrugs = mockDrugs.filter((drug) =>
      drug.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setDrugs(filteredDrugs);
  }, [searchTerm]);

  const handleSelectDrug = async (drug: Drug) => {
    setOpen(false);
    setSearchTerm("");
    navigate(`/session`, { state: { drugName: drug.name } });
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
