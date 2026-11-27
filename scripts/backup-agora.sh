#!/usr/bin/env bash
# Backup da v3 no repo PRIVADO controle-de-vendas-dados (rodado pela rotina de hora em hora).
# - Idempotente: pode rodar quantas vezes quiser; só grava commit se algum dado mudou.
# - Não interativo: usa o login do gh já salvo no box (nenhuma pergunta, nenhuma senha).
# - Trava (flock): se outra execução estiver rodando, sai sem fazer nada.
# Uso: scripts/backup-agora.sh [completo]      Saída: 0 = ok/nada novo, 1 = conferência diferente, 2+ = erro
set -euo pipefail
export GIT_TERMINAL_PROMPT=0 GH_PROMPT_DISABLED=1
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
S=/home/box/.secrets/controle-vendas
CLONE=/workspace/cv3-dados
REPO=rafaelytofc7-spec/controle-de-vendas-dados
exec 9>/tmp/cv3-backup.lock
if ! flock -n 9; then echo "outro backup em andamento; saindo"; exit 0; fi
for f in supabase-publishable.key v3-backup-chave.txt; do [ -s "$S/$f" ] || { echo "falta $S/$f" >&2; exit 3; }; done
gh auth status >/dev/null 2>&1 || { echo "gh sem login no box" >&2; exit 4; }
if [ ! -d "$CLONE/.git" ]; then rm -rf "$CLONE"; gh repo clone "$REPO" "$CLONE" -- -q --depth 1; fi
cd "$CLONE"
git config credential.helper '!gh auth git-credential'
# deixa o clone limpo e igual ao remoto (sobras de uma execução interrompida não atrapalham)
git rebase --abort >/dev/null 2>&1 || true
git fetch -q origin main && git reset -q --hard origin/main && git clean -qfd v3 || true
mkdir -p v3 && cp "$AQUI/backup/backup.mjs" v3/backup.mjs
set +e
SUPABASE_PUBLISHABLE_KEY="$(cat $S/supabase-publishable.key)" V3_BACKUP_CHAVE="$(cat $S/v3-backup-chave.txt)" \
  LOJAS="principal ensaio" COMPLETO="$([ "${1:-}" = completo ] && echo 1 || echo 0)" node v3/backup.mjs
RC=$?
set -e
[ $RC -le 1 ] || { echo "backup falhou (código $RC)" >&2; exit $RC; }
git add v3
if git diff --cached --name-only | grep -qv '/estado.json$'; then
  git -c user.name="rafaelytofc7-spec" -c user.email="rafaelytofc7-spec@users.noreply.github.com" \
    commit -q -m "backup v3 $(TZ=America/Sao_Paulo date '+%d/%m/%Y %H:%M')"
  ok=0; for i in 1 2 3; do if git pull -q --rebase origin main && git push -q origin HEAD:main; then ok=1; break; fi; sleep 5; done
  [ $ok = 1 ] || { echo "não consegui enviar ao GitHub" >&2; exit 5; }
  echo "backup gravado no GitHub: $(git log --oneline -1)"
else
  git reset -q --hard origin/main; echo "nada novo (backup já em dia)"
fi
exit $RC
