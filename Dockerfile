# ── Stage 1: deps (todas las dependencias para el build) ─────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copiar todos los manifiestos del monorepo para aprovechar la caché de capas
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY apps/api/package.json ./apps/api/
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

# Copiar fuente de la API
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/tsconfig.json ./apps/api/

# Generar cliente Prisma y compilar la API
RUN cd apps/api && npx prisma generate && npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copiar manifiestos para instalar solo dependencias de producción
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY apps/api/package.json ./apps/api/
COPY apps/mobile/package.json ./apps/mobile/

# python3/make/g++ necesarios para compilar bcrypt (nativo); openssl para Prisma schema engine
# Se eliminan tras el build para reducir tamaño de imagen
RUN apk add --no-cache openssl python3 make g++ \
    && npm ci --omit=dev \
    && apk del python3 make g++

# Paquetes compartidos compilados (los symlinks en node_modules ya apuntan a packages/)
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/validators/dist ./packages/validators/dist

# API compilada y schema Prisma (release_command usa prisma migrate deploy)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Copiar cliente Prisma generado en el builder (misma imagen Alpine — binarios compatibles)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

RUN chown -R node:node /app

WORKDIR /app/apps/api
USER node
CMD ["node", "dist/index.js"]
