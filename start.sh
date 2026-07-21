#!/bin/bash

echo "Avvio di casaos-reborn..."
docker run -d \
  --name casaos-reborn \
  --privileged \
  --restart always \
  -p 1111:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /home/casaos-reborn-config:/app/backend/data \
  -e PORT=3000 \
  -e JWT_SECRET=supersecretcasaoskey \
  -e ADMIN_USER=admin \
  -e ADMIN_PASS=casaos \
  ghcr.io/lorenzo0010/casaos-reborn:latest

echo "Avvio di casaos-updater..."
docker run -d \
  --name casaos-updater \
  --restart always \
  -p 1112:1112 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/lorenzo0010/casaos-updater:latest

echo "Container avviati con successo!"
