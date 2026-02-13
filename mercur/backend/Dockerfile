FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN yarn build

# Expose port
EXPOSE 9000

# Start with migrations
CMD ["sh", "-c", "npx medusa db:migrate && yarn start"]
