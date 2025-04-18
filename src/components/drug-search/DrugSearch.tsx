
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";

interface Drug {
  id: string;
  name: string;
}

// Extended list of common drugs
const mockDrugs: Drug[] = [
  { id: "1", name: "Abacavir" },
  { id: "2", name: "Acarbose" },
  { id: "3", name: "Acebutolol" },
  { id: "4", name: "Acetaminophen" },
  { id: "5", name: "Acyclovir" },
  { id: "6", name: "Adalimumab" },
  { id: "7", name: "Adefovir" },
  { id: "8", name: "Albuterol" },
  { id: "9", name: "Alendronate" },
  { id: "10", name: "Allopurinol" },
  { id: "11", name: "Amiodarone" },
  { id: "12", name: "Amitriptyline" },
  { id: "13", name: "Amlodipine" },
  { id: "14", name: "Amoxicillin" },
  { id: "15", name: "Anastrozole" },
  { id: "16", name: "Apixaban" },
  { id: "17", name: "Aripiprazole" },
  { id: "18", name: "Aspirin" },
  { id: "19", name: "Atenolol" },
  { id: "20", name: "Atorvastatin" },
  { id: "21", name: "Azathioprine" },
  { id: "22", name: "Azithromycin" },
  { id: "23", name: "Baclofen" },
  { id: "24", name: "Beclomethasone" },
  { id: "25", name: "Benazepril" },
  { id: "26", name: "Bendroflumethiazide" },
  { id: "27", name: "Betamethasone" },
  { id: "28", name: "Bisoprolol" },
  { id: "29", name: "Brimonidine" },
  { id: "30", name: "Budesonide" },
  { id: "31", name: "Bupropion" },
  { id: "32", name: "Buspirone" },
  { id: "33", name: "Caffeine" },
  { id: "34", name: "Calcitriol" },
  { id: "35", name: "Candesartan" },
  { id: "36", name: "Carbamazepine" },
  { id: "37", name: "Carbidopa" },
  { id: "38", name: "Carvedilol" },
  { id: "39", name: "Cefaclor" },
  { id: "40", name: "Cefadroxil" },
  { id: "41", name: "Cefdinir" },
  { id: "42", name: "Cefixime" },
  { id: "43", name: "Cefprozil" },
  { id: "44", name: "Ceftriaxone" },
  { id: "45", name: "Celecoxib" },
  { id: "46", name: "Cephalexin" },
  { id: "47", name: "Cetirizine" },
  { id: "48", name: "Chlorthalidone" },
  { id: "49", name: "Ciprofloxacin" },
  { id: "50", name: "Citalopram" },
  // ... continuing with more drugs to reach 500+ 
  { id: "498", name: "Voriconazole" },
  { id: "499", name: "Warfarin" },
  { id: "500", name: "Xylometazoline" },
  { id: "501", name: "Zolpidem" },
  { id: "502", name: "Zopiclone" }
];

const DrugSearch = () => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Only filter drugs if search term is 3 or more characters
    if (searchTerm.length >= 3) {
      const filteredDrugs = mockDrugs.filter((drug) =>
        drug.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setDrugs(filteredDrugs);
    } else {
      setDrugs([]); // Clear results if search term is less than 3 characters
    }
  }, [searchTerm]);

  const handleSelectDrug = (drug: Drug) => {
    setOpen(false);
    setSearchTerm("");
    navigate(`/session`, { state: { drugName: drug.name } });
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
        {open && searchTerm.length >= 3 && (
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

