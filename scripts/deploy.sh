#!/bin/bash
# deploy.sh - Automated deployment script (manual method)
# Usage: ./deploy.sh [environment]

set -e  # Exit on error

ENVIRONMENT=${1:-production}
VERSION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== DORA Metrics Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Version: $VERSION"
echo "Timestamp: $TIMESTAMP"
echo ""

# Pre-deployment backup
echo "Step 1/7: Creating backup..."
docker tag dora-ingestion:latest dora-ingestion:backup-$TIMESTAMP || true
cp .env .env.backup-$TIMESTAMP

# Build new image
echo "Step 2/7: Building Docker image..."
docker build -t dora-ingestion:$VERSION -t dora-ingestion:latest .

# Stop current service
echo "Step 3/7: Stopping current service..."
docker-compose down

# Start new service
echo "Step 4/7: Starting new service..."
docker-compose up -d

# Wait for service to be ready
echo "Step 5/7: Waiting for service to be ready..."
sleep 10

# Health check
echo "Step 6/7: Running health checks..."
for i in {1..5}; do
  if curl -s http://localhost:3000/health | grep -q "healthy"; then
    echo "✅ Health check passed"
    break
  fi
  echo "Attempt $i/5 failed, retrying in 5s..."
  sleep 5
done

# Verify deployment
echo "Step 7/7: Verifying deployment..."
docker-compose ps
docker-compose logs --tail=20 ingestion

echo ""
echo "=== Deployment Complete ==="
echo "Version deployed: $VERSION"
echo "Backup available: dora-ingestion:backup-$TIMESTAMP"
echo ""
echo "Next steps:"
echo "1. Monitor logs: docker-compose logs -f ingestion"
echo "2. Test dashboard: open http://localhost:3000/dashboard/"
echo "3. Send test event: curl -X POST http://localhost:3000/events/deployment ..."
