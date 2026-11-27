#!/usr/bin/env bash
# Backup da v3 no repo PRIVADO controle-de-vendas-dados, rodando no box (mesmo script do GitHub Action).
# Uso: scripts/backup-agora.sh [completo]
set -euo pipefail
S=/home/box/.secrets/controle-vendas
CLONE=/workspace/cv3-dados
cp "$(dirname "$0")/../backup/backup.mjs" /tmp/cv3-backup.mjs.novo
[ -d "$CLONE" ] || gh repo clone rafaelytofc7-spec/controle-de-vendas-dados "$CLONE" -- -q --depth 1
cd "$CLONE"
git pull -q --rebase
cmp -s /tmp/cv3-backup.mjs.novo v3/backup.mjs || cp /tmp/cv3-backup.mjs.novo v3/backup.mjs
SUPABASE_PUBLISHABLE_KEY="$(cat $S/supabase-publishable.key)" V3_BACKUP_CHAVE="$(cat $S/v3-backup-chave.txt)" \
  LOJAS="principal ensaio" COMPLETO="$([ "${1:-}" = completo ] && echo 1 || echo 0)" node v3/backup.mjs
git add v3
if git diff --cached --name-only | grep -qv '/estado.json$'; then
  git -c user.name="rafaelytofc7-spec" -c user.email="rafaelytofc7-spec@users.noreply.github.com" \
    commit -q -m "backup v3 $(TZ=America/Sao_Paulo date '+%d/%m/%Y %H:%M')"
  for i in 1 2 3; do git pull -q --rebase && git push -q && break; sleep 5; done
  echo "backup gravado no GitHub: $(git log --oneline -1)"
else
  git reset -q; git checkout -q -- v3 2>/dev/null || true; echo "nada novo"
fi
