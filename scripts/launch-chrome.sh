#!/bin/bash
# Launch Chrome in an existing display session (for testing)

DISPLAY_NUM="${1:-20}"
URL="${2:-https://example.com}"

export DISPLAY=":$DISPLAY_NUM"

echo "Launching Chrome on display $DISPLAY with URL: $URL"

# Try chromium first (Playwright installed), then google-chrome
if command -v chromium &> /dev/null; then
  chromium --no-sandbox --disable-gpu --window-size=1280,720 "$URL" &
elif command -v google-chrome &> /dev/null; then
  google-chrome --no-sandbox --disable-gpu --window-size=1280,720 "$URL" &
else
  echo "No Chrome/Chromium found!"
  exit 1
fi

echo "Chrome launched. PID: $!"
