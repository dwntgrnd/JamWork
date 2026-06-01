#!/usr/bin/env bash
set -e

VERSION="2.2.0"
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
rm -rf "$STAGE_DIR/api/tests"

# Copy root .htaccess
cp .htaccess "$STAGE_DIR/.htaccess"

# Copy LICENSE
cp LICENSE "$STAGE_DIR/LICENSE"

# Create deployment README
cat > "$STAGE_DIR/README.md" << 'DEPLOY_README'
# JamWork

Lightweight task tracking for small teams.

## Fresh install

1. Upload the *contents* of this folder to your web server's document root
   (via SFTP or your host's File Manager) — `index.html` and `api/` should sit
   at the top of the web root.
2. Ensure the `api/` directory is writable (755).
3. Create an empty MySQL database and note the credentials.
4. Visit your site URL — the installation wizard will guide you through setup.
5. Log in with the admin account you created during installation.

## Requirements

- PHP 8.2+
- MySQL 8.0+
- Apache with mod_rewrite enabled

## Updating an existing install

**Do NOT run the installer to update — it is for fresh installs only.**

Updating is a careful file-swap that must preserve your `api/.env` (credentials)
and `api/.installed` (the "already set up" marker). Overwrite files in place;
never delete-then-replace the `api/` folder. Then apply any new database
migrations listed in the release notes by hand.

Full step-by-step update guide, including troubleshooting:

  https://github.com/dwntgrnd/JamWork#updating-an-existing-install

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
