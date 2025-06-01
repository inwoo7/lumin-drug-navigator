# fix_tooluniverse.py
from tooluniverse import ToolUniverse

def test_tool_access_methods():
    """Test different ways to access tools from ToolUniverse"""
    print("=== Testing ToolUniverse Tool Access ===\n")
    
    tool_universe = ToolUniverse()
    
    # Test different attributes/methods we found
    methods_to_test = [
        'all_tool_dict',
        'all_tools', 
        'return_all_loaded_tools',
        'callable_functions'
    ]
    
    for method_name in methods_to_test:
        print(f"Testing: {method_name}")
        try:
            if hasattr(tool_universe, method_name):
                method_or_attr = getattr(tool_universe, method_name)
                
                if callable(method_or_attr):
                    # It's a method, call it
                    result = method_or_attr()
                    print(f"  ✓ {method_name}(): {type(result)}")
                    if hasattr(result, '__len__'):
                        print(f"    Length: {len(result)}")
                    if isinstance(result, dict):
                        print(f"    Keys: {list(result.keys())[:5]}...")
                    elif isinstance(result, list) and result:
                        print(f"    First item: {type(result[0])}")
                        if isinstance(result[0], dict):
                            print(f"    First item keys: {list(result[0].keys())}")
                else:
                    # It's an attribute
                    print(f"  ✓ {method_name}: {type(method_or_attr)}")
                    if hasattr(method_or_attr, '__len__'):
                        print(f"    Length: {len(method_or_attr)}")
            else:
                print(f"  ✗ {method_name}: Not found")
        except Exception as e:
            print(f"  ✗ {method_name}: Error - {e}")
        print()
    
    # Try to manually load tools
    print("=== Manual Tool Loading ===")
    try:
        print("Calling load_tools()...")
        tool_universe.load_tools()
        print("✓ load_tools() completed")
        
        # Try accessing tools again
        print("Retrying all_tools after load_tools()...")
        tools = tool_universe.all_tools
        print(f"✓ all_tools now returns: {len(tools)} tools")
        
        if tools:
            print("Sample tool:")
            print(f"  Name: {tools[0].get('name', 'Unknown')}")
            print(f"  Description: {tools[0].get('description', 'No description')[:100]}...")
            
    except Exception as e:
        print(f"✗ Manual loading error: {e}")

if __name__ == "__main__":
    test_tool_access_methods() 