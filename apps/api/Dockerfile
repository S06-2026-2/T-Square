# Build de producao da API (deploy no Render).
#
# O CONTEXTO DO BUILD E A RAIZ DO REPOSITORIO, nao apps/api: o package-lock.json do monorepo
# mora na raiz (npm workspaces), e `npm ci` exige o lockfile. Para buildar localmente:
#   docker build -f apps/api/Dockerfile -t gesso-api .
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Manifestos primeiro, para aproveitar o cache de camadas. O npm ci valida o lock contra TODOS
# os workspaces, entao o package.json do web tambem entra (so o manifesto, nada dele e instalado).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# O postinstall da API roda `prisma generate`, que precisa do schema.
COPY apps/api/prisma apps/api/prisma
RUN npm ci --workspace apps/api

COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json apps/api/
COPY apps/api/src apps/api/src
RUN npm run build --workspace apps/api

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
# So dependencias de producao. O CMD abaixo roda `prisma migrate deploy` e o postinstall roda
# `prisma generate`, e os dois usam o CLI do `prisma`: ele esta em devDependencies, mas o lock o
# marca `devOptional` (peer opcional do @prisma/client), e por isso `--omit=dev` o instala, na
# versao travada. Se o npm deixar de fazer isso, o postinstall falha aqui, no build, nao no deploy.
RUN npm ci --omit=dev --workspace apps/api

COPY --from=builder /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
