// Test script to verify service role key works
// You'll need to replace SERVICE_ROLE_KEY with your actual key

const serviceRoleKey = 'YOUR_SERVICE_ROLE_KEY_HERE';

async function testServiceKey() {
  try {
    console.log('Testing service role key with process-doc-jobs...');
    
    const response = await fetch('https://oeazqjeopkepqynrqsxj.supabase.co/functions/v1/process-doc-jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    console.log('HTTP Status:', response.status);
    
    const result = await response.text();
    console.log('Response:', result);
    
    if (response.status === 200) {
      console.log('✅ Service role key works correctly!');
    } else {
      console.log('❌ Service role key issue - check the key value');
    }
    
  } catch (error) {
    console.error('❌ Error testing service key:', error);
  }
}

console.log('Replace YOUR_SERVICE_ROLE_KEY_HERE with your actual service role key from Supabase dashboard');
console.log('Then run: node test-service-key.js');

// Uncomment the line below after adding your key
// testServiceKey(); 