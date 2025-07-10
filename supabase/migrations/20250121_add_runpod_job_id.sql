-- Add runpod_job_id column to track async RunPod jobs
ALTER TABLE public.document_generation_jobs 
ADD COLUMN IF NOT EXISTS runpod_job_id text;

-- Add index for efficient querying of processing jobs with RunPod IDs
CREATE INDEX IF NOT EXISTS document_generation_jobs_runpod_idx 
ON public.document_generation_jobs(status, runpod_job_id) 
WHERE status = 'processing' AND runpod_job_id IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.document_generation_jobs.runpod_job_id 
IS 'RunPod job ID for async processing tracking'; 