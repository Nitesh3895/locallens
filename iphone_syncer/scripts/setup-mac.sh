#!/bin/bash
# VaultSync Mac Setup — No kernel extensions required

set -e

echo ""
echo "  VaultSync — macOS Setup"
echo "  ─────────────────────────────"
echo ""
echo "Checking prerequisites..."
echo ""

MISSING=0

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  [MISSING] Node.js"
  echo "    brew install node"
  MISSING=1
else
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "  [WARN] Node.js $NODE_VERSION (v20+ recommended)"
  else
    echo "  [OK] Node.js $NODE_VERSION"
  fi
fi

# Check Python 3
if ! command -v python3 &> /dev/null; then
  echo "  [MISSING] Python 3"
  echo "    brew install python3"
  MISSING=1
else
  echo "  [OK] Python 3 ($(python3 --version))"
fi

# Check pymobiledevice3
if python3 -c "import pymobiledevice3" 2>/dev/null; then
  echo "  [OK] pymobiledevice3"
else
  echo "  [MISSING] pymobiledevice3"
  echo "    pip3 install pymobiledevice3"
  MISSING=1
fi

# Check libimobiledevice (optional but helpful)
if command -v idevice_id &> /dev/null; then
  echo "  [OK] libimobiledevice ($(which idevice_id))"
else
  echo "  [OPTIONAL] libimobiledevice not installed"
  echo "    brew install libimobiledevice  (improves device detection)"
fi

echo ""

if [ "$MISSING" -eq 1 ]; then
  echo "Install missing dependencies:"
  echo ""
  echo "  pip3 install pymobiledevice3"
  echo "  brew install libimobiledevice  # optional"
  echo ""
  echo "No kernel extensions or system modifications needed."
  echo ""
  exit 1
else
  echo "All prerequisites are installed."
  echo ""
  echo "To start VaultSync:"
  echo "  npm install"
  echo "  npm run dev"
  echo ""
fi
