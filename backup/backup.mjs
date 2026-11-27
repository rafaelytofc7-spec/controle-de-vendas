// Backup da v3 no repositório PRIVADO controle-de-vendas-dados.
// Roda de hora em hora no GitHub Actions (ou na mão: node v3/backup.mjs).
// Só LÊ o Supabase (função v3_backup_exportar, protegida por chave). Não precisa de dependências.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));            // pasta v3/ do repositório
const URL_SB = process.env.SUPABASE_URL || "https://zmsertdphnhaontkojqa.supabase.co";
const CHAVE_API = process.env.SUPABASE_PUBLISHABLE_KEY;
const CHAVE_BACKUP = process.env.V3_BACKUP_CHAVE;
const LOJAS = (process.env.LOJAS || "principal ensaio").split(/\s+/).filter(Boolean);
const COMPLETO = process.env.COMPLETO === "1";
if (!CHAVE_API || !CHAVE_BACKUP) { console.error("faltam SUPABASE_PUBLISHABLE_KEY e V3_BACKUP_CHAVE"); process.exit(2); }

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export const diaSP = (iso) => fmtDia.format(new Date(iso));
const lerJson = (f, padrao) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : padrao);
const linhas = (arr) => "[\n" + arr.map((x) => JSON.stringify(x)).join(",\n") + (arr.length ? "\n" : "") + "]\n";
function gravar(f, conteudo) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, conteudo); }

async function exportar(loja, desde) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(`${URL_SB}/rest/v1/rpc/v3_backup_exportar`, {
        method: "POST", headers: { apikey: CHAVE_API, "Content-Type": "application/json" },
        body: JSON.stringify({ p_loja: loja, p_chave: CHAVE_BACKUP, p_desde: desde }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) { if (t >= 4) throw e; await new Promise((ok) => setTimeout(ok, 5000 * t)); }
  }
}

// mescla por chave em arquivos mensais
function mesclarMensal(pasta, novos, chave, dataDe) {
  const porMes = {};
  for (const x of novos) (porMes[diaSP(dataDe(x)).slice(0, 7)] ??= []).push(x);
  for (const [mes, lista] of Object.entries(porMes)) {
    const f = join(pasta, `${mes}.json`);
    const m = new Map(lerJson(f, []).map((x) => [chave(x), x]));
    for (const x of lista) m.set(chave(x), x);
    const out = [...m.values()].sort((a, b) => (dataDe(a) < dataDe(b) ? -1 : dataDe(a) > dataDe(b) ? 1 : chave(a) < chave(b) ? -1 : 1));
    gravar(f, linhas(out));
  }
}
function mesclarArquivo(f, novos, chave) {
  const m = new Map(lerJson(f, []).map((x) => [chave(x), x]));
  for (const x of novos) m.set(chave(x), x);
  gravar(f, linhas([...m.values()].sort((a, b) => (chave(a) < chave(b) ? -1 : 1))));
}

// mesmo cálculo do servidor (v3_manifesto): por dia, ativas e soma; hash de todos os ids (":x" = excluída)
export function manifestoDe(vendas) {
  const dias = {};
  for (const v of vendas) {
    const d = (dias[diaSP(v.criado_em)] ??= { n: 0, soma: 0, ids: [] });
    if (!v.excluido) { d.n++; d.soma += Math.round(Number(v.total) * 100); }
    d.ids.push(v.id + (v.excluido ? ":x" : ""));
  }
  const out = {};
  for (const [dia, d] of Object.entries(dias)) {
    d.ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    out[dia] = { n: d.n, soma: d.soma / 100, hash: createHash("sha256").update(d.ids.join(","), "utf8").digest("hex") };
  }
  return out;
}
export function compararManifestos(a, b) {
  const dif = [];
  for (const dia of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[dia], y = b[dia];
    if (!x || !y || x.n !== y.n || Math.round(x.soma * 100) !== Math.round(Number(y.soma) * 100) || x.hash !== y.hash) dif.push(dia);
  }
  return dif.sort();
}
export function lerVendasBackup(pastaLoja) {
  const p = join(pastaLoja, "vendas");
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((f) => f.endsWith(".json")).flatMap((f) => lerJson(join(p, f), []));
}

async function backupLoja(loja) {
  const pasta = join(RAIZ, loja);
  const estado = lerJson(join(pasta, "estado.json"), {});
  let desde = !COMPLETO && estado.cursor ? new Date(Date.parse(estado.cursor) - 2 * 3600_000).toISOString() : null;
  for (let rodada = 0; rodada < 2; rodada++) {
    const r = await exportar(loja, desde);
    mesclarMensal(join(pasta, "vendas"), r.vendas, (x) => x.id, (x) => x.criado_em);
    mesclarMensal(join(pasta, "entradas"), r.entradas, (x) => x.id, (x) => x.criado_em);
    mesclarMensal(join(pasta, "estoque"), r.estoque_mov, (x) => x.id, (x) => x.criado_em);
    mesclarArquivo(join(pasta, "precos_diarios.json"), r.precos_diarios, (x) => `${x.dia}|${x.produto_id}|${x.fornecedor_id ?? ""}`);
    mesclarArquivo(join(pasta, "relatorios.json"), r.relatorios, (x) => x.dia);
    gravar(join(pasta, "cadastro.json"), JSON.stringify(r.cadastro, null, 1) + "\n");
    const local = manifestoDe(lerVendasBackup(pasta));
    const dif = compararManifestos(local, r.manifesto);
    if (dif.length && desde) { console.log(`${loja}: ${dif.length} dia(s) diferentes no incremental, refazendo completo`); desde = null; continue; }
    const vendas = Object.values(local).reduce((s, d) => s + d.n, 0);
    const soma = Object.values(local).reduce((s, d) => s + Math.round(d.soma * 100), 0) / 100;
    gravar(join(pasta, "manifesto.json"), JSON.stringify(local, null, 1) + "\n");
    gravar(join(pasta, "app_antigo_por_dia.json"), JSON.stringify({ app_antigo: r.app_antigo_por_dia, v3_legado: r.v3_legado_por_dia }, null, 1) + "\n");
    const novo = { cursor: r.gerado_em, ultimo_backup: r.gerado_em, completo: !desde, vendas_ativas: vendas, soma, dias: Object.keys(local).length, ok: dif.length === 0, dias_diferentes: dif };
    gravar(join(pasta, "estado.json"), JSON.stringify(novo, null, 1) + "\n");
    console.log(`${loja}: ${r.vendas.length} venda(s) novas/alteradas; total ${vendas} vendas, R$ ${soma.toFixed(2)}; conferido com o servidor: ${dif.length ? "DIFERENTE em " + dif.join(", ") : "OK"}`);
    return dif.length === 0;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = true;
  for (const loja of LOJAS) ok = (await backupLoja(loja)) && ok;
  process.exit(ok ? 0 : 1);
}
