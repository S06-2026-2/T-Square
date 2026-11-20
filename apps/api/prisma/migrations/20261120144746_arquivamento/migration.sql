-- AlterTable
ALTER TABLE "gesseiros" ADD COLUMN     "arquivadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "materiais" ADD COLUMN     "arquivadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "obras" ADD COLUMN     "arquivadoEm" TIMESTAMP(3),
ADD COLUMN     "valorRecebido" DECIMAL(12,2) NOT NULL DEFAULT 0;
