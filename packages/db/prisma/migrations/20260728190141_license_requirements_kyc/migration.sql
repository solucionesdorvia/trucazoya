-- CreateEnum
CREATE TYPE "KycState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acceptedTermsAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "province" TEXT;

-- CreateTable
CREATE TABLE "KycSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL,
    "docImageUrl" TEXT,
    "state" "KycState" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KycSubmission_userId_idx" ON "KycSubmission"("userId");

-- CreateIndex
CREATE INDEX "KycSubmission_state_idx" ON "KycSubmission"("state");

-- AddForeignKey
ALTER TABLE "KycSubmission" ADD CONSTRAINT "KycSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
