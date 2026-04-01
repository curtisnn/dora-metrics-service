#!/bin/bash
# deploy-staging.sh - Deploy to staging environment
# Usage: ./deploy-staging.sh
# Required env vars: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY, IMAGE_TAG

set -e

echo "=== DORA Metrics Service - Staging Deployment ==="
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

# Create temporary deployment directory
DEPLOY_DIR="/tmp/dora-metrics-staging"
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "mkdir -p $DEPLOY_DIR"

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
echo "Creating backup..."
BACKUP_TAG="backup-$(date +%Y%m%d-%H%M%S)"
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "docker tag dora-ingestion:latest dora-ingestion:$BACKUP_TAG 2>/dev/null || true"

# Stop current service
echo "Stopping current service..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose down || true"

# Start new version
echo "Starting new service..."
$SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose up -d"

# Wait for service to start
echo "Waiting for service to start..."
sleep 15

# Verify deployment
echo "Verifying deployment..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://${DEPLOY_HOST}:3000/health || echo "000")
if [ "$HEALTH_CHECK" != "200" ]; then
  echo "❌ FAILED: Health check failed (HTTP $HEALTH_CHECK)"
  echo "Rolling back..."
  $SSH_CMD ${DEPLOY_USER}@${DEPLOY_HOST} "cd $DEPLOY_DIR && docker-compose down && docker tag dora-ingestion:$BACKUP_TAG dora-ingestion:latest && docker-compose up -d"
  exit 1
fi

echo ""
echo "=== Staging Deployment Complete ==="
echo "✅ Service deployed successfully"
echo "URL: https://staging.dora-metrics.example.com"
echo "Health: http://${DEPLOY_HOST}:3000/health"
echo "Backup: $BACKUP_TAG"
