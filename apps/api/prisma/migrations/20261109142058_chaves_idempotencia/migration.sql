-- CreateTable
CREATE TABLE "chaves_idempotencia" (
    "id" TEXT NOT NULL,
    "chave" UUID NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "hashCorpo" CHAR(64) NOT NULL,
    "statusHttp" INTEGER NOT NULL,
    "resposta" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chaves_idempotencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chaves_idempotencia_criadoEm_idx" ON "chaves_idempotencia"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "chaves_idempotencia_usuarioId_rota_chave_key" ON "chaves_idempotencia"("usuarioId", "rota", "chave");
