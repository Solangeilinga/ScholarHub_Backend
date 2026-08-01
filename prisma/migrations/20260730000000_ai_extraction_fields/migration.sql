-- AlterTable
ALTER TABLE "scholarships" ADD COLUMN     "confidenceScore" DOUBLE PRECISION,
ADD COLUMN     "rawExcerpt" TEXT,
ADD COLUMN     "extractionNotes" TEXT;

-- CreateIndex
CREATE INDEX "scholarships_confidenceScore_idx" ON "scholarships"("confidenceScore");
