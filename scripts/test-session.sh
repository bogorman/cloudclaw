#!/bin/bash
# Manual test script for CloudClaw sessions

API_URL="${API_URL:-http://localhost:3000}"
RUNNER_URL="${RUNNER_URL:-http://localhost:8080}"
TOKEN="${TOKEN:-dev-token}"

echo "=== CloudClaw Test Script ==="
echo ""

# Check health
echo "1. Checking dashboard health..."
curl -s "$API_URL/api/health" | jq .
echo ""

echo "2. Checking runner health..."
curl -s -H "X-API-Token: $TOKEN" "$RUNNER_URL/health" | jq .
echo ""

# Create session via dashboard
echo "3. Creating session via dashboard..."
SESSION=$(curl -s -X POST "$API_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"width": 1280, "height": 720, "ttl_seconds": 300}')
echo "$SESSION" | jq .

SESSION_ID=$(echo "$SESSION" | jq -r '.session_id')
VIEW_URL=$(echo "$SESSION" | jq -r '.view_url')

if [ "$SESSION_ID" = "null" ]; then
  echo "Failed to create session!"
  exit 1
fi

echo ""
echo "4. Session created!"
echo "   Session ID: $SESSION_ID"
echo "   View URL: $API_URL$VIEW_URL"
echo ""

# Check session status
echo "5. Checking session status on runner..."
curl -s -H "X-API-Token: $TOKEN" "$RUNNER_URL/v1/sessions/$SESSION_ID" | jq .
echo ""

echo "=== Open in browser ==="
echo "Dashboard: $API_URL"
echo "Viewer: $API_URL$VIEW_URL"
echo ""

# Wait for user
read -p "Press Enter to stop session (or Ctrl+C to keep it running)..."

echo "6. Stopping session..."
curl -s -X POST "$API_URL/api/sessions/$SESSION_ID/stop" | jq .
echo ""
echo "Done!"
