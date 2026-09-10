# Immagine ufficiale Node.js LTS su Alpine (leggera e sicura)
FROM node:20-alpine

# Directory di lavoro all'interno del container
WORKDIR /app

# Variabili d'ambiente per produzione
ENV NODE_ENV=production
ENV PORT=3000

# Copia solo i file delle dipendenze per sfruttare la cache di Docker
COPY package*.json ./

# Installa solo le dipendenze di produzione
RUN npm install --omit=dev --no-audit --no-fund

# Copia tutto il codice dell'applicazione
COPY . .

# Esponi la porta interna dell'app
EXPOSE 3000

# Comando di avvio in produzione con node
CMD ["node", "app.js"]
