-- Add a monotonically increasing version to revoke previously issued JWTs.
ALTER TABLE "users"
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
