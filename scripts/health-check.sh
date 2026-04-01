#!/bin/bash
# health-check.sh - Run after every deployment
# Usage: ./health-check.sh [base_url]
# Default: http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"

echo "=== DORA Metrics Service Health Check ==="
echo "Target: $BASE_URL"
echo ""

# 1. Service responding
echo "1. Checking service health endpoint..."
HEALTH=$(curl -s ${BASE_URL}/health)
STATUS=$(echo $HEALTH | jq -r '.status')
if [ "$STATUS" != "healthy" ]; then
  echo "❌ FAILED: Service health check failed"
  echo "$HEALTH"
  exit 1
fi
echo "✅ PASSED: Service is healthy"

# 2. Dashboard accessible
echo "2. Checking dashboard..."
DASHBOARD=$(curl -s -o /dev/null -w "%{http_code}" ${BASE_URL}/dashboard/)
if [ "$DASHBOARD" != "200" ]; then
  echo "❌ FAILED: Dashboard not accessible (HTTP $DASHBOARD)"
  exit 1
fi
echo "✅ PASSED: Dashboard accessible"

# 3. API responding
echo "3. Checking API endpoint..."
API=$(curl -s -o /dev/null -w "%{http_code}" ${BASE_URL}/api/dashboard)
if [ "$API" != "200" ]; then
  echo "❌ FAILED: API not responding (HTTP $API)"
  exit 1
fi
echo "✅ PASSED: API responding"

# 4. Container running
echo "4. Checking Docker container status..."
CONTAINER=$(docker-compose ps ingestion | grep "Up")
if [ -z "$CONTAINER" ]; then
  echo "❌ FAILED: Container not running"
  exit 1
fi
echo "✅ PASSED: Container running"

# 5. No recent errors in logs
echo "5. Checking logs for errors..."
ERRORS=$(docker-compose logs --tail=100 ingestion | grep -i error | wc -l)
if [ "$ERRORS" -gt 5 ]; then
  echo "⚠️  WARNING: $ERRORS errors found in recent logs"
  docker-compose logs --tail=20 ingestion | grep -i error
else
  echo "✅ PASSED: No significant errors in logs"
fi

# 6. InfluxDB connectivity
echo "6. Checking InfluxDB connectivity..."
INFLUX=$(docker-compose exec -T influxdb influx ping 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "❌ FAILED: InfluxDB not responding"
  exit 1
fi
echo "✅ PASSED: InfluxDB responding"

echo ""
echo "=== Health Check Complete ==="
echo "All critical checks passed ✅"
