const { createClient } = require('@supabase/supabase-js');

async function checkJobs() {
  const supabaseUrl = 'https://oeazqjeopkepqynrqsxj.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Check recent jobs
    const { data, error } = await supabase
      .from('document_generation_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) throw error;
    
    console.log('📋 Recent Document Generation Jobs:');
    console.log('=====================================');
    
    data.forEach((job, index) => {
      console.log(`${index + 1}. Job ID: ${job.id.substring(0, 8)}...`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Drug: ${job.drug_name}`);
      console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(job.updated_at).toLocaleString()}`);
      console.log(`   Attempts: ${job.attempts}`);
      if (job.error_message) {
        console.log(`   Error: ${job.error_message}`);
      }
      if (job.result) {
        console.log(`   Result Length: ${job.result.length} characters`);
      }
      console.log('');
    });
    
    // Count by status
    const statusCounts = data.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 Status Summary:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkJobs(); 