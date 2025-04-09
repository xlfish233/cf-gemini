-- Migration number: 0002 	 2025-04-09T12:49:25.000Z

-- Modify ApiKeys table (SQLite workaround for dropping columns)
-- Step 1: Rename the existing table
ALTER TABLE ApiKeys RENAME TO _ApiKeys_old;

-- Step 2: Create the new table with only the api_key column
CREATE TABLE ApiKeys (
    api_key TEXT PRIMARY KEY
);

-- Step 3: Copy data from the old table to the new table
INSERT INTO ApiKeys (api_key)
SELECT api_key FROM _ApiKeys_old;

-- Step 4: Drop the old table
DROP TABLE _ApiKeys_old;

-- Create ApiKeyUsage table
CREATE TABLE ApiKeyUsage (
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    usage INTEGER DEFAULT 0,
    error INTEGER DEFAULT 0,
    weight INTEGER DEFAULT 1,
    PRIMARY KEY (api_key, model),
    FOREIGN KEY (api_key) REFERENCES ApiKeys(api_key) ON DELETE CASCADE
);

-- Optional: Add index for faster lookups if needed, e.g., by model
-- CREATE INDEX idx_apikeyusage_model ON ApiKeyUsage (model);
