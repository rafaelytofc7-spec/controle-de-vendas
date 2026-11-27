import type { Codigo, Custo, Produto } from "./tipos";
import { lerCodigoBalanca } from "./calc";
import { semAcento } from "./util";

export function promoAtiva(p: Produto, agora = new Date()): boolean {
  if (p.preco_promocional == null) return false;
  if (p.promo_inicia_em && new Date(p.promo_inicia_em) > agora) return false;
  if (p.promo_expira_em && new Date(p.promo_expira_em) < agora) return false;
  return true;
}
export const precoVenda = (p: Produto) => (promoAtiva(p) ? (p.preco_promocional as number) : p.preco);

export function custoBase(p: Produto, c: Custo | undefined): number | null {
  if (!c) return null;
  return p.base_custo === "ultimo" ? c.custo_ultimo ?? c.custo_medio : c.custo_medio ?? c.custo_ultimo;
}

export function ativos(produtos: Record<string, Produto>): Produto[] {
  return Object.values(produtos).filter((p) => !p.excluido && p.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function buscar(lista: Produto[], codigos: Record<string, Codigo>, termo: string): Produto[] {
  const t = semAcento(termo.trim());
  if (!t) return lista;
  const porCodigo = new Set(Object.values(codigos).filter((c) => c.codigo.includes(t)).map((c) => c.produto_id));
  return lista.filter((p) => semAcento(p.nome).includes(t) || porCodigo.has(p.id));
}

export type Achado = { produto: Produto; quantidade?: number; total?: number } | null;
/** Acha produto pelo código; código de balança (2xxxxxx…) usa o prefixo de 7 dígitos + valor. */
export function acharPorCodigo(codigo: string, produtos: Record<string, Produto>, codigos: Record<string, Codigo>, modoBalanca: "preco" | "peso" = "preco"): Achado {
  const c = codigos[codigo.trim()];
  if (c && produtos[c.produto_id] && !produtos[c.produto_id].excluido) return { produto: produtos[c.produto_id] };
  const b = lerCodigoBalanca(codigo.trim());
  if (b) {
    const cb = codigos[b.prefixo];
    const p = cb ? produtos[cb.produto_id] : undefined;
    if (p && !p.excluido) {
      if (modoBalanca === "peso") { const q = b.valor / 1000; return { produto: p, quantidade: q, total: Math.round(q * precoVenda(p) * 100) / 100 }; }
      const total = b.valor / 100; const pv = precoVenda(p);
      return { produto: p, quantidade: pv > 0 ? Math.round((total / pv) * 1000) / 1000 : 1, total };
    }
  }
  return null;
}

const EMOJI: [RegExp, string][] = [
  [/tomate/, "🍅"], [/banana/, "🍌"], [/alface|couve|rucula|agriao|cheiro|salsa|coentro|espinafre|repolho/, "🥬"], [/batata/, "🥔"],
  [/cebola/, "🧅"], [/alho/, "🧄"], [/mamao|manga/, "🥭"], [/laranja|tangerina|mexerica|ponkan/, "🍊"], [/limao/, "🍋"], [/maca/, "🍎"],
  [/pera/, "🍐"], [/uva/, "🍇"], [/morango/, "🍓"], [/melancia/, "🍉"], [/melao/, "🍈"], [/abacaxi/, "🍍"], [/abacate/, "🥑"], [/coco/, "🥥"],
  [/cenoura/, "🥕"], [/milho/, "🌽"], [/pimenta|pimentao/, "🫑"], [/pepino|abobrinha|chuchu|quiabo|jilo|vagem/, "🥒"], [/beterraba|rabanete/, "🫜"],
  [/ovo/, "🥚"], [/leite|iogurte/, "🥛"], [/queijo/, "🧀"], [/pao/, "🍞"], [/refri|suco|agua|pet/, "🥤"], [/kiwi/, "🥝"], [/abobora|moranga/, "🎃"],
  [/mandioca|aipim|inhame|gengibre/, "🍠"], [/pessego|ameixa|nectarina/, "🍑"], [/cereja|acerola/, "🍒"], [/brocolis|couve-flor/, "🥦"], [/cogumelo/, "🍄"],
];
export function emoji(nome: string): string {
  const n = semAcento(nome);
  for (const [r, e] of EMOJI) if (r.test(n)) return e;
  return nome.trim().charAt(0).toUpperCase() || "•";
}
