// Conferência no box: servidor (v3) × backup no GitHub (repo privado) × app antigo.
// Uso: node scripts/conferir-sync.mjs [loja]   (padrão: ensaio; depois da virada: principal)
// Só lê. Sai com código 1 se achar diferença.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LOJA = process.argv[2] || "ensaio";
const S = "/home/box/.secrets/controle-vendas";
const CLONE = "/workspace/cv3-dados";
const REPO = "rafaelytofc7-spec/controle-de-vendas-dados";
process.env.SUPABASE_PUBLISHABLE_KEY ??= readFileSync(join(S, "supabase-publishable.key"), "utf8").trim();
process.env.V3_BACKUP_CHAVE ??= readFileSync(join(S, "v3-backup-chave.txt"), "utf8").trim();

if (!existsSync(CLONE)) execSync(`gh repo clone ${REPO} ${CLONE} -- -q --depth 1`, { stdio: "inherit" });
else execSync(`git -C ${CLONE} pull -q --ff-only`, { stdio: "inherit" });
const { manifestoDe, compararManifestos, lerVendasBackup, diaSP } = await import(join(CLONE, "v3", "backup.mjs"));

// 1) servidor: só o manifesto (desde = agora → não baixa vendas)
const r = await (await fetch("https://zmsertdphnhaontkojqa.supabase.co/rest/v1/rpc/v3_backup_exportar", {
  method: "POST", headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ p_loja: LOJA, p_chave: process.env.V3_BACKUP_CHAVE, p_desde: new Date().toISOString() }),
})).json();
if (!r.manifesto) { console.error("servidor respondeu:", JSON.stringify(r).slice(0, 200)); process.exit(2); }

// 2) backup no GitHub
const pasta = join(CLONE, "v3", LOJA);
const estado = existsSync(join(pasta, "estado.json")) ? JSON.parse(readFileSync(join(pasta, "estado.json"), "utf8")) : null;
const mBackup = manifestoDe(lerVendasBackup(pasta));
const idadeMin = estado ? Math.round((Date.now() - Date.parse(estado.ultimo_backup)) / 60000) : null;
// vendas que mudaram depois do último backup ainda não estão lá: só conta diferença em dias anteriores ao backup
const diaBackup = estado ? diaSP(estado.ultimo_backup) : "0000";
const difBackup = compararManifestos(mBackup, r.manifesto).filter((d) => d < diaBackup);

// 3) app antigo: última cópia somente-leitura guardada no repo + cópia da rotina (public.vendas)
const snaps = existsSync(join(CLONE, "backups")) ? readdirSync(join(CLONE, "backups")).filter((d) => existsSync(join(CLONE, "backups", d, "lovable-readonly", "vendas.json"))).sort() : [];
let difAntigo = [], snapInfo = "nenhuma cópia somente-leitura do app antigo no repo";
if (snaps.length) {
  const ult = snaps.at(-1);
  const vendas = JSON.parse(readFileSync(join(CLONE, "backups", ult, "lovable-readonly", "vendas.json"), "utf8"));
  const porDia = {};
  for (const v of vendas) { const d = (porDia[diaSP(v.criado_em)] ??= { n: 0, c: 0 }); d.n++; d.c += Math.round(Number(v.valor) * 100); }
  const ultimoDia = Object.keys(porDia).sort().at(-1);               // dia da cópia pode estar incompleto
  for (const [dia, a] of Object.entries(porDia)) {
    if (dia >= ultimoDia) continue;
    const b = r.app_antigo_importado_por_dia[dia], c = r.v3_app_antigo_por_dia[dia];
    const iguais = (x) => x && x.n === a.n && Math.round(Number(x.soma) * 100) === a.c;
    if (!iguais(b) || !iguais(c)) difAntigo.push(`${dia}: app antigo ${a.n} / R$ ${(a.c / 100).toFixed(2)} · rotina (só app antigo) ${b?.n ?? 0} / R$ ${b?.soma ?? 0} · v3 ${c?.n ?? 0} / R$ ${c?.soma ?? 0}`);
  }
  snapInfo = `cópia ${ult} (${vendas.length} vendas, dias completos até ${ultimoDia})`;
}
// rotina × v3 (todos os dias, exceto hoje, que ainda pode estar chegando)
const hoje = diaSP(new Date().toISOString());
const difRotina = Object.keys({ ...r.app_antigo_por_dia, ...r.v3_legado_por_dia }).filter((d) => d < hoje).filter((d) => {
  const a = r.app_antigo_por_dia[d], b = r.v3_legado_por_dia[d];
  return !a || !b || a.n !== b.n || Math.round(Number(a.soma) * 100) !== Math.round(Number(b.soma) * 100);
}).sort();

const tot = (m) => Object.values(m).reduce((s, d) => [s[0] + d.n, s[1] + Math.round(Number(d.soma) * 100)], [0, 0]);
const [ns, cs] = tot(r.manifesto), [nb, cb] = tot(mBackup);
const rel = [
  `# Conferência de sincronização — loja ${LOJA} — ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília)`,
  ``,
  `- Servidor v3: ${ns} vendas ativas, R$ ${(cs / 100).toFixed(2)}, ${Object.keys(r.manifesto).length} dias`,
  `- Backup GitHub: ${nb} vendas ativas, R$ ${(cb / 100).toFixed(2)}; último backup há ${idadeMin ?? "?"} min${idadeMin != null && idadeMin > 130 ? " ⚠️ ATRASADO" : ""}`,
  `- Servidor × backup (dias fechados): ${difBackup.length ? "DIFERENTE em " + difBackup.join(", ") : "OK"}`,
  `- Rotina do app antigo (public.vendas) × v3 (dias fechados): ${difRotina.length ? "DIFERENTE em " + difRotina.join(", ") : "OK"}`,
  `- App antigo (${snapInfo}) × rotina × v3: ${difAntigo.length ? "DIFERENTE:\n  - " + difAntigo.join("\n  - ") : "OK"}`,
].join("\n");
console.log(rel);
mkdirSync("/workspace/controle-vendas-v3/conferencias", { recursive: true });
writeFileSync(`/workspace/controle-vendas-v3/conferencias/conferencia-${LOJA}.md`, rel + "\n");
process.exit(difBackup.length || difRotina.length || difAntigo.length || (idadeMin ?? 999) > 130 ? 1 : 0);
