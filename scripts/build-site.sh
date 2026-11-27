#!/usr/bin/env bash
# Gera o site do PC (PWA) SEM código de entrada. Uso: scripts/build-site.sh <loja> <pasta>
set -euo pipefail
LOJA="${1:?loja}"; OUT="$(realpath -m "${2:?pasta}")"
S=/home/box/.secrets/controle-vendas
cd "$(dirname "$0")/../app"
env -u VITE_CODIGO_ENTRADA -u VITE_NOME_LOJA_PADRAO -u VITE_E2E VITE_SUPABASE_PUBLISHABLE_KEY="$(cat "$S/supabase-publishable.key")" VITE_LOJA_ID="$LOJA" \
  npx vite build --outDir "$OUT" --emptyOutDir >/dev/null
for c in $(python3 -c "import json;d=json.load(open('$S/v3-codigos.json'));print(' '.join(v for x in d.values() for v in x.values()))"); do
  if grep -rqF "$c" "$OUT"; then echo "ERRO: código secreto no site" >&2; rm -rf "$OUT"; exit 1; fi
done
NOME=$(sed -n 's/^VITE_NOME_LOJA_PADRAO=//p' "$S/loja-padrao.env" | tr -d '"')
if [ -n "$NOME" ] && grep -rqiF "$NOME" "$OUT"; then echo "ERRO: nome da loja no site" >&2; rm -rf "$OUT"; exit 1; fi
if grep -rqF "__cv3" "$OUT"; then echo "ERRO: ganchos de teste no site" >&2; rm -rf "$OUT"; exit 1; fi
echo "site ok em $OUT"
