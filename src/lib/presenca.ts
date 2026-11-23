import type { Autoria, MembroLoja } from "./types";
import { rotuloAutor } from "./autoria";

export const JANELA_ONLINE_MS = 2 * 60 * 1000;
export const INTERVALO_PRESENCA_MS = 60 * 1000;

export function membroOnline(m: Pick<MembroLoja, "ultimoAcesso"> | undefined, agora = Date.now(), janela = JANELA_ONLINE_MS): boolean {
  if (!m?.ultimoAcesso) return false;
  const t = new Date(m.ultimoAcesso).getTime();
  return Number.isFinite(t) && agora - t <= janela;
}

export function nomeDeRegistro(autor: Pick<Autoria, "criadoPor" | "criadoPorEmail">, membros: MembroLoja[] = []): string {
  if (!autor.criadoPor || autor.criadoPor === "importado") return "Importado";
  if (autor.criadoPor === "local") return "Neste aparelho";
  const m = membros.find((x) => x.uid === autor.criadoPor);
  if (m?.nome) return m.nome;
  return rotuloAutor(autor.criadoPor, autor.criadoPorEmail);
}

export function rotuloPapel(papel?: string, ehAdmin?: boolean): string {
  if (ehAdmin || papel === "lider") return "Admin";
  return "Equipe";
}

export type TotaisPorPessoa = { chave: string; nome: string; quantidade: number; total: number };

export function totaisPorPessoa<T extends Autoria & { valor: number; excluido?: boolean }>(
  itens: T[],
  membros: MembroLoja[] = [],
): TotaisPorPessoa[] {
  const map = new Map<string, TotaisPorPessoa>();
  for (const it of itens) {
    if (it.excluido) continue;
    const nome = nomeDeRegistro(it, membros);
    const chave = it.criadoPor || "importado";
    const atual = map.get(chave) ?? { chave, nome, quantidade: 0, total: 0 };
    atual.quantidade += 1;
    atual.total += it.valor;
    atual.nome = nome;
    map.set(chave, atual);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
