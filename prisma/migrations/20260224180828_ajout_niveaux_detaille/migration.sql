-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StudyLevel" ADD VALUE 'LICENCE_1';
ALTER TYPE "StudyLevel" ADD VALUE 'LICENCE_2';
ALTER TYPE "StudyLevel" ADD VALUE 'MASTER_1';
ALTER TYPE "StudyLevel" ADD VALUE 'MASTER_2';
ALTER TYPE "StudyLevel" ADD VALUE 'DOCTORAT_1';
ALTER TYPE "StudyLevel" ADD VALUE 'DOCTORAT_2';
