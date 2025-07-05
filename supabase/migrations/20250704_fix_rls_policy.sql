-- Fix RLS policy for document_generation_jobs to allow proper access
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.document_generation_jobs;

-- Create a more permissive policy that allows:
-- 1. Users to see their own jobs (when user_id matches)
-- 2. Users to see jobs where user_id is NULL (anonymous jobs)
-- 3. Users to see jobs for sessions they own (via search_sessions)
CREATE POLICY "Users can view accessible jobs" ON public.document_generation_jobs
FOR SELECT USING (
    -- Service role can see everything
    auth.role() = 'service_role' 
    OR 
    -- Users can see their own jobs
    auth.uid() = user_id 
    OR 
    -- Users can see anonymous jobs
    user_id IS NULL
    OR
    -- Users can see jobs for sessions they created
    session_id IN (
        SELECT id FROM public.search_sessions 
        WHERE user_id = auth.uid() OR user_id IS NULL
    )
);

-- Also allow authenticated users to insert jobs (for their own sessions)
CREATE POLICY "Users can create jobs" ON public.document_generation_jobs
FOR INSERT WITH CHECK (
    -- Service role can insert anything
    auth.role() = 'service_role'
    OR
    -- Authenticated users can create jobs for their own sessions
    (auth.uid() IS NOT NULL AND (
        user_id = auth.uid() OR user_id IS NULL
    ))
); 