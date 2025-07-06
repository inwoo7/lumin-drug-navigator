const { createClient } = require('@supabase/supabase-js');

async function checkJobs() {
  const supabaseUrl = 'https://oeazqjeopkepqynrqsxj.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXpxamVvcGtlcHF5bnJxc3hqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzE5NzQ3MSwiZXhwIjoyMDUyNzczNDcxfQ.mzYdvCPF8XYjJoOWqZNFQfUJLNzU7zSZvLdJfGYHXSo';
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Check recent jobs
    const { data, error } = await supabase
      .from('document_generation_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    console.log('📋 Recent Document Generation Jobs:');
    console.log('=====================================');
    
    data.forEach((job, index) => {
      console.log(`${index + 1}. Job ID: ${job.id.slice(0, 8)}...`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Drug: ${job.drug_name}`);
      console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(job.updated_at).toLocaleString()}`);
      console.log(`   Attempts: ${job.attempts}`);
      if (job.error_message) {
        console.log(`   Error: ${job.error_message}`);
      }
      if (job.result) {
        console.log(`   Result length: ${job.result.length} characters`);
        console.log(`   Result preview: ${job.result.substring(0, 100)}...`);
      }
      console.log('   ---');
    });
    
    // Check specific recent job IDs from console logs
    const recentJobIds = [
      '2e030a11-39bd-4e4d-92a2-97ebfd99baed', // Tamsulosin
      'f5a7e8ea-9dbc-44f8-961c-1ddc3bf5b1bf', // Valsartan
      'd0f0b19e-e437-469f-ab40-6e4bfb53b45e'  // Rabeprazole
    ];
    
    console.log('\n🔍 Checking Recent Job IDs from Console:');
    console.log('==========================================');
    
    for (const jobId of recentJobIds) {
      const { data: jobData, error: jobError } = await supabase
        .from('document_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (jobError) {
        console.log(`❌ Job ${jobId.slice(0, 8)}... not found`);
      } else {
        console.log(`✅ Job ${jobId.slice(0, 8)}... (${jobData.drug_name})`);
        console.log(`   Status: ${jobData.status}`);
        console.log(`   Created: ${new Date(jobData.created_at).toLocaleString()}`);
        console.log(`   Updated: ${new Date(jobData.updated_at).toLocaleString()}`);
        if (jobData.result) {
          console.log(`   Has result: ${jobData.result.length} characters`);
          console.log(`   Result preview: ${jobData.result.substring(0, 100)}...`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking jobs:', error);
  }
}

checkJobs(); 