-- CreateEnum
CREATE TYPE "BlockchainAnchorStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'RETRYABLE_FAILED', 'PERMANENT_FAILED');

-- CreateTable
CREATE TABLE "BlockchainAnchor" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "anchorKey" TEXT NOT NULL,
    "envelopeHash" TEXT NOT NULL,
    "artifactRoot" TEXT NOT NULL,
    "auditBundleRoot" TEXT NOT NULL,
    "identityEvidenceRoot" TEXT,
    "riskEvidenceRoot" TEXT,
    "policyHash" TEXT,
    "evidenceVersion" INTEGER NOT NULL DEFAULT 1,
    "eventType" INTEGER NOT NULL DEFAULT 1,
    "status" "BlockchainAnchorStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "txHash" TEXT,
    "blockNumber" INTEGER,
    "attestationUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "anchoredAt" TIMESTAMP(3),

    CONSTRAINT "BlockchainAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockchainAnchor_anchorKey_key" ON "BlockchainAnchor"("anchorKey");

-- CreateIndex
CREATE INDEX "BlockchainAnchor_status_idx" ON "BlockchainAnchor"("status");

-- CreateIndex
CREATE INDEX "BlockchainAnchor_envelopeId_idx" ON "BlockchainAnchor"("envelopeId");

-- CreateIndex
CREATE INDEX "BlockchainAnchor_artifactRoot_idx" ON "BlockchainAnchor"("artifactRoot");

-- CreateIndex
CREATE INDEX "BlockchainAnchor_envelopeHash_idx" ON "BlockchainAnchor"("envelopeHash");

-- AddForeignKey
ALTER TABLE "BlockchainAnchor" ADD CONSTRAINT "BlockchainAnchor_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
