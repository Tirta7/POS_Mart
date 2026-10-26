FROM node:20

WORKDIR /app

# Copy dependency definitions
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install dependencies (termasuk Prisma)
RUN npm install

# Generate Prisma Client
RUN ./node_modules/.bin/prisma generate

# Copy application source code
COPY . .

# Build Vite frontend
RUN npm run build

# Validasi integritas package.json saat build
RUN node -e "const pkg = JSON.parse(fs.readFileSync('/app/package.json','utf8')); console.log('[DOCKER BUILD OK] Package:', pkg.name, pkg.version);"

# Expose port (default push-server adalah 4173)
EXPOSE 4173

# Jalankan production server langsung tanpa npm CLI wrapper
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --accept-data-loss && node server/push-server.mjs"]
