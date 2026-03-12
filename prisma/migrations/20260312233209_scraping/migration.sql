-- CreateEnum
CREATE TYPE "ScholarshipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENING_REMINDER';

-- AlterEnum
ALTER TYPE "StudyLevel" ADD VALUE 'LICENCE_3';

-- AlterTable
ALTER TABLE "scholarships" ADD COLUMN     "scrapedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" "ScholarshipStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- CreateIndex
CREATE INDEX "applications_userId_status_idx" ON "applications"("userId", "status");

-- CreateIndex
CREATE INDEX "applications_scholarshipId_status_idx" ON "applications"("scholarshipId", "status");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "saved_scholarships_userId_idx" ON "saved_scholarships"("userId");

-- CreateIndex
CREATE INDEX "saved_scholarships_scholarshipId_idx" ON "saved_scholarships"("scholarshipId");

-- CreateIndex
CREATE INDEX "scholarships_isActive_idx" ON "scholarships"("isActive");

-- CreateIndex
CREATE INDEX "scholarships_isFeatured_idx" ON "scholarships"("isFeatured");

-- CreateIndex
CREATE INDEX "scholarships_createdAt_idx" ON "scholarships"("createdAt");

-- CreateIndex
CREATE INDEX "scholarships_deadline_idx" ON "scholarships"("deadline");

-- CreateIndex
CREATE INDEX "scholarships_status_idx" ON "scholarships"("status");

-- CreateIndex
CREATE INDEX "support_tickets_userId_createdAt_idx" ON "support_tickets"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");
