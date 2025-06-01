# explore_tooluniverse.py
import json
from tooluniverse import ToolUniverse

def explore_tooluniverse():
    """Explore the actual ToolUniverse API"""
    print("=== Exploring ToolUniverse API ===\n")
    
    try:
        # Initialize ToolUniverse
        tool_universe = ToolUniverse()
        print("✓ ToolUniverse initialized")
        
        # Explore available methods
        print("\nAvailable methods:")
        methods = [method for method in dir(tool_universe) if not method.startswith('_')]
        for method in methods:
            print(f"  - {method}")
        
        # Try different ways to access tools
        print("\n=== Testing different access methods ===")
        
        # Check if there are any attributes that might contain tools
        print("\nAttributes:")
        for attr in ['tools', 'tool_list', 'available_tools', 'tool_data']:
            if hasattr(tool_universe, attr):
                value = getattr(tool_universe, attr)
                print(f"  - {attr}: {type(value)} (length: {len(value) if hasattr(value, '__len__') else 'N/A'})")
            else:
                print(f"  - {attr}: Not found")
        
        # Try calling methods that might return tools
        print("\nTrying methods:")
        for method_name in ['get_tools', 'list_tools', 'tools', 'get_all_tools']:
            if hasattr(tool_universe, method_name):
                try:
                    method = getattr(tool_universe, method_name)
                    if callable(method):
                        result = method()
                        print(f"  - {method_name}(): {type(result)} (length: {len(result) if hasattr(result, '__len__') else 'N/A'})")
                        if hasattr(result, '__len__') and len(result) > 0:
                            print(f"    First item: {type(result[0]) if hasattr(result, '__getitem__') else 'N/A'}")
                    else:
                        print(f"  - {method_name}: {type(method)} (not callable)")
                except Exception as e:
                    print(f"  - {method_name}(): Error - {e}")
            else:
                print(f"  - {method_name}: Not found")
        
        # Try to access tool files directly (we saw file paths in the output)
        print("\n=== Checking tool files ===")
        if hasattr(tool_universe, 'tool_files'):
            print("Tool files found:", tool_universe.tool_files)
            
            # Try to load one of the tool files
            for tool_type, file_path in tool_universe.tool_files.items():
                print(f"\nLoading {tool_type} tools from: {file_path}")
                try:
                    with open(file_path, 'r') as f:
                        tools_data = json.load(f)
                        print(f"  - Loaded {len(tools_data)} tools")
                        if tools_data:
                            print(f"  - Sample tool keys: {list(tools_data[0].keys()) if isinstance(tools_data, list) else list(tools_data.keys())}")
                        break  # Just try the first one
                except Exception as e:
                    print(f"  - Error loading {tool_type}: {e}")
        
        return tool_universe
        
    except Exception as e:
        print(f"Error exploring ToolUniverse: {e}")
        return None

if __name__ == "__main__":
    explore_tooluniverse() 