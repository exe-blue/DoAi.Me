// Vitest global setup
import { vi } from "vitest";

// Set environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.YOUTUBE_API_KEY = "test-youtube-api-key";
