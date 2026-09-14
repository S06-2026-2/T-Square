---
name: dev-up
description: Sobe o ambiente de desenvolvimento do T-Square (Docker Compose: banco + API + web), evitando os problemas já conhecidos neste projeto — conflito de porta do Postgres com outros containers locais na máquina do dev, e o bug do Prisma que não roda em node:20-alpine sem openssl. Use quando o usuário pedir para subir, rodar ou testar o projeto localmente, quando `docker compose up` falhar, ou quando o container da API entrar em loop de restart.
---

# Subir o ambiente de dev do T-Square

Procedimento para levantar banco + API + web sem recair nos dois problemas já descobertos neste
projeto (documentados em `CLAUDE.md` e `.claude/specs/STATE.md`).

## Passos

1. **Confirmar que o Docker está rodando**: `docker info` (se falhar, pedir para o usuário iniciar
   o Docker Desktop — não dá para abrir apps gráficos por conta própria).

2. **Checar conflito de porta antes de subir**: `docker ps --format "{{.Names}}: {{.Ports}}"` e
   procurar qualquer container já publicando a porta configurada em `POSTGRES_PORT` do `.env` da
   raiz (default do `.env.example` é `5432`). Se estiver ocupada, escolher outra porta livre e
   ajustar `POSTGRES_PORT` no `.env` antes de continuar — **nunca** parar/matar o container de
   outro projeto sem perguntar ao usuário primeiro.

3. **Checar containers com nome conflitante**: `docker ps -a --filter "name=gesso"`. Se existir um
   container parado com um nome que o `docker-compose.yml` deste projeto quer usar (ex: `gesso_db`)
   mas pertencente a outro projeto (`docker inspect <nome> --format '{{.Mounts}}'` mostra um volume
   de outro projeto), confirmar com o usuário antes de `docker rm`.

4. **Confirmar o fix do openssl presente**: `apps/api/Dockerfile.dev` e `apps/api/Dockerfile` devem
   ter `RUN apk add --no-cache openssl` antes do `WORKDIR /app`. Sem essa linha, `node:20-alpine`
   não consegue rodar o schema engine do Prisma, e a API crash-loopa com
   `Error: Could not parse schema engine response`. Se a linha sumiu (ex: repo resetado), adicioná-la
   de volta nos dois Dockerfiles antes de subir.

5. **Subir tudo**: `cp .env.example .env` (se `.env` não existir), depois
   `docker compose up --build` (rodar em background — é um processo de servidor de longa duração).

6. **Aguardar ficar saudável**: poll em `curl -sf http://localhost:3000/api/health` até responder
   200, ou checar `docker ps --filter "name=gesso"` até `gesso_api` sair de `Restarting`.

7. **Primeira vez only** (banco vazio, sem migrations aplicadas):
   ```
   docker compose exec api npx prisma migrate dev --name init
   docker compose exec api npm run db:seed
   ```

8. **Reportar** as URLs (`http://localhost:5173` web, `http://localhost:3000/api` API,
   `http://localhost:3000/docs` Swagger) e o login do seed (`admin@gesso.com` / `admin123`).

## Se algo travar

- API em loop de restart → checar passo 4 (openssl) primeiro; ver `docker logs gesso_api --tail 60`
  para a mensagem de erro real antes de tentar outra coisa.
- `Bind for 0.0.0.0:PORT failed: port is already allocated` → outro container/serviço local está
  usando a porta; voltar ao passo 2.
- **Editou `apps/api/src/**` e a API continua com o comportamento antigo** → o `nest start --watch`
  não recompila de forma confiável quando o repo está numa pasta sincronizada pelo OneDrive (o bind
  mount do Docker não recebe o evento de mudança). Rodar `docker restart gesso_api`, esperar
  `/api/health` responder de novo, e testar antes de assumir que o código está errado.
