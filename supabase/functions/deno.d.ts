// Type declarations for Deno APIs
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  }
  
  export const env: Env;
}

// Add module declarations for Deno imports
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module "https://deno.land/x/xhr@0.1.0/mod.ts" {}

declare module "https://esm.sh/@supabase/supabase-js@2.38.4" {
  export function createClient(url: string, key: string): any;
} 