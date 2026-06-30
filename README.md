# CasaOS Reborn

CasaOS Reborn is a lightweight, modern, and powerful web-based interface for managing Docker containers. Built as a sleek alternative to CasaOS, it allows you to orchestrate your homelab environment with ease, directly from your browser.

## Features 

- **Sleek Dashboard & UI**: A modern, glassmorphism-inspired interface with responsive design and dark/light mode support.
- **Container Management**: View, start, stop, restart, and delete Docker containers effortlessly.
- **Advanced Configuration**: Edit container settings including environment variables, ports, and volumes on the fly.
- **YAML Import**: Quickly create new containers by pasting a `docker-compose` YAML snippet.
- **Integrated Terminal**: Access a fully-functional web terminal (via SSH) directly from the sidebar.
- **Flawless Self-Updater**: A robust, built-in self-updating mechanism that allows the system to pull the latest image and seamlessly recreate its own container without manual intervention or data loss.

## Architecture

- **Frontend**: React, Vite, Lucide-React (Icons), xterm.js (Terminal)
- **Backend**: Node.js, Express, Socket.io (Real-time updates), Dockerode (Docker API integration)

## Quick Start (Docker)

To deploy CasaOS Reborn on your system, you can use the following `docker-compose.yml` or run it directly via the Docker CLI. Ensure you map the Docker socket so the application can manage your containers.

```yaml
services:
  casaos-reborn:
    image: lorenzo0010/casaos-reborn:latest
    container_name: casaos-reborn
    privileged: true
    restart: unless-stopped
    ports:
      - "1111:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/host-root:ro
    environment:
      - PORT=3000
      - JWT_SECRET=supersecretcasaoskey
      - ADMIN_USER=admin
      - ADMIN_PASS=casaos
```

## Security & Authentication

The application is protected by a JWT-based authentication system. By default, you can configure your credentials using the `ADMIN_USER` and `ADMIN_PASS` environment variables in your deployment configuration.

## Development

To run the project locally for development:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Lorenzo0010/myos.git
   cd myos
   ```

2. **Install Frontend Dependencies**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Install Backend Dependencies**:
   ```bash
   cd backend
   npm install
   node server.js
   ```

*Note: The backend requires access to the Docker daemon. If you are developing on Windows/macOS, ensure Docker Desktop is running and the socket is accessible.*

## License

This project is open-source and available for anyone looking to simplify their Docker homelab experience.
