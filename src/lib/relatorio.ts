import { RESUMO_VAZIO, type AgregadosVendas } from "./agregados";
import { hojeChave } from "./datas";
import { arredondar2, somarValores } from "./dinheiro";
import type { ResumoPeriodo } from "./faturamento";

export interface LinhaMes {
  chave: string;
  ano: number;
  mes: number;
  rotulo: string;
  rotuloCurto: string;
  quantidade: number;
  total: number;
  ticketMedio: number;
  melhorDia?: string;
  melhorTotal?: number;
  variacao: number | null;
}

export interface LinhaDia {
  chave: string;
  dia: number;
  quantidade: number;
  total: number;
  ticketMedio: number;
}

export interface LinhaSemana {
  chave: string;
  rotulo: string;
  quantidade: number;
  total: number;
  ticketMedio: number;
}

const MES_LONGO = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const MES_CURTO = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

export function parseChaveMes(ym: string): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

export function formatarMes(ym: string): string {
  const p = parseChaveMes(ym);
  if (!p) return ym;
  const s = MES_LONGO.format(new Date(Date.UTC(p.ano, p.mes - 1, 1)));
  return s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1);
}

export function formatarMesCurto(ym: string): string {
  const p = parseChaveMes(ym);
  if (!p) return ym;
  return MES_CURTO.format(new Date(Date.UTC(p.ano, p.mes - 1, 1))).replace(".", "");
}

export function formatarChaveDia(chave: string): string {
  const [y, m, d] = chave.split("-").map(Number);
  if (!y || !m || !d) return chave;
  return DIA_MES.format(new Date(Date.UTC(y, m - 1, d)));
}

export function mesDeChaveDia(chaveDia: string): string {
  return chaveDia.slice(0, 7);
}

export function mesAtual(hoje = hojeChave()): string {
  return hoje.slice(0, 7);
}

export function avancarMes(ym: string, delta: number): string {
  const p = parseChaveMes(ym);
  if (!p) return ym;
  const d = new Date(Date.UTC(p.ano, p.mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function chavesMesNoIntervalo(de: string, ate: string): string[] {
  if (de > ate) return [];
  const out: string[] = [];
  let cursor = de;
  while (cursor <= ate) {
    out.push(cursor);
    cursor = avancarMes(cursor, 1);
    if (out.length > 240) break;
  }
  return out;
}

/** From the first month with sales through the later of today or the last month with sales. */
export function intervaloRelatorio(porMes: Map<string, ResumoPeriodo>, hoje = hojeChave()): { de: string; ate: string } {
  const chaves = [...porMes.keys()].filter((k) => parseChaveMes(k)).sort();
  const atual = mesAtual(hoje);
  if (chaves.length === 0) return { de: atual, ate: atual };
  const ultimo = chaves[chaves.length - 1];
  return { de: chaves[0], ate: ultimo > atual ? ultimo : atual };
}

export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return arredondar2(((atual - anterior) / anterior) * 100);
}

export function formatarVariacao(v: number | null): string {
  if (v === null) return "—";
  const n = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: v % 1 === 0 ? 0 : 1 });
  if (v > 0) return `+${n}%`;
  if (v < 0) return `-${n}%`;
  return "0%";
}

export function melhorDiaDoMes(
  porDia: Map<string, ResumoPeriodo>,
  ym: string,
): { chave: string; total: number; quantidade: number } | undefined {
  let melhor: { chave: string; total: number; quantidade: number } | undefined;
  for (const [chave, r] of porDia) {
    if (!chave.startsWith(ym) || r.total <= 0) continue;
    if (!melhor || r.total > melhor.total) melhor = { chave, total: r.total, quantidade: r.quantidade };
  }
  return melhor;
}

export function montarLinhasMes(
  agregados: AgregadosVendas,
  de: string,
  ate: string,
): LinhaMes[] {
  const chaves = chavesMesNoIntervalo(de, ate);
  const linhas: LinhaMes[] = [];
  for (const chave of chaves) {
    const p = parseChaveMes(chave);
    if (!p) continue;
    const r = agregados.porMes.get(chave) ?? RESUMO_VAZIO;
    const anterior = linhas.length > 0 ? linhas[linhas.length - 1].total : (agregados.porMes.get(avancarMes(chave, -1))?.total ?? 0);
    const melhor = melhorDiaDoMes(agregados.porDia, chave);
    linhas.push({
      chave,
      ano: p.ano,
      mes: p.mes,
      rotulo: formatarMes(chave),
      rotuloCurto: formatarMesCurto(chave),
      quantidade: r.quantidade,
      total: r.total,
      ticketMedio: r.ticketMedio,
      melhorDia: melhor?.chave,
      melhorTotal: melhor?.total,
      variacao: linhas.length > 0 || anterior > 0 ? variacaoPercentual(r.total, anterior) : null,
    });
  }
  return linhas;
}

export function totalDoPeriodo(linhas: Array<{ quantidade: number; total: number }>): ResumoPeriodo {
  const quantidade = linhas.reduce((a, l) => a + l.quantidade, 0);
  const total = somarValores(linhas.map((l) => l.total));
  return {
    quantidade,
    total,
    ticketMedio: quantidade === 0 ? 0 : arredondar2(total / quantidade),
  };
}

export function anosDoRelatorio(linhas: LinhaMes[], hoje = hojeChave()): number[] {
  const set = new Set<number>(linhas.map((l) => l.ano));
  set.add(Number(hoje.slice(0, 4)));
  return [...set].sort((a, b) => a - b);
}

export function diasDoMesRelatorio(agregados: AgregadosVendas, ym: string): LinhaDia[] {
  const p = parseChaveMes(ym);
  if (!p) return [];
  const ultimo = new Date(Date.UTC(p.ano, p.mes, 0)).getUTCDate();
  const out: LinhaDia[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const chave = `${ym}-${String(d).padStart(2, "0")}`;
    const r = agregados.porDia.get(chave) ?? RESUMO_VAZIO;
    out.push({ chave, dia: d, quantidade: r.quantidade, total: r.total, ticketMedio: r.ticketMedio });
  }
  return out;
}

export function semanasDoMesRelatorio(agregados: AgregadosVendas, ym: string): LinhaSemana[] {
  const dias = diasDoMesRelatorio(agregados, ym);
  if (dias.length === 0) return [];
  const vistas = new Set<string>();
  const out: LinhaSemana[] = [];
  for (const dia of dias) {
    const utc = Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, dia.dia);
    const wd = new Date(utc).getUTCDay(); // 0 Sun
    const offset = wd === 0 ? -6 : 1 - wd;
    const monday = new Date(utc + offset * 86400000);
    const chave = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    const r = agregados.porSemana.get(chave) ?? RESUMO_VAZIO;
    out.push({
      chave,
      rotulo: `Semana de ${DIA_MES.format(monday)}`,
      quantidade: r.quantidade,
      total: r.total,
      ticketMedio: r.ticketMedio,
    });
  }
  return out;
}

export const ESPERADO_TOTAIS_MENSAIS_ATUAL = [
  { chave: "2026-08", quantidade: 625, total: 13132.97 },
  { chave: "2026-09", quantidade: 2459, total: 56617.12 },
  { chave: "2026-10", quantidade: 2217, total: 51575.46 },
  { chave: "2026-11", quantidade: 1616, total: 43193.31 },
] as const;
