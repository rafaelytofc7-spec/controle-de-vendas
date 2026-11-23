import type { Produto } from "./types";
import { precoAtual } from "./preco";

export function normalizarCodigoBarras(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export function produtoVendidoPorPeso(unidade: string | null | undefined): boolean {
  if (!unidade) return false;
  const u = unidade.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return u === "kg" || u === "kilo" || u === "kilos" || u === "quilo" || u === "quilos" || u === "quilograma" || u === "quilogramas" || u.startsWith("kg ") || /^(kg|quilo)s?$/.test(u);
}

export function codigosDeProduto(p: Pick<Produto, "codigos_barras">): string[] {
  return (p.codigos_barras ?? []).map(normalizarCodigoBarras).filter(Boolean);
}

export function encontrarProdutoPorCodigo(produtos: Produto[], codigoBruto: string): Produto | undefined {
  const codigo = normalizarCodigoBarras(codigoBruto);
  if (!codigo) return undefined;
  return produtos.find((p) => !p.excluido && codigosDeProduto(p).includes(codigo));
}

export function codigoBarrasEmUso(produtos: Produto[], codigoBruto: string, ignorarId?: string): Produto | undefined {
  const codigo = normalizarCodigoBarras(codigoBruto);
  if (!codigo) return undefined;
  return produtos.find((p) => !p.excluido && p.id !== ignorarId && codigosDeProduto(p).includes(codigo));
}

export function podeAdicionarCodigo(produtos: Produto[], produto: Pick<Produto, "id" | "unidade" | "codigos_barras">, codigoBruto: string):
  { ok: true; codigo: string } | { ok: false; motivo: "vazio" | "por_kg" | "duplicado_mesmo" | "duplicado_outro"; outro?: Produto } {
  const codigo = normalizarCodigoBarras(codigoBruto);
  if (!codigo) return { ok: false, motivo: "vazio" };
  if (produtoVendidoPorPeso(produto.unidade)) return { ok: false, motivo: "por_kg" };
  if (codigosDeProduto(produto).includes(codigo)) return { ok: false, motivo: "duplicado_mesmo" };
  const outro = codigoBarrasEmUso(produtos, codigo, produto.id);
  if (outro) return { ok: false, motivo: "duplicado_outro", outro };
  return { ok: true, codigo };
}

export type LeituraVenda =
  | { tipo: "ok"; produto: Produto; preco: number; codigo: string }
  | { tipo: "por_kg"; produto: Produto; codigo: string }
  | { tipo: "desconhecido"; codigo: string }
  | { tipo: "invalido" };

export function interpretarLeituraVenda(produtos: Produto[], codigoBruto: string): LeituraVenda {
  const codigo = normalizarCodigoBarras(codigoBruto);
  if (!codigo) return { tipo: "invalido" };
  const produto = encontrarProdutoPorCodigo(produtos, codigo);
  if (!produto) return { tipo: "desconhecido", codigo };
  if (produtoVendidoPorPeso(produto.unidade)) return { tipo: "por_kg", produto, codigo };
  return { tipo: "ok", produto, preco: precoAtual(produto), codigo };
}

export function mensagemCodigoBarras(r: ReturnType<typeof podeAdicionarCodigo>): string {
  if (r.ok) return "";
  if (r.motivo === "vazio") return "Informe um código de barras.";
  if (r.motivo === "por_kg") return "Produtos vendidos por quilo não usam o leitor de código de barras. Use a calculadora.";
  if (r.motivo === "duplicado_mesmo") return "Este código já está neste produto.";
  return `Este código já está cadastrado em “${r.outro?.nome ?? "outro produto"}”.`;
}

export function normalizarListaCodigos(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string" && raw.trim()) return [normalizarCodigoBarras(raw)];
    return [];
  }
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const c = normalizarCodigoBarras(String(item ?? ""));
    if (!c || vistos.has(c)) continue;
    vistos.add(c);
    out.push(c);
  }
  return out;
}
