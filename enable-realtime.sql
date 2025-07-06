-- Enable real-time subscriptions for document_generation_jobs table
-- This allows the frontend to receive real-time updates when job status changes

-- Enable real-time for the table
ALTER TABLE document_generation_jobs REPLICA IDENTITY FULL;

-- Enable publication for real-time
ALTER PUBLICATION supabase_realtime ADD TABLE document_generation_jobs;

-- Verify the setup
SELECT schemaname, tablename, hasindexes, hasrules, hastriggers 
FROM pg_tables 
WHERE tablename = 'document_generation_jobs';

-- Check if real-time is enabled
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'document_generation_jobs'; 