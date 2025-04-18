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
    // In a real application, you would fetch drugs from an API
    // Here, we use mock data and filter it based on the search term
    const filteredDrugs = mockDrugs.filter((drug) =>
      drug.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setDrugs(filteredDrugs);
  }, [searchTerm]);

  const handleSelectDrug = (drug: Drug) => {
    setOpen(false);
    setSearchTerm("");
    navigate(`/session/${drug.id}`, { state: { drugName: drug.name } });
  };

  return (
    <div className="relative w-full">
      <CommandInput
        placeholder="Search for a drug..."
        value={searchTerm}
        onValueChange={setSearchTerm}
        className="w-full"
      />
      <CommandList className="absolute z-50 w-full min-w-[300px] max-h-[300px] overflow-y-auto bg-white border rounded-md shadow-lg">
        <CommandEmpty>No drugs found.</CommandEmpty>
        <CommandGroup>
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
    </div>
  );
};

export default DrugSearch;
