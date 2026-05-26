-- Initialize database with encryption support
-- This script runs automatically when the PostgreSQL container starts

-- Enable pgcrypto extension for database-level encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable uuid-ossp for UUID generation (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set up connection encryption requirements
-- Force SSL/TLS for all connections in production
-- ALTER SYSTEM SET ssl = on;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'AccountFinanceZone database initialized successfully';
    RAISE NOTICE 'pgcrypto extension enabled for encryption support';
    RAISE NOTICE 'Database ready for tokenized financial data with strong encryption';
END $$;
