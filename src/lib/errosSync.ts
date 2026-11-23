export function isPermissionDenied(e: unknown): boolean {
  const code = typeof e === "object" && e && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return code === "permission-denied"
    || code === "42501"
    || code === "PGRST301"
    || code === "PGRST301"
    || code.endsWith("/permission-denied")
    || msg.includes("permission-denied")
    || msg.includes("permission_denied")
    || msg.includes("missing or insufficient")
    || msg.includes("row-level security")
    || msg.includes("42501")
    || msg.includes("not authorized")
    || msg.includes("jwt expired");
}

export function rotuloOperacao(colecao: string, id?: string): string {
  const alvos: Record<string, string> = {
    vendas: "enviar a venda",
    produtos: "enviar o produto",
    entregas: "enviar a entrega",
    encomendas: "enviar a encomenda",
    cobrancas: "enviar a cobrança",
    reabastecimentos: "enviar o reabastecimento",
    atividades: "enviar o registro de atividade",
    configuracao: "enviar a configuração da loja",
    membros: "atualizar a equipe",
    loja: "abrir a loja na nuvem",
    presenca: "atualizar a presença",
    escuta: "ouvir as alterações da loja",
  };
  const base = alvos[colecao] || `enviar ${colecao}`;
  return id ? `${base} (${id.slice(0, 8)})` : base;
}

export function mensagemErroSync(e: unknown, operacao?: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (isPermissionDenied(e)) {
    const alvo = operacao ? ` ${operacao}` : " a alteração";
    return `A nuvem recusou${alvo} (sem permissão). Confira se este aparelho entrou com o nome na loja e não está bloqueado.`;
  }
  const s = raw.toLowerCase();
  if (s.includes("unavailable") || s.includes("failed to fetch") || s.includes("network") || s.includes("offline")) {
    return "Sem conexão com a nuvem no momento. As vendas ficam neste aparelho e sobem quando a internet voltar.";
  }
  if (s.includes("deadline") || s.includes("timeout")) {
    return "A nuvem demorou para responder. Tente de novo em “Sincronizar agora”.";
  }
  return raw || "Falha na sincronização.";
}
