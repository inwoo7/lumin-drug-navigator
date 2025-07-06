-- Auto-trigger GitHub Actions workflow when new jobs are created
-- This trigger will call the GitHub Actions API to immediately process new jobs

-- Create a function to trigger GitHub Actions workflow
create or replace function trigger_github_actions_workflow()
returns trigger as $$
begin
    -- Make HTTP POST request to GitHub Actions API to trigger workflow
    perform net.http_post(
        url := 'https://api.github.com/repos/inwoo7/lumin-drug-navigator/actions/workflows/supabase-worker.yml/dispatches',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Accept', 'application/vnd.github.v3+json',
            'Authorization', 'Bearer ' || current_setting('app.settings.github_token', true),
            'User-Agent', 'Supabase-Auto-Trigger'
        ),
        body := jsonb_build_object('ref', 'main')::jsonb,
        timeout_milliseconds := 10000
    );
    
    return NEW;
end;
$$ language plpgsql security definer;

-- Create trigger that fires after INSERT on document_generation_jobs
drop trigger if exists auto_trigger_workflow on public.document_generation_jobs;
create trigger auto_trigger_workflow
    after insert on public.document_generation_jobs
    for each row
    execute function trigger_github_actions_workflow();

-- Grant necessary permissions
grant execute on function trigger_github_actions_workflow() to service_role; 