#!/usr/bin/env bash
set -e

VERSION="2.1.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Verify we're in the right place
if [ ! -d "$ROOT_DIR/client" ] || [ ! -d "$ROOT_DIR/api" ]; then
  echo "Error: Must be run from the repo root or scripts/ directory."
  echo "Expected client/ and api/ directories in: $ROOT_DIR"
  exit 1
fi

cd "$ROOT_DIR"

echo "==> Building frontend..."
cd client && npm run build && cd ..

echo "==> Assembling release directory..."
RELEASE_DIR="$ROOT_DIR/release"
STAGE_DIR="$RELEASE_DIR/jamwork"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

# Flatten client/dist/ to release root
cp -R client/dist/* "$STAGE_DIR/"

# Copy API (excluding env/installed files)
cp -R api "$STAGE_DIR/api"
rm -f "$STAGE_DIR/api/.env"
rm -f "$STAGE_DIR/api/.env.production"
rm -f "$STAGE_DIR/api/.installed"

# Copy root .htaccess
cp .htaccess "$STAGE_DIR/.htaccess"

# Copy LICENSE
cp LICENSE "$STAGE_DIR/LICENSE"

# Create deployment README
cat > "$STAGE_DIR/README.md" << 'DEPLOY_README'
# JamWork

Lightweight task tracking for small teams.

## Installation

1. Upload all files in this folder to your web server's document root via SFTP
2. Ensure the `api/` directory is writable (755)
3. Create an empty MySQL database and note the credentials
4. Visit your site URL — the installation wizard will guide you through setup
5. Log in with the admin account you created during installation

## Requirements

- PHP 8.2+
- MySQL 8.0+
- Apache with mod_rewrite enabled

## After Installation

- Invite your team: Settings → Team Members
- Create your first project to start tracking work
- Configure email notifications by editing `api/.env` (if skipped during setup)

## Reinstalling

1. Delete `api/.installed` and `api/.env`
2. Visit your site URL — the installer will reappear

## License

MIT — see LICENSE file
DEPLOY_README

# Remove .DS_Store files
find "$STAGE_DIR" -name '.DS_Store' -delete

# Remove any .git directories inside vendor
find "$STAGE_DIR" -name '.git' -type d -exec rm -rf {} + 2>/dev/null || true

echo "==> Creating ZIP..."
mkdir -p "$RELEASE_DIR"
cd "$RELEASE_DIR"
rm -f "jamwork-${VERSION}.zip"
zip -r -q "jamwork-${VERSION}.zip" jamwork/

# Get ZIP size
ZIP_SIZE=$(du -h "jamwork-${VERSION}.zip" | cut -f1)

echo "==> Cleaning up staging directory..."
rm -rf "$STAGE_DIR"

echo ""
echo "Done! Release package created:"
echo "  $RELEASE_DIR/jamwork-${VERSION}.zip ($ZIP_SIZE)"
