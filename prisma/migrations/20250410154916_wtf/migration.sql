-- CreateTable
CREATE TABLE "ApiKeys" (
    "api_key" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "ApiKeyUsage" (
    "api_key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usage" INTEGER NOT NULL DEFAULT 0,
    "error" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("api_key", "model"),
    CONSTRAINT "ApiKeyUsage_api_key_fkey" FOREIGN KEY ("api_key") REFERENCES "ApiKeys" ("api_key") ON DELETE CASCADE ON UPDATE CASCADE
);
