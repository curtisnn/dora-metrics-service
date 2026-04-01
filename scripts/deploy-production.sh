#!/bin/bash
# deploy-production.sh - Deploy to production environment
# Usage: ./deploy-production.sh
# Required env vars: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY, IMAGE_TAG

set -e

echo "=== DORA Metrics Service - Production Deployment ==="
echo "Image tag: ${IMAGE_TAG:-latest}"
echo "Deploy host: ${DEPLOY_HOST}"
echo ""

# Check required environment variables
if [ -z "$DEPLOY_HOST" ] || [ -z "$DEPLOY_USER" ]; then
  echo "❌ ERROR: Missing required environment variables"
  echo "Required: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY, IMAGE_TAG"
  exit 1
fi

# Set up SSH key
if [ -n "$DEPLOY_KEY" ]; then
  echo "Setting up SSH key..."
  mkdir -p ~/.ssh
  echo "$DEPLOY_KEY" > ~/.ssh/deploy_key
  chmod 600 ~/.ssh/deploy_key
  SSH_CMD="ssh -i ~/.ssh/deploy_key -o StrictHostKeyChecking=no"
else
  SSH_CMD="ssh -o StrictHostKeyChecking=no"
fi

# Production deployment confirmation
echo "⚠️  WARNING: Deploying to PRODUCTION"
echo "This will affect live users."
echo ""
read -p "Continue with production deployment? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Deployment cancelled"
  exit 0
fi

# Create deployment directory
DEPLOY_DIR="/opt/dora-metrics"
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "sudo mkdir -p $DEPLOY_DIR && sudo chown ${DEPLOY_USER}:${DEPLOY_USER} $DEPLOY_DIR"

# Copy docker-compose configuration
echo "Copying deployment files..."
scp ${SSH_CMD:4} docker-compose.yml ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/
scp ${SSH_CMD:4} .env.example ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/.env

# Update image tag in docker-compose
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && sed -i 's|image:.*|image: ${DOCKER_USERNAME}/dora-metrics-service:${IMAGE_TAG}|' docker-compose.yml"

# Pull latest image
echo "Pulling Docker image..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose pull"

# Create backup of current deployment
echo "Creating production backup..."
BACKUP_TAG="prod-backup-$(date +%Y%m%d-%H%M%S)"
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "docker tag dora-ingestion:latest dora-ingestion:$BACKUP_TAG 2>/dev/null || true"
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cp $DEPLOY_DIR/.env $DEPLOY_DIR/.env.$BACKUP_TAG"

# Create database backup
echo "Backing up InfluxDB data..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose exec -T influxdb influx backup /tmp/influx-backup-$(date +%Y%m%d-%H%M%S) || true"

# Enable maintenance mode (if supported)
echo "Enabling maintenance mode..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && touch maintenance.flag"

# Stop current service with graceful shutdown
echo "Stopping current service..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose down --timeout 30"

# Start new version
echo "Starting new service..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose up -d"

# Wait for service to start
echo "Waiting for service to start..."
sleep 20

# Verify deployment with retries
echo "Verifying deployment..."
MAX_RETRIES=5
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://${DEPLOY_HOST}:3000/health || echo "000")
  if [ "$HEALTH_CHECK" == "200" ]; then
    SUCCESS=true
    break
  fi
  echo "Health check failed (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES), retrying..."
  RETRY_COUNT=$((RETRY_COUNT + 1))
  sleep 10
done

# Disable maintenance mode
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && rm -f maintenance.flag"

if [ "$SUCCESS" != "true" ]; then
  echo "❌ FAILED: Health check failed after $MAX_RETRIES attempts"
  echo "Rolling back to previous version..."
  $SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose down && docker tag dora-ingestion:$BACKUP_TAG dora-ingestion:latest && cp .env.$BACKUP_TAG .env && docker-compose up -d"
  echo "Rollback complete. Please investigate the issue."
  exit 1
fi

# Run smoke tests
echo "Running smoke tests..."
DASHBOARD_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://${DEPLOY_HOST}:3000/dashboard/ || echo "000")
API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://${DEPLOY_HOST}:3000/api/dashboard || echo "000")

if [ "$DASHBOARD_CHECK" != "200" ] || [ "$API_CHECK" != "200" ]; then
  echo "⚠️  WARNING: Some endpoints failed smoke tests"
  echo "Dashboard: HTTP $DASHBOARD_CHECK"
  echo "API: HTTP $API_CHECK"
  echo "Manual intervention may be required"
fi

echo ""
echo "=== Production Deployment Complete ==="
echo "✅ Service deployed successfully"
echo "URL: https://dora-metrics.example.com"
echo "Health: http://${DEPLOY_HOST}:3000/health"
echo "Backup: $BACKUP_TAG"
echo ""
echo "Next steps:"
echo "1. Monitor logs: ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd $DEPLOY_DIR && docker-compose logs -f'"
echo "2. Verify metrics collection"
echo "3. Monitor error rates"
