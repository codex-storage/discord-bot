# Discord Bot

## Prerequisites

- Docker and Docker Compose (for Docker deployment)
- Node.js and npm (for local deployment)

## Installation

### Option 1: Running with Docker (Recommended)

1. Install Docker and Docker Compose on your system
2. Create a `.env` file with your environment variables:
```
DISCORD_BOT_TOKEN=your_discord_bot_token
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
```

3. Build and run the container:
```bash
docker-compose up -d
```

To view logs:
```bash
docker-compose logs -f
```

To stop the bot:
```bash
docker-compose down
```

### Option 2: Running Locally

1. Install Node.js dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with your environment variables
3. Start the bot:
```bash
node index.js
```

## Docker Image Distribution

To share the Docker image:

1. Build the image:
```bash
docker build -t discord-bot .
```

2. Save the image to a file:
```bash
docker save discord-bot > discord-bot.tar
```

3. Share the `discord-bot.tar` file with others. They can load it using:
```bash
docker load < discord-bot.tar
``` 