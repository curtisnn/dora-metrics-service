#!/bin/bash
# rollback.sh - Emergency rollback script
# Usage: ./rollback.sh [backup-timestamp]

set -e

if [ -z "$1" ]; then
  echo "Available backups:"
  docker images | grep backup
  echo ""
  echo "Usage: ./rollback.sh <backup-timestamp>"
  echo "Example: ./rollback.sh backup-20260331-140530"
  exit 1
fi

BACKUP_TAG=$1

echo "=== EMERGENCY ROLLBACK ==="
echo "Rolling back to: $BACKUP_TAG"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Stop current service
echo "Step 1/4: Stopping current service..."
docker-compose down

# Restore backup image
echo "Step 2/4: Restoring backup image..."
docker tag dora-ingestion:$BACKUP_TAG dora-ingestion:latest

# Restore environment config
if [ -f ".env.$BACKUP_TAG" ]; then
  echo "Step 3/4: Restoring environment config..."
  cp .env.$BACKUP_TAG .env
else
  echo "Step 3/4: Skipping environment restore (backup not found)"
fi

# Start service
echo "Step 4/4: Starting service..."
docker-compose up -d

# Wait and verify
sleep 10
curl -s http://localhost:3000/health | jq

echo ""
echo "=== Rollback Complete ==="
echo "Service restored to: $BACKUP_TAG"
echo "Verify health: curl http://localhost:3000/health"
