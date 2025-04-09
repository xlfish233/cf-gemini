-- Migration number: 0001 	 2025-04-09T12:34:27.000Z
-- CreateTable
CREATE TABLE ApiKeys (
    api_key TEXT PRIMARY KEY,
    usage INTEGER DEFAULT 0,
    error INTEGER DEFAULT 0,
    weight INTEGER DEFAULT 1
);

-- CreateIndex
CREATE INDEX idx_api_key ON ApiKeys (api_key);
