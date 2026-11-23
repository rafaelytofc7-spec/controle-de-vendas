const CHAVE = "diagnostico_leitor";
const LIMITE = 80;

export type EventoLeitor = {
  em: string;
  nivel: "info" | "erro";
  msg: string;
  detalhe?: string;
};

function ler(): EventoLeitor[] {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function listarLogLeitor(): EventoLeitor[] {
  return ler();
}

export function logLeitor(nivel: "info" | "erro", msg: string, detalhe?: unknown): void {
  const ev: EventoLeitor = {
    em: new Date().toISOString(),
    nivel,
    msg,
    detalhe: detalhe == null ? undefined : (typeof detalhe === "string" ? detalhe : safe(detalhe)),
  };
  const lista = [ev, ...ler()].slice(0, LIMITE);
  try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { /* quota */ }
}

export function limparLogLeitor(): void {
  try { localStorage.removeItem(CHAVE); } catch { /* ignore */ }
}

function safe(v: unknown): string {
  try { return JSON.stringify(v).slice(0, 400); } catch { return String(v); }
}
