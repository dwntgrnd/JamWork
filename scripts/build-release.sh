#!/usr/bin/env bash
set -e

VERSION="2.5.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Verify we're in the right place
if [ ! -d "$ROOT_DIR/client" ] || [ ! -d "$ROOT_DIR/api" ]; then
  echo "Error: Must be run from the repo root or scripts/ directory."
  echo "Expected client/ and api/ directories in: $ROOT_DIR"
  exit 1
fi

cd "$ROOT_DIR"

# Resolve composer. Override with COMPOSER_BIN=/path/to/composer — useful when it's
# a shell alias rather than on PATH (e.g. a MAMP install), since this script runs
# non-interactively and won't see aliases. (Note: don't use the name COMPOSER — that
# is composer's own env var for the manifest filename.)
COMPOSER_BIN="${COMPOSER_BIN:-composer}"
if ! command -v "$COMPOSER_BIN" >/dev/null 2>&1; then
  echo "Error: composer not found ('$COMPOSER_BIN')."
  echo "Install composer, or run: COMPOSER_BIN=/path/to/composer scripts/build-release.sh"
  exit 1
fi

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

# Strip dev-only artifacts the wholesale copy picks up
rm -f  "$STAGE_DIR/api/phpunit.xml"
rm -rf "$STAGE_DIR/api/.phpunit.cache"
rm -f  "$STAGE_DIR/api/.gitignore"

# Rebuild vendor with production-only dependencies. The working-tree copy can
# include locally-installed dev deps (phpunit and its tree). This regenerates
# the STAGED vendor from composer.lock minus require-dev; it never touches the
# repo's own api/vendor.
echo "==> Installing production-only dependencies in staging..."
rm -rf "$STAGE_DIR/api/vendor"
( cd "$STAGE_DIR/api" && "$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction --quiet )

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

# --- Release content guard: fail the build if anything that must not ship slipped in ---
echo "==> Verifying staged package..."
violations=()
[ -d "$STAGE_DIR/api/tests" ]           && violations+=("api/tests/")
[ -e "$STAGE_DIR/api/phpunit.xml" ]     && violations+=("api/phpunit.xml")
[ -e "$STAGE_DIR/api/.phpunit.cache" ]  && violations+=("api/.phpunit.cache")
[ -e "$STAGE_DIR/api/.env" ]            && violations+=("api/.env")
[ -e "$STAGE_DIR/api/.env.production" ] && violations+=("api/.env.production")
[ -e "$STAGE_DIR/api/.installed" ]      && violations+=("api/.installed")
[ -d "$STAGE_DIR/api/vendor/phpunit" ]  && violations+=("api/vendor/phpunit/ (dev dep)")
for p in docs scripts .claude CLAUDE.md; do
  [ -e "$STAGE_DIR/$p" ] && violations+=("$p")
done
while IFS= read -r junk; do
  [ -n "$junk" ] && violations+=("$junk")
done < <(find "$STAGE_DIR" \( -name '.DS_Store' -o -name '*.log' \) 2>/dev/null)

if [ ${#violations[@]} -ne 0 ]; then
  echo "ERROR: staged release contains files that must not ship:"
  printf '  - %s\n' "${violations[@]}"
  exit 1
fi
echo "    Clean. Top-level contents:"
ls -A "$STAGE_DIR" | sed 's/^/      /'

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
