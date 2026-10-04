FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (termasuk Prisma)
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy seluruh source code
COPY . .

# Build Vite frontend
RUN npm run build

# Expose port (default dari push-server.mjs adalah 4173)
EXPOSE 4173

# Jalankan production server
CMD ["npm", "run", "serve"]
