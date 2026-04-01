#!/bin/bash
set -e

echo "🔧 Setting up InfluxDB for DORA Metrics..."

# Start InfluxDB container
echo "📦 Starting InfluxDB container..."
docker-compose up -d influxdb

# Wait for InfluxDB to be ready
echo "⏳ Waiting for InfluxDB to be ready..."
sleep 5

MAX_RETRIES=30
RETRY_COUNT=0

until docker-compose exec -T influxdb influx ping &> /dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  echo "Waiting for InfluxDB to start... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "❌ InfluxDB failed to start within expected time"
  exit 1
fi

echo "✅ InfluxDB is ready!"

# Get the API token
echo "🔑 Retrieving API token..."
INFLUX_TOKEN=$(docker-compose exec -T influxdb influx auth list --json | grep -o '"token":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$INFLUX_TOKEN" ]; then
  echo "❌ Failed to retrieve InfluxDB token"
  exit 1
fi

echo "✅ Token retrieved!"

# Update .env file
echo "📝 Updating .env file with token..."
if grep -q "INFLUXDB_TOKEN=" .env; then
  # Update existing token
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|INFLUXDB_TOKEN=.*|INFLUXDB_TOKEN=$INFLUX_TOKEN|" .env
  else
    sed -i "s|INFLUXDB_TOKEN=.*|INFLUXDB_TOKEN=$INFLUX_TOKEN|" .env
  fi
else
  # Add token if not present
  echo "INFLUXDB_TOKEN=$INFLUX_TOKEN" >> .env
fi

echo ""
echo "✅ InfluxDB setup complete!"
echo ""
echo "📊 Database Information:"
echo "  URL: http://localhost:8086"
echo "  Organization: dora-metrics"
echo "  Bucket: metrics"
echo "  Retention: 90 days"
echo ""
echo "🔐 API Token has been added to .env file"
echo ""
echo "🧪 Test the connection:"
echo "  npm run dev"
echo ""
