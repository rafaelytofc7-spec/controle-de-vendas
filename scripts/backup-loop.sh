#!/usr/bin/env bash
# Backup de hora em hora rodando no box (provisório, até o GitHub Action ser liberado).
cd "$(dirname "$0")/.."
while true; do
  { echo "== $(date '+%d/%m/%Y %H:%M') (horário de Brasília)"; scripts/backup-agora.sh 2>&1; node scripts/conferir-sync.mjs ensaio 2>&1 | tail -6; } >> logs-backup/backup.log
  sleep 3600
done
