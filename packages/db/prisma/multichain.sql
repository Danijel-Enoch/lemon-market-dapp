-- Add the chain to every table that names a vault.
--
-- Not a Prisma migration: this repo has no `migrations/` directory, so the
-- schema is applied with `prisma db push`. Push *can* make this change, but it
-- asks about the primary-key swap on `VaultConfig` in a prompt that is easy to
-- answer wrongly at the wrong moment — so the statements are written out here to
-- be read before they are run.
--
-- It is not destructive. Every new column arrives with `DEFAULT 8453`, which is
-- true of every row that exists: they were all written when Base was the only
-- chain. Nothing is dropped but indexes and foreign keys that are immediately
-- recreated against the wider key.
--
-- Generated with, and re-checkable by:
--
--   git show HEAD:packages/db/prisma/schema.prisma > /tmp/old.prisma
--   bunx prisma migrate diff \
--     --from-schema-datamodel /tmp/old.prisma \
--     --to-schema-datamodel packages/db/prisma/schema.prisma --script
--
-- Apply inside a transaction, on a database nothing is writing to: the vault
-- rows are repointed at a new primary key, and an agent tick landing halfway
-- through would write against the old one.

BEGIN;

-- DropForeignKey
ALTER TABLE "VaultMarket" DROP CONSTRAINT "VaultMarket_vaultAddress_fkey";

-- DropForeignKey
ALTER TABLE "AgentRun" DROP CONSTRAINT "AgentRun_vaultAddress_fkey";

-- DropIndex
DROP INDEX "VaultMarket_vaultAddress_enabled_idx";

-- DropIndex
DROP INDEX "VaultMarket_vaultAddress_ticker_key";

-- DropIndex
DROP INDEX "BridgeTransfer_vaultAddress_status_idx";

-- DropIndex
DROP INDEX "AgentRun_vaultAddress_createdAt_idx";

-- DropIndex
DROP INDEX "ActivityVerification_vaultAddress_sequence_idx";

-- AlterTable
ALTER TABLE "VaultConfig" DROP CONSTRAINT "VaultConfig_pkey",
ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 8453,
ADD CONSTRAINT "VaultConfig_pkey" PRIMARY KEY ("chainId", "address");

-- AlterTable
ALTER TABLE "VaultMarket" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 8453;

-- AlterTable
ALTER TABLE "BridgeTransfer" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 8453;

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 8453;

-- AlterTable
ALTER TABLE "ActivityVerification" ADD COLUMN     "chainId" INTEGER NOT NULL DEFAULT 8453;

-- CreateIndex
CREATE INDEX "VaultConfig_chainId_idx" ON "VaultConfig"("chainId");

-- CreateIndex
CREATE INDEX "VaultMarket_chainId_vaultAddress_enabled_idx" ON "VaultMarket"("chainId", "vaultAddress", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "VaultMarket_chainId_vaultAddress_ticker_key" ON "VaultMarket"("chainId", "vaultAddress", "ticker");

-- CreateIndex
CREATE INDEX "BridgeTransfer_chainId_vaultAddress_status_idx" ON "BridgeTransfer"("chainId", "vaultAddress", "status");

-- CreateIndex
CREATE INDEX "AgentRun_chainId_vaultAddress_createdAt_idx" ON "AgentRun"("chainId", "vaultAddress", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityVerification_chainId_vaultAddress_sequence_idx" ON "ActivityVerification"("chainId", "vaultAddress", "sequence");

-- AddForeignKey
ALTER TABLE "VaultMarket" ADD CONSTRAINT "VaultMarket_chainId_vaultAddress_fkey" FOREIGN KEY ("chainId", "vaultAddress") REFERENCES "VaultConfig"("chainId", "address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_chainId_vaultAddress_fkey" FOREIGN KEY ("chainId", "vaultAddress") REFERENCES "VaultConfig"("chainId", "address") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
