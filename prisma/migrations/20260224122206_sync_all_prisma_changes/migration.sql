/*
  Warnings:

  - The values [ECHANGE] on the enum `ScholarshipType` will be removed. If these variants are still used in the database, this will fail.
  - The values [POSTDOC,PROFESSIONNEL] on the enum `StudyLevel` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ScholarshipType_new" AS ENUM ('COMPLETE', 'PARTIELLE', 'RECHERCHE', 'FORMATION');
ALTER TABLE "scholarships" ALTER COLUMN "type" TYPE "ScholarshipType_new" USING ("type"::text::"ScholarshipType_new");
ALTER TYPE "ScholarshipType" RENAME TO "ScholarshipType_old";
ALTER TYPE "ScholarshipType_new" RENAME TO "ScholarshipType";
DROP TYPE "ScholarshipType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "StudyLevel_new" AS ENUM ('BEPC', 'BACCALAUREAT', 'LICENCE', 'MAITRISE', 'MASTER', 'DOCTORAT');
ALTER TABLE "users" ALTER COLUMN "level" TYPE "StudyLevel_new" USING ("level"::text::"StudyLevel_new");
ALTER TABLE "scholarships" ALTER COLUMN "level" TYPE "StudyLevel_new"[] USING ("level"::text::"StudyLevel_new"[]);
ALTER TYPE "StudyLevel" RENAME TO "StudyLevel_old";
ALTER TYPE "StudyLevel_new" RENAME TO "StudyLevel";
DROP TYPE "StudyLevel_old";
COMMIT;
