-- CreateEnum
CREATE TYPE "TipoAlertaEstoque" AS ENUM ('REPOSICAO', 'INFORMATIVO');

-- CreateEnum
CREATE TYPE "StatusAlertaEstoque" AS ENUM ('ATIVO', 'DISPENSADO', 'RESOLVIDO');

-- CreateEnum
CREATE TYPE "ResolvidoPor" AS ENUM ('AGENTE', 'OPERADOR');

-- CreateEnum
CREATE TYPE "OrigemTextoAlerta" AS ENUM ('AGENTE', 'PADRAO');

-- CreateEnum
CREATE TYPE "StatusAnaliseEstoque" AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'PARCIAL', 'FALHA');

-- CreateEnum
CREATE TYPE "OrigemAnaliseEstoque" AS ENUM ('AGENDADA', 'CATCH_UP', 'MANUAL');

-- CreateTable
CREATE TABLE "materiais_previstos_obra" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materiais_previstos_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analises_estoque" (
    "id" TEXT NOT NULL,
    "origem" "OrigemAnaliseEstoque" NOT NULL,
    "status" "StatusAnaliseEstoque" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "totalAlertas" INTEGER NOT NULL DEFAULT 0,
    "chamadasFerramenta" INTEGER NOT NULL DEFAULT 0,
    "modelo" TEXT,
    "erro" TEXT,
    "passos" JSONB NOT NULL DEFAULT '[]',
    "marcadores" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "analises_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_estoque" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "analiseId" TEXT NOT NULL,
    "tipo" "TipoAlertaEstoque" NOT NULL,
    "status" "StatusAlertaEstoque" NOT NULL DEFAULT 'ATIVO',
    "quantidadeSugerida" DECIMAL(12,2),
    "saldoLivre" DECIMAL(12,2) NOT NULL,
    "estoqueMinimo" DECIMAL(12,2) NOT NULL,
    "ritmoDiario" DECIMAL(12,2) NOT NULL,
    "diasAteMinimo" DECIMAL(12,2),
    "justificativa" TEXT NOT NULL,
    "origemTexto" "OrigemTextoAlerta" NOT NULL,
    "resolvidoPor" "ResolvidoPor",
    "dispensadoEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alertas_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "materiais_previstos_obra_obraId_materialId_key" ON "materiais_previstos_obra"("obraId", "materialId");

-- CreateIndex
CREATE INDEX "analises_estoque_iniciadoEm_idx" ON "analises_estoque"("iniciadoEm");

-- CreateIndex
CREATE INDEX "alertas_estoque_materialId_status_idx" ON "alertas_estoque"("materialId", "status");

-- AddForeignKey
ALTER TABLE "materiais_previstos_obra" ADD CONSTRAINT "materiais_previstos_obra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_previstos_obra" ADD CONSTRAINT "materiais_previstos_obra_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_estoque" ADD CONSTRAINT "alertas_estoque_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_estoque" ADD CONSTRAINT "alertas_estoque_analiseId_fkey" FOREIGN KEY ("analiseId") REFERENCES "analises_estoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
