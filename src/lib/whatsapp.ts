import { formatarReais } from "./dinheiro";
import { precoAtual, promoAtiva } from "./preco";
import type { ConfiguracaoLoja, Entrega, Produto } from "./types";

export function linkWhatsapp(telefone: string | null | undefined, texto: string): string {
  const n = (telefone || "").replace(/\D/g, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

export function textoCardapio(produtos: Produto[], cfg: ConfiguracaoLoja, agora = Date.now()): string {
  const nome = cfg.nome_loja || "Cardápio";
  const linhas = [`*${nome}*`, ""];
  if (cfg.mensagem_cardapio) {
    linhas.push(cfg.mensagem_cardapio, "");
  }
  const lista = [...produtos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  for (const p of lista) {
    const unidade = p.unidade ? ` / ${p.unidade}` : "";
    const preco = formatarReais(precoAtual(p, agora));
    if (promoAtiva(p, agora)) {
      linhas.push(`• ${p.nome}${unidade}: ~${formatarReais(p.preco)}~ *${preco}* (promo)`);
    } else {
      linhas.push(`• ${p.nome}${unidade}: ${preco}`);
    }
  }
  if (cfg.taxa_entrega > 0) {
    linhas.push("", `Taxa de entrega: ${formatarReais(cfg.taxa_entrega)}`);
  }
  return linhas.join("\n");
}

export function textoEntrega(e: Entrega, cfg: ConfiguracaoLoja): string {
  const nome = cfg.nome_loja || "Entrega";
  const status = e.status === "a_caminho" ? "a caminho" : e.status;
  return [
    `*${nome} — entrega*`,
    `Cliente: ${e.cliente}`,
    e.endereco ? `Endereço: ${e.endereco}` : "",
    e.telefone ? `Telefone: ${e.telefone}` : "",
    `Valor: ${formatarReais(e.valor)}`,
    `Situação: ${status}`,
  ].filter(Boolean).join("\n");
}
