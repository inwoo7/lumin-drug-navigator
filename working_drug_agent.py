# working_drug_agent.py
import json
from typing import List, Dict, Any
from transformers import AutoTokenizer
from tooluniverse import ToolUniverse

class WorkingDrugAgent:
    """
    Working drug analysis agent using HuggingFace tokenizer, ToolUniverse, and knowledge base
    """
    
    def __init__(self):
        print("Initializing WorkingDrugAgent...")
        
        # Load the TxAgent tokenizer (we know this works)
        try:
            self.tokenizer = AutoTokenizer.from_pretrained("mims-harvard/TxAgent-T1-Llama-3.1-8B")
            print("✓ TxAgent tokenizer loaded")
        except Exception as e:
            print(f"⚠️ Could not load TxAgent tokenizer: {e}")
            self.tokenizer = None
        
        # Initialize ToolUniverse (we now know the correct API)
        try:
            self.tool_universe = ToolUniverse()
            
            # IMPORTANT: Need to load tools first!
            print("Loading tools from ToolUniverse...")
            self.tool_universe.load_tools()
            
            self.available_tools = self.tool_universe.all_tools
            print(f"✓ ToolUniverse loaded with {len(self.available_tools)} tools")
            
            # Get drug-related tools
            self.drug_tools = self._get_drug_tools()
            print(f"✓ Found {len(self.drug_tools)} drug-related tools")
            
        except Exception as e:
            print(f"⚠️ Could not load ToolUniverse: {e}")
            self.tool_universe = None
            self.available_tools = []
            self.drug_tools = []
        
        # Load our drug knowledge base
        self.drug_alternatives = self._load_drug_alternatives()
        print(f"✓ Loaded alternatives for {len(self.drug_alternatives)} drugs")
    
    def _get_drug_tools(self) -> List[Dict]:
        """Filter tools that are drug-related"""
        if not self.available_tools:
            return []
            
        drug_keywords = ['drug', 'medication', 'pharmaceutical', 'therapeutic', 'fda', 'interaction', 'target', 'disease']
        drug_tools = []
        
        for tool in self.available_tools:
            name = tool.get('name', '').lower()
            description = tool.get('description', '').lower()
            
            if any(keyword in name or keyword in description for keyword in drug_keywords):
                drug_tools.append(tool)
                
        return drug_tools
    
    def list_available_tools(self) -> List[str]:
        """List available drug-related tools"""
        return [tool.get('name', 'Unknown') for tool in self.drug_tools]
    
    def get_tool_info(self, tool_name: str) -> Dict:
        """Get detailed information about a specific tool"""
        if not self.tool_universe:
            return {}
            
        try:
            return self.tool_universe.get_tool_by_name(tool_name)
        except Exception as e:
            print(f"Error getting tool {tool_name}: {e}")
            return {}
    
    def _load_drug_alternatives(self) -> Dict[str, Dict]:
        """Load a basic drug alternatives knowledge base"""
        return {
            "acetaminophen": {
                "alternatives": ["ibuprofen", "aspirin", "naproxen", "celecoxib"],
                "class": "analgesic",
                "contraindications": ["liver disease", "alcohol use"],
                "interactions": ["warfarin", "phenytoin"],
                "notes": "First-line for pain and fever"
            },
            "ibuprofen": {
                "alternatives": ["acetaminophen", "naproxen", "aspirin", "celecoxib"],
                "class": "NSAID",
                "contraindications": ["kidney disease", "heart failure", "peptic ulcer"],
                "interactions": ["warfarin", "ACE inhibitors", "lithium"],
                "notes": "Anti-inflammatory, avoid in kidney disease"
            },
            "aspirin": {
                "alternatives": ["acetaminophen", "ibuprofen", "clopidogrel"],
                "class": "NSAID/antiplatelet",
                "contraindications": ["bleeding disorders", "peptic ulcer", "children with viral infections"],
                "interactions": ["warfarin", "methotrexate"],
                "notes": "Cardioprotective at low doses"
            },
            "warfarin": {
                "alternatives": ["apixaban", "rivaroxaban", "dabigatran", "enoxaparin"],
                "class": "anticoagulant",
                "contraindications": ["bleeding risk", "pregnancy"],
                "interactions": ["many drug interactions"],
                "notes": "Requires INR monitoring"
            },
            "metformin": {
                "alternatives": ["glipizide", "insulin", "sitagliptin"],
                "class": "antidiabetic",
                "contraindications": ["kidney disease", "metabolic acidosis"],
                "interactions": ["contrast agents"],
                "notes": "First-line for type 2 diabetes"
            },
            "lisinopril": {
                "alternatives": ["losartan", "amlodipine", "hydrochlorothiazide"],
                "class": "ACE inhibitor",
                "contraindications": ["pregnancy", "angioedema history"],
                "interactions": ["potassium supplements", "NSAIDs"],
                "notes": "Monitor kidney function and potassium"
            }
        }
    
    def analyze_drug_shortage(self, drug_name: str) -> Dict[str, Any]:
        """Analyze drug shortage and provide recommendations using both knowledge base and tools"""
        drug_name_lower = drug_name.lower().strip()
        
        print(f"\n=== Analyzing Drug Shortage: {drug_name} ===")
        
        # Check if we have knowledge about this drug
        drug_info = self.drug_alternatives.get(drug_name_lower, {})
        
        results = {
            "drug_name": drug_name,
            "alternatives": drug_info.get("alternatives", []),
            "drug_class": drug_info.get("class", "Unknown"),
            "contraindications": drug_info.get("contraindications", []),
            "interactions": drug_info.get("interactions", []),
            "clinical_notes": drug_info.get("notes", ""),
            "shortage_recommendations": self._generate_shortage_recommendations(drug_name, drug_info),
            "clinical_recommendations": self._generate_clinical_recommendations(drug_name, drug_info),
            "has_knowledge": bool(drug_info),
            "tool_results": {},
            "tools_used": []
        }
        
        # Try to use ToolUniverse tools for additional information
        if self.tool_universe and self.drug_tools:
            tool_results = self._query_drug_tools(drug_name)
            results["tool_results"] = tool_results
            results["tools_used"] = list(tool_results.keys())
            
            # Extract additional alternatives from tool results
            additional_alternatives = self._extract_alternatives_from_tools(tool_results)
            if additional_alternatives:
                results["alternatives"].extend(additional_alternatives)
                results["alternatives"] = list(set(results["alternatives"]))  # Remove duplicates
        
        # If we don't have specific knowledge, provide general guidance
        if not drug_info:
            results["alternatives"] = self._suggest_general_alternatives(drug_name)
            results["shortage_recommendations"] = self._generate_general_shortage_recommendations(drug_name)
        
        return results
    
    def _query_drug_tools(self, drug_name: str) -> Dict[str, Any]:
        """Query relevant drug tools for information"""
        tool_results = {}
        
        # Try a few relevant tools (limit to avoid too many calls)
        relevant_tools = self.drug_tools[:3]  # Just try first 3 tools
        
        for tool in relevant_tools:
            tool_name = tool.get('name', 'Unknown')
            print(f"Attempting to use tool: {tool_name}")
            
            try:
                # Fix: Try different ways to call the tool based on the API
                
                # Method 1: Try with just the tool name (no parameters)
                try:
                    result = self.tool_universe.run_one_function(tool_name)
                    tool_results[tool_name] = result
                    print(f"✓ Successfully used {tool_name} (method 1)")
                    continue
                except Exception as e1:
                    print(f"  Method 1 failed: {e1}")
                
                # Method 2: Try using run() method instead
                try:
                    # Create a query string that might work with the tool
                    query = f"Find information about {drug_name}"
                    result = self.tool_universe.run(query)
                    tool_results[tool_name] = result
                    print(f"✓ Successfully used {tool_name} (method 2)")
                    continue
                except Exception as e2:
                    print(f"  Method 2 failed: {e2}")
                
                # Method 3: Try get_tool_by_name to understand the tool structure
                try:
                    tool_info = self.tool_universe.get_tool_by_name(tool_name)
                    # Just save the tool info for now
                    tool_results[tool_name] = f"Tool info: {tool_info.get('description', 'No description')}"
                    print(f"✓ Got tool info for {tool_name} (method 3)")
                    continue
                except Exception as e3:
                    print(f"  Method 3 failed: {e3}")
                
                # If all methods fail
                tool_results[tool_name] = f"Unable to execute tool: {tool_name}"
                
            except Exception as e:
                print(f"⚠️ Error using tool {tool_name}: {e}")
                tool_results[tool_name] = f"Error: {e}"
        
        return tool_results
    
    def _extract_alternatives_from_tools(self, tool_results: Dict) -> List[str]:
        """Extract potential alternatives from tool results"""
        alternatives = []
        
        # This is simplified - in reality would parse structured tool responses
        for tool_name, result in tool_results.items():
            if isinstance(result, str) and "Error:" not in result:
                # Look for drug names in the results (very basic approach)
                # In reality, tools would return structured data
                pass
        
        return alternatives
    
    def _suggest_general_alternatives(self, drug_name: str) -> List[str]:
        """Suggest general alternatives based on drug name patterns"""
        alternatives = []
        drug_lower = drug_name.lower()
        
        # Basic pattern matching for common drug classes
        if any(word in drug_lower for word in ['acetaminophen', 'tylenol', 'paracetamol']):
            alternatives = ["ibuprofen", "aspirin", "naproxen"]
        elif any(word in drug_lower for word in ['ibuprofen', 'advil', 'motrin']):
            alternatives = ["acetaminophen", "naproxen", "aspirin"]
        elif any(word in drug_lower for word in ['aspirin', 'asa']):
            alternatives = ["acetaminophen", "ibuprofen", "clopidogrel"]
        elif 'pril' in drug_lower:  # ACE inhibitors
            alternatives = ["losartan", "amlodipine", "hydrochlorothiazide"]
        elif 'sartan' in drug_lower:  # ARBs
            alternatives = ["lisinopril", "amlodipine", "hydrochlorothiazide"]
        else:
            alternatives = ["Consult pharmacist for alternatives"]
        
        return alternatives
    
    def _generate_shortage_recommendations(self, drug_name: str, drug_info: Dict) -> List[str]:
        """Generate shortage-specific recommendations"""
        recommendations = [
            f"Contact suppliers to determine {drug_name} availability timeline",
            "Check alternative suppliers and generic manufacturers",
            "Implement conservation strategies if supply is critically low",
            "Communicate shortage status to prescribers and clinical teams"
        ]
        
        if drug_info.get("alternatives"):
            recommendations.append(f"Consider switching to alternatives: {', '.join(drug_info['alternatives'][:3])}")
        
        if drug_info.get("class"):
            recommendations.append(f"Look for other {drug_info['class']} medications as alternatives")
        
        recommendations.extend([
            "Monitor patient outcomes during medication transitions",
            "Document all shortage-related medication changes",
            "Establish protocols for transitioning back when supply resumes"
        ])
        
        return recommendations
    
    def _generate_clinical_recommendations(self, drug_name: str, drug_info: Dict) -> List[str]:
        """Generate clinical recommendations for switching medications"""
        recommendations = []
        
        if drug_info.get("contraindications"):
            recommendations.append(f"Screen for contraindications: {', '.join(drug_info['contraindications'])}")
        
        if drug_info.get("interactions"):
            recommendations.append(f"Check for interactions with: {', '.join(drug_info['interactions'])}")
        
        recommendations.extend([
            "Verify patient allergies before medication switch",
            "Adjust dosing based on patient's renal and hepatic function",
            "Provide patient education about the new medication",
            "Schedule appropriate follow-up monitoring",
            "Consider therapeutic drug monitoring if applicable"
        ])
        
        return recommendations
    
    def _generate_general_shortage_recommendations(self, drug_name: str) -> List[str]:
        """Generate general recommendations when specific drug info is not available"""
        return [
            f"Research therapeutic class and alternatives for {drug_name}",
            "Consult drug information resources (Lexicomp, Micromedex, etc.)",
            "Contact clinical pharmacist for alternative recommendations",
            "Check with manufacturers for shortage duration estimates",
            "Review clinical guidelines for alternative treatment options",
            "Consider compounding options if appropriate",
            "Document shortage impact and alternative therapy outcomes"
        ]
    
    def get_drug_info(self, drug_name: str) -> Dict[str, Any]:
        """Get detailed information about a specific drug"""
        drug_name_lower = drug_name.lower().strip()
        return self.drug_alternatives.get(drug_name_lower, {})
    
    def list_available_drugs(self) -> List[str]:
        """List drugs we have knowledge about"""
        return list(self.drug_alternatives.keys())

def demo_working_agent():
    """Demo the working drug agent with ToolUniverse integration"""
    try:
        agent = WorkingDrugAgent()
        
        print(f"\nAvailable drug-related tools: {len(agent.drug_tools)}")
        if agent.drug_tools:
            print("Sample tools:")
            for tool in agent.drug_tools[:3]:
                print(f"  - {tool.get('name', 'Unknown')}: {tool.get('description', 'No description')[:80]}...")
        
        # Test with a known drug
        print("\n" + "="*60)
        result1 = agent.analyze_drug_shortage("acetaminophen")
        print(f"Drug: {result1['drug_name']}")
        print(f"Alternatives: {result1['alternatives']}")
        print(f"Class: {result1['drug_class']}")
        print(f"Contraindications: {result1['contraindications']}")
        print(f"Tools used: {result1['tools_used']}")
        
        # Test with an unknown drug
        print("\n" + "="*60)
        result2 = agent.analyze_drug_shortage("unknown_drug")
        print(f"Drug: {result2['drug_name']}")
        print(f"Has knowledge: {result2['has_knowledge']}")
        print(f"Alternatives: {result2['alternatives']}")
        print(f"Tools used: {result2['tools_used']}")
        
        return agent
        
    except Exception as e:
        print(f"Error in demo: {e}")
        return None

if __name__ == "__main__":
    demo_working_agent() 