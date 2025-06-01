# test_txagent.py
import os
import sys

def test_imports():
    """Test if all required packages can be imported"""
    try:
        print("Testing imports...")
        import tooluniverse
        print("✓ ToolUniverse imported successfully")
        
        import txagent
        print("✓ TxAgent imported successfully")
        
        from google.cloud import aiplatform
        print("✓ Google Cloud AI Platform imported successfully")
        
        print("\n✓ All imports successful!")
        return True
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False

def test_tooluniverse():
    """Test ToolUniverse functionality"""
    try:
        print("\nTesting ToolUniverse...")
        from tooluniverse import ToolUniverse
        
        # Initialize ToolUniverse
        tool_universe = ToolUniverse()
        print("✓ ToolUniverse initialized")
        
        # Get available tools
        tools = tool_universe.get_tools()
        print(f"✓ Found {len(tools)} tools available")
        
        # Print first few tools
        print("Sample tools:")
        for i, tool in enumerate(tools[:5]):
            print(f"  - {tool.get('name', 'Unknown')}")
        
        return True
    except Exception as e:
        print(f"✗ ToolUniverse error: {e}")
        return False

def test_drug_analysis():
    """Test basic drug analysis functionality"""
    try:
        print("\nTesting drug analysis...")
        from txagent import TxAgent
        
        # Initialize TxAgent
        agent = TxAgent()
        print("✓ TxAgent initialized")
        
        # Test query about acetaminophen
        query = "What are the therapeutic alternatives for acetaminophen?"
        print(f"Query: {query}")
        
        # Note: This might take a while on first run
        response = agent.run(query)
        print("✓ Got response from TxAgent")
        print(f"Response preview: {str(response)[:200]}...")
        
        return True
    except Exception as e:
        print(f"✗ TxAgent error: {e}")
        print("This might be normal if running for the first time or without proper model setup")
        return False

if __name__ == "__main__":
    print("=== TxAgent Setup Test ===\n")
    
    # Test imports
    imports_ok = test_imports()
    if not imports_ok:
        print("\n❌ Setup incomplete. Please install missing packages.")
        sys.exit(1)
    
    # Test ToolUniverse
    tooluniverse_ok = test_tooluniverse()
    
    # Test TxAgent (optional, might fail without model)
    txagent_ok = test_drug_analysis()
    
    print("\n=== Test Summary ===")
    print(f"Imports: {'✓' if imports_ok else '✗'}")
    print(f"ToolUniverse: {'✓' if tooluniverse_ok else '✗'}")
    print(f"TxAgent: {'✓' if txagent_ok else '✗'}")
    
    if imports_ok and tooluniverse_ok:
        print("\n🎉 Basic setup is working! Ready for integration.")
    else:
        print("\n⚠️  Some issues detected. Check error messages above.") 