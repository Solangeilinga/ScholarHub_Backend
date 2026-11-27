-- Keep scholarship deadlines optional when the source does not publish one.
ALTER TABLE "scholarships"
ALTER COLUMN "deadline" DROP NOT NULL;
