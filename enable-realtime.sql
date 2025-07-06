-- Enable real-time subscriptions for document_generation_jobs table
-- This allows the frontend to receive real-time updates when job status changes

-- Enable real-time for the table
ALTER TABLE document_generation_jobs REPLICA IDENTITY FULL;

-- Enable publication for real-time (only if not already added)
DO $$
BEGIN
    -- Check if the table is already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'document_generation_jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE document_generation_jobs;
        RAISE NOTICE 'Added document_generation_jobs to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'document_generation_jobs is already in supabase_realtime publication';
    END IF;
END $$;

-- Grant necessary permissions for real-time
GRANT SELECT ON document_generation_jobs TO anon;
GRANT SELECT ON document_generation_jobs TO authenticated;

-- Verify the setup
SELECT schemaname, tablename, hasindexes, hasrules, hastriggers 
FROM pg_tables 
WHERE tablename = 'document_generation_jobs';

-- Check if real-time is enabled
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'document_generation_jobs'; 