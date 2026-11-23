import { horarioLocalParaIso, isoParaDiaHora, prazoLembretePadrao, zonedParts } from "./datas";
import type {
  Encomenda,
  EnderecoEncomenda,
  FormaPagamentoEncomenda,
  StatusEncomenda,
  TipoEncomenda,
} from "./types";

export const FORMAS_PAGAMENTO: { id: FormaPagamentoEncomenda; rotulo: string }[] = [
  { id: "dinheiro", rotulo: "Dinheiro" },
  { id: "pix", rotulo: "Pix" },
  { id: "debito", rotulo: "Cartão débito" },
  { id: "credito", rotulo: "Cartão crédito" },
  { id: "fiado", rotulo: "Fiado/outro" },
];

export function rotuloFormaPagamento(forma?: FormaPagamentoEncomenda | null): string {
  return FORMAS_PAGAMENTO.find((f) => f.id === forma)?.rotulo ?? "";
}

export function enderecoVazio(): EnderecoEncomenda {
  return { rua: "", numero: "", bairro: "", referencia: "" };
}

export function enderecoDeTexto(texto: string | null | undefined): EnderecoEncomenda | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  return { rua: t, numero: "", bairro: "", referencia: "" };
}

export function textoEndereco(end: EnderecoEncomenda | null | undefined, legado?: string | null): string {
  if (end) {
    const linha = [end.rua, end.numero && `nº ${end.numero}`, end.bairro].filter(Boolean).join(", ");
    const ref = end.referencia.trim() ? ` (ref.: ${end.referencia.trim()})` : "";
    return `${linha}${ref}`.trim();
  }
  return (legado ?? "").trim();
}

export function enderecoPreenchido(end: EnderecoEncomenda | null | undefined): boolean {
  if (!end) return false;
  return Boolean(end.rua.trim() && end.numero.trim() && end.bairro.trim());
}

export function linkMapa(end: EnderecoEncomenda | null | undefined, legado?: string | null): string | null {
  const q = textoEndereco(end, legado);
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function statusDeEncomenda(e: Pick<Encomenda, "status" | "concluido_em">): StatusEncomenda {
  if (e.status === "pendente" || e.status === "entregue" || e.status === "cancelada") return e.status;
  return e.concluido_em ? "entregue" : "pendente";
}

export function tipoDeEncomenda(e: { tipo?: TipoEncomenda; para_entrega?: boolean }): TipoEncomenda {
  if (e.tipo === "entrega" || e.tipo === "retirada") return e.tipo;
  return e.para_entrega ? "entrega" : "retirada";
}

export function encomendaAtrasada(e: Encomenda, agora = Date.now()): boolean {
  if (e.excluido) return false;
  if (statusDeEncomenda(e) !== "pendente") return false;
  if (!e.prazo_lembrete) return false;
  const t = new Date(e.prazo_lembrete).getTime();
  return Number.isFinite(t) && t <= agora;
}

export function encomendaAPagar(e: Encomenda): boolean {
  return !e.excluido && statusDeEncomenda(e) !== "cancelada" && !e.pago;
}

export function validarEncomenda(input: {
  cliente: string;
  produto: string;
  telefone: string;
  tipo: TipoEncomenda;
  endereco?: EnderecoEncomenda | null;
  data_entrega?: string | null;
}): string | null {
  if (!input.cliente.trim()) return "Informe o nome do cliente.";
  if (!input.produto.trim()) return "Informe o produto.";
  if (!input.telefone.replace(/\D/g, "")) return "Informe o número do cliente (WhatsApp).";
  if (input.tipo === "entrega" && !enderecoPreenchido(input.endereco)) {
    return "Para entrega, preencha rua, número e bairro. O ponto de referência é recomendado.";
  }
  if (!input.data_entrega) return "Informe a data da encomenda.";
  return null;
}

export function montarPrazo(dataEntregaIso: string, horaLembrete: string, horaPadrao = "12:00"): string {
  const dia = zonedParts(dataEntregaIso).chaveDia;
  return horarioLocalParaIso(dia, horaLembrete || horaPadrao || "12:00");
}

export function textoNotificacaoEncomenda(e: Encomenda, tipo: "nova" | "atrasada" | "lembrete"): string {
  const pag = e.pago
    ? `paga${rotuloFormaPagamento(e.forma_pagamento) ? ` (${rotuloFormaPagamento(e.forma_pagamento)})` : ""}`
    : `a pagar${rotuloFormaPagamento(e.forma_pagamento) ? ` (${rotuloFormaPagamento(e.forma_pagamento)})` : ""}`;
  const tipoRotulo = tipoDeEncomenda(e) === "entrega" ? "entrega" : "retirada";
  const end = tipoDeEncomenda(e) === "entrega" ? textoEndereco(e.endereco_detalhe, e.endereco) : "";
  const partes = [
    tipo === "atrasada" ? "Encomenda atrasada" : tipo === "lembrete" ? "Lembrete de encomenda" : "Nova encomenda",
    `${e.cliente} · ${e.produto}`,
    tipoRotulo,
    pag,
    e.telefone ? `tel. ${e.telefone}` : "",
    end,
  ];
  return partes.filter(Boolean).join(" — ");
}

export { isoParaDiaHora, prazoLembretePadrao };
