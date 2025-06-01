# test_simple.py
import os
import sys

def test_basic_imports():
    """Test basic imports that should work"""
    try:
        print("Testing basic imports...")
        
        import tooluniverse
        print("✓ ToolUniverse imported successfully")
        
        from google.cloud import aiplatform
        print("✓ Google Cloud AI Platform imported successfully")
        
        import transformers
        print("✓ Transformers imported successfully")
        
        print("\n✓ Basic imports successful!")
        return True
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False

def test_tooluniverse_detailed():
    """Test ToolUniverse functionality in detail"""
    try:
        print("\nTesting ToolUniverse...")
        from tooluniverse import ToolUniverse
        
        # Initialize ToolUniverse
        tool_universe = ToolUniverse()
        print("✓ ToolUniverse initialized")
        
        # Get available tools
        tools = tool_universe.get_tools()
        print(f"✓ Found {len(tools)} tools available")
        
        # Print first few tools with details
        print("\nSample tools:")
        for i, tool in enumerate(tools[:3]):
            name = tool.get('name', 'Unknown')
            description = tool.get('description', 'No description')[:100]
            print(f"  {i+1}. {name}")
            print(f"     Description: {description}...")
        
        # Test tool search functionality
        drug_tools = [tool for tool in tools if 'drug' in tool.get('name', '').lower()]
        print(f"\n✓ Found {len(drug_tools)} drug-related tools")
        
        return True
    except Exception as e:
        print(f"✗ ToolUniverse error: {e}")
        return False

def test_txagent_import():
    """Test if TxAgent can be imported"""
    try:
        print("\nTesting TxAgent import...")
        
        # Try different import methods
        try:
            import txagent
            print("✓ TxAgent imported from package")
            return True
        except ImportError:
            print("✗ TxAgent package not found")
            
        try:
            from txagent import TxAgent
            print("✓ TxAgent class imported")
            return True
        except ImportError:
            print("✗ TxAgent class not found")
            
        return False
        
    except Exception as e:
        print(f"✗ TxAgent error: {e}")
        return False

def test_huggingface_model():
    """Test if we can access the TxAgent model via HuggingFace"""
    try:
        print("\nTesting HuggingFace model access...")
        from transformers import AutoTokenizer, AutoModelForCausalLM
        
        model_name = "mims-harvard/TxAgent-T1-Llama-3.1-8B"
        print(f"Attempting to load tokenizer for {model_name}...")
        
        # Just test tokenizer first (faster)
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        print("✓ Tokenizer loaded successfully")
        
        # Test encoding
        test_text = "What are alternatives to acetaminophen?"
        tokens = tokenizer.encode(test_text)
        print(f"✓ Text encoding works (tokens: {len(tokens)})")
        
        print("✓ HuggingFace model access successful")
        return True
        
    except Exception as e:
        print(f"✗ HuggingFace error: {e}")
        print("This might be normal if the model requires authentication or is large")
        return False

if __name__ == "__main__":
    print("=== Simplified TxAgent Setup Test ===\n")
    
    # Test basic imports
    basic_ok = test_basic_imports()
    if not basic_ok:
        print("\n❌ Basic setup incomplete. Please install missing packages.")
        sys.exit(1)
    
    # Test ToolUniverse
    tooluniverse_ok = test_tooluniverse_detailed()
    
    # Test TxAgent import
    txagent_ok = test_txagent_import()
    
    # Test HuggingFace access (optional)
    hf_ok = test_huggingface_model()
    
    print("\n=== Test Summary ===")
    print(f"Basic imports: {'✓' if basic_ok else '✗'}")
    print(f"ToolUniverse: {'✓' if tooluniverse_ok else '✗'}")
    print(f"TxAgent import: {'✓' if txagent_ok else '✗'}")
    print(f"HuggingFace model: {'✓' if hf_ok else '✗'}")
    
    if basic_ok and tooluniverse_ok:
        print("\n🎉 Core functionality is working!")
        if not txagent_ok:
            print("💡 TxAgent package needs to be installed from source")
            print("   Try: pip install git+https://github.com/mims-harvard/TxAgent.git")
    else:
        print("\n⚠️  Some issues detected. Check error messages above.") 