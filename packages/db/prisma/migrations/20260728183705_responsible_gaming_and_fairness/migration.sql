-- CreateEnum
CREATE TYPE "SelfExclusionKind" AS ENUM ('TEMPORARY', 'PERMANENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "birthdate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ResponsibleGamingLimits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyDepositMax" BIGINT,
    "weeklyDepositMax" BIGINT,
    "dailyLossMax" BIGINT,
    "sessionMinutesMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsibleGamingLimits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfExclusion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SelfExclusionKind" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "until" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "SelfExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuffleCommit" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "commit" TEXT NOT NULL,
    "serverSeed" TEXT,
    "deckOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShuffleCommit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResponsibleGamingLimits_userId_key" ON "ResponsibleGamingLimits"("userId");

-- CreateIndex
CREATE INDEX "SelfExclusion_userId_until_idx" ON "SelfExclusion"("userId", "until");

-- CreateIndex
CREATE INDEX "ShuffleCommit_matchId_idx" ON "ShuffleCommit"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "ShuffleCommit_matchId_roundNumber_key" ON "ShuffleCommit"("matchId", "roundNumber");

-- AddForeignKey
ALTER TABLE "ResponsibleGamingLimits" ADD CONSTRAINT "ResponsibleGamingLimits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfExclusion" ADD CONSTRAINT "SelfExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
