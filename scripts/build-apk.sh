#!/usr/bin/env bash
# Gera o APK assinado. Uso: scripts/build-apk.sh <loja> <saida.apk>
set -euo pipefail
LOJA="${1:?loja}"; SAIDA="$(realpath -m "${2:?saida}")"
S=/home/box/.secrets/controle-vendas
cd "$(dirname "$0")/../app"
(
  set -a; . "$S/loja-padrao.env"; set +a
  export VITE_SUPABASE_PUBLISHABLE_KEY="$(cat "$S/supabase-publishable.key")" VITE_LOJA_ID="$LOJA"
  export VITE_CODIGO_ENTRADA="$(python3 -c "import json,sys;print(json.load(open('$S/v3-codigos.json'))[sys.argv[1]]['codigo_entrada'])" "$LOJA")"
  CAPACITOR=1 npx tsc --noEmit && env -u VITE_E2E CAPACITOR=1 npx vite build --emptyOutDir >/dev/null
  if grep -rqF "__cv3" dist; then echo "ERRO: ganchos de teste no APK" >&2; exit 1; fi
  npx cap sync android >/dev/null
)
(cd android && ANDROID_HOME=/home/box/android-sdk ./gradlew assembleRelease --no-daemon -q 2>&1 | grep -v -E "^(Warning|Note)" || true)
cp android/app/build/outputs/apk/release/app-release.apk "$SAIDA"
sha256sum "$SAIDA"
