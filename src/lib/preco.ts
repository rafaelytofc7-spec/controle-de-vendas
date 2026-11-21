import type { Produto } from "./types";

export function promoAtiva(p: Produto, agora = Date.now()): boolean {
  if (typeof p.preco_promocional !== "number" || p.preco_promocional <= 0) return false;
  if (!p.promo_expira_em) return false;
  const expira = new Date(p.promo_expira_em).getTime();
  if (!(expira > agora)) return false;
  if (p.promo_inicia_em) {
    const inicia = new Date(p.promo_inicia_em).getTime();
    if (inicia > agora) return false;
  }
  return true;
}

export function promoAgendada(p: Produto, agora = Date.now()): boolean {
  if (typeof p.preco_promocional !== "number" || p.preco_promocional <= 0) return false;
  if (!p.promo_expira_em) return false;
  if (!(new Date(p.promo_expira_em).getTime() > agora)) return false;
  if (!p.promo_inicia_em) return false;
  return new Date(p.promo_inicia_em).getTime() > agora;
}

export function precoAtual(p: Produto, agora = Date.now()): number {
  return promoAtiva(p, agora) ? (p.preco_promocional as number) : p.preco;
}
