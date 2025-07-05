-- Enable required extension for HTTP calls from cron
create extension if not exists pg_net with schema extensions;

-- Table to queue document generation tasks
create table if not exists public.document_generation_jobs (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.search_sessions(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    drug_name text not null,
    drug_data jsonb,
    status text not null default 'pending', -- pending | processing | completed | failed
    result text,
    error_message text,
    attempts integer not null default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists document_generation_jobs_status_idx on public.document_generation_jobs(status);

-- Row Level Security setup
alter table public.document_generation_jobs enable row level security;

-- Users can see only their own jobs (if they have user_id)
create policy "Users can view their own jobs" on public.document_generation_jobs
for select using ( auth.uid() = user_id OR user_id IS NULL );

-- Only service_role (edge functions) can modify
create policy "Service role can manage jobs" on public.document_generation_jobs
for all using ( auth.role() = 'service_role' ) with check (auth.role() = 'service_role');

-- Schedule the worker edge function every 30 seconds via pg_cron
-- NOTE: replace YOUR_PROJECT_REF with actual ref after deploy
select
    cron.schedule(
        'process-doc-jobs-every-30s',
        '30 seconds',
        $$
        select net.http_post(
            url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-doc-jobs',
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
            body := '{}'::jsonb,
            timeout_milliseconds := 15000);
        $$
    ); 