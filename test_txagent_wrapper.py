#!/usr/bin/env python3
"""
Test script for TxAgent Assistant Wrapper
Tests the API endpoints to ensure they work correctly
"""

import requests
import json
import time

# Configuration
BASE_URL = "http://localhost:8001"
TIMEOUT = 30

def test_health_endpoint():
    """Test the health check endpoint"""
    print("Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_shortage_analysis():
    """Test shortage analysis functionality"""
    print("\nTesting shortage analysis...")
    
    payload = {
        "assistantType": "shortage",
        "drugData": {
            "brand_name": "Acetaminophen",
            "drug_name": "acetaminophen",
            "shortage_status": "Shortage",
            "reason_shortage": "Manufacturing delay",
            "anticipated_resolution_date": "2024-03-15",
            "company_name": "Generic Pharma Inc",
            "din": "12345678"
        },
        "sessionId": "test-session-1",
        "generateDocument": False
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/openai-assistant",
            json=payload,
            timeout=TIMEOUT,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Thread ID: {data.get('threadId')}")
            print(f"Number of messages: {len(data.get('messages', []))}")
            
            # Print the assistant's response
            for msg in data.get('messages', []):
                if msg['role'] == 'assistant':
                    print(f"\nAssistant Response Preview:")
                    print(msg['content'][:500] + "..." if len(msg['content']) > 500 else msg['content'])
                    break
            
            return True
        else:
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"Shortage analysis test failed: {e}")
        return False

def test_document_generation():
    """Test document generation functionality"""
    print("\nTesting document generation...")
    
    payload = {
        "assistantType": "document",
        "drugData": {
            "brand_name": "Ibuprofen",
            "drug_name": "ibuprofen",
            "shortage_status": "Anticipated Shortage",
            "reason_shortage": "Supply chain disruption",
            "anticipated_resolution_date": "2024-04-01",
            "company_name": "Pain Relief Corp",
            "din": "87654321"
        },
        "sessionId": "test-session-2",
        "generateDocument": True
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/openai-assistant",
            json=payload,
            timeout=TIMEOUT,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Thread ID: {data.get('threadId')}")
            print(f"Number of messages: {len(data.get('messages', []))}")
            
            # Print the generated document preview
            for msg in data.get('messages', []):
                if msg['role'] == 'assistant':
                    print(f"\nGenerated Document Preview:")
                    print(msg['content'][:800] + "..." if len(msg['content']) > 800 else msg['content'])
                    break
            
            return True
        else:
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"Document generation test failed: {e}")
        return False

def test_conversation_continuity():
    """Test conversation continuity with follow-up messages"""
    print("\nTesting conversation continuity...")
    
    # First request to establish conversation
    initial_payload = {
        "assistantType": "shortage",
        "drugData": {
            "brand_name": "Warfarin",
            "shortage_status": "Shortage"
        },
        "sessionId": "test-session-3"
    }
    
    try:
        # Initial request
        response = requests.post(
            f"{BASE_URL}/openai-assistant",
            json=initial_payload,
            timeout=TIMEOUT
        )
        
        if response.status_code != 200:
            print(f"Initial request failed: {response.text}")
            return False
        
        data = response.json()
        thread_id = data.get('threadId')
        print(f"Initial Thread ID: {thread_id}")
        
        # Follow-up request with the same thread
        followup_payload = {
            "assistantType": "shortage",
            "threadId": thread_id,
            "messages": [
                {
                    "role": "user",
                    "content": "What are the main therapeutic alternatives for this drug?"
                }
            ],
            "sessionId": "test-session-3"
        }
        
        response = requests.post(
            f"{BASE_URL}/openai-assistant",
            json=followup_payload,
            timeout=TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"Follow-up Thread ID: {data.get('threadId')}")
            print(f"Total messages in conversation: {len(data.get('messages', []))}")
            
            # Check if conversation was maintained
            if data.get('threadId') == thread_id:
                print("✓ Conversation continuity maintained!")
                return True
            else:
                print("✗ Conversation continuity failed - different thread IDs")
                return False
        else:
            print(f"Follow-up request failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"Conversation continuity test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("TxAgent Assistant Wrapper - Test Suite")
    print("=" * 50)
    
    # Test service availability
    if not test_health_endpoint():
        print("❌ Service is not available. Make sure the TxAgent wrapper is running.")
        print("Start it with: python start_txagent_wrapper.py")
        return
    
    print("✅ Service is healthy!")
    
    # Run functionality tests
    tests = [
        ("Shortage Analysis", test_shortage_analysis),
        ("Document Generation", test_document_generation),
        ("Conversation Continuity", test_conversation_continuity)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'-' * 30}")
        success = test_func()
        results.append((test_name, success))
        if success:
            print(f"✅ {test_name} test passed!")
        else:
            print(f"❌ {test_name} test failed!")
    
    # Summary
    print(f"\n{'=' * 50}")
    print("TEST SUMMARY")
    print(f"{'=' * 50}")
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! TxAgent wrapper is working correctly.")
        print("\nNext steps:")
        print("1. Update your frontend to use the TxAgent client")
        print("2. Test with your actual drug shortage data")
        print("3. Implement your custom response templates")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please check the service logs.")

if __name__ == "__main__":
    main() 