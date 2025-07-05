-- Add webhook trigger for automatic job processing
-- This trigger will call GitHub Actions workflow whenever a new job is created

-- Create a function to call GitHub Actions workflow
CREATE OR REPLACE FUNCTION trigger_github_workflow()
RETURNS TRIGGER AS $$
BEGIN
  -- Make HTTP request to GitHub Actions API to trigger workflow
  PERFORM net.http_post(
    url := 'https://api.github.com/repos/inwoo7/lumin-drug-navigator/actions/workflows/supabase-worker.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.github_token', true),
      'Accept', 'application/vnd.github.v3+json',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'ref', 'main'
    ),
    timeout_milliseconds := 5000
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires after INSERT on document_generation_jobs
CREATE OR REPLACE TRIGGER trigger_process_job_on_insert
  AFTER INSERT ON public.document_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_github_workflow();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION trigger_github_workflow() TO service_role; 