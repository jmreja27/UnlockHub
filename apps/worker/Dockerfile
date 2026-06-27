# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copiar todos los manifiestos del monorepo para aprovechar la caché de capas
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
# Necesario para satisfacer el glob "apps/*" en workspaces
COPY apps/mobile/package.json ./apps/mobile/

RUN npm ci --ignore-scripts

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/package.json ./packages/types/
COPY --from=deps /app/packages/validators/package.json ./packages/validators/
COPY --from=deps /app/apps/api/package.json ./apps/api/

# Copiar código fuente de los paquetes compartidos y tsconfigs
COPY tsconfig.base.json ./
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.build.json ./packages/types/
COPY packages/validators/src ./packages/validators/src
COPY packages/validators/tsconfig.build.json ./packages/validators/

# Compilar paquetes compartidos a CommonJS para Node.js
RUN cd packages/types && npx tsc -p tsconfig.build.json
RUN cd packages/validators && npx tsc -p tsconfig.build.json

# Generar cliente Prisma (binario nativo — debe hacerse en Alpine para ser compatible con el runner)
COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && npx prisma generate

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copiar manifiestos para instalar solo dependencias de producción
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mobile/package.json ./apps/mobile/

# python3/make/g++ para compilar bcrypt (nativo); openssl para Prisma schema engine
# tsx se instala globalmente — está en devDependencies pero es necesario en runtime
RUN apk add --no-cache openssl python3 make g++ \
    && npm ci --omit=dev \
    && npm install -g tsx \
    && apk del python3 make g++

# Paquetes compartidos compilados
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/validators/dist ./packages/validators/dist

# Schema Prisma y cliente generado (binarios Alpine compatibles con el runner)
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Fuentes TypeScript que tsx ejecuta en runtime
# El worker importa directamente desde apps/api/src via rutas relativas
COPY apps/api/src ./apps/api/src
COPY apps/worker/src ./apps/worker/src

# Sin EXPOSE — el worker no levanta HTTP
RUN chown -R node:node /app

USER node
CMD ["npx", "tsx", "apps/worker/src/index.ts"]
