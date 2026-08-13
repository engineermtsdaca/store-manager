-- 1. Create the rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
    ip_address text PRIMARY KEY,
    requests_count integer DEFAULT 1,
    last_reset timestamptz DEFAULT now()
);

-- 2. Add an RLS policy to completely hide this table from the client side
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies defined means default DENY ALL for anon/authenticated roles.

-- 3. Create the RPC function to check and update the limit
CREATE OR REPLACE FUNCTION check_rate_limit(p_ip text, p_max_requests int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count int;
    v_last_reset timestamptz;
BEGIN
    -- Upsert the IP address record
    INSERT INTO rate_limits (ip_address, requests_count, last_reset)
    VALUES (p_ip, 1, NOW())
    ON CONFLICT (ip_address) DO UPDATE
    SET 
        requests_count = CASE 
            -- If the window has expired, reset count to 1
            WHEN rate_limits.last_reset < NOW() - (p_window_seconds || ' seconds')::interval 
            THEN 1 
            -- Otherwise increment the count
            ELSE rate_limits.requests_count + 1 
        END,
        last_reset = CASE 
            -- If the window has expired, reset the timestamp
            WHEN rate_limits.last_reset < NOW() - (p_window_seconds || ' seconds')::interval 
            THEN NOW() 
            ELSE rate_limits.last_reset 
        END
    RETURNING requests_count, last_reset INTO v_count, v_last_reset;

    -- If they exceeded the limit, return false (block)
    IF v_count > p_max_requests THEN
        RETURN false;
    END IF;

    -- Otherwise return true (allow)
    RETURN true;
END;
$$;
