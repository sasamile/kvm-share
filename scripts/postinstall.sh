#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# Solo aplica en macOS.
if [ "$(uname)" != "Darwin" ]; then
  exit 0
fi

ELECTRON_DIR="node_modules/electron"
DIST_DIR="$ELECTRON_DIR/dist"
APP="$DIST_DIR/Electron.app"

if [ ! -d "$ELECTRON_DIR" ]; then
  exit 0
fi

# Dispara la descarga oficial (puebla la caché de ~/Library/Caches/electron
# aunque la extracción interna de "electron/install.js" falle o quede
# incompleta, algo que se ha visto en este entorno).
node "$ELECTRON_DIR/install.js" || true

if [ ! -f "$APP/Contents/Info.plist" ]; then
  echo "[postinstall] Bundle de Electron incompleto, reextrayendo con unzip del sistema..."
  VERSION=$(node -e "console.log(require('./$ELECTRON_DIR/package.json').version)")
  ZIP=$(find "$HOME/Library/Caches/electron" -name "electron-v${VERSION}-darwin-*.zip" -print -quit)
  if [ -z "$ZIP" ]; then
    echo "[postinstall] No se encontró el zip de Electron $VERSION en caché (~/Library/Caches/electron). Aborto." >&2
    exit 1
  fi
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"
  unzip -q "$ZIP" -d "$DIST_DIR"
  printf '%s' "Electron.app/Contents/MacOS/Electron" > "$ELECTRON_DIR/path.txt"
fi

# Firma ad-hoc: el binario sin firmar de la dependencia de desarrollo puede
# coincidir con la heurística de XProtect para malware que clona la
# plantilla genérica de Electron (bundle id "com.github.Electron"). Firmarlo
# ad-hoc (sin cuenta de Apple Developer) evita ese falso positivo.
codesign --force --deep --sign - "$APP"
echo "[postinstall] Electron.app listo y firmado ad-hoc."
