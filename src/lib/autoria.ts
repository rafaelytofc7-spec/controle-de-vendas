import type { User } from "firebase/auth";
import type { AcaoAtividade, Atividade, Autoria } from "./types";
import { AUTOR_IMPORTADO, AUTOR_LOCAL } from "./types";
import { agoraIso } from "./datas";
import { gerarId } from "./importacao";

export function autorDaSessao(usuario: User | null): { uid: string; email: string } {
  if (!usuario) return { uid: AUTOR_LOCAL, email: "" };
  const rotulo = (usuario.displayName || usuario.email || "").trim();
  return { uid: usuario.uid, email: rotulo };
}

export function autoriaNova(usuario: User | null): Autoria {
  const a = autorDaSessao(usuario);
  return {
    criadoPor: a.uid,
    criadoPorEmail: a.email || undefined,
    atualizadoPor: a.uid,
    atualizadoPorEmail: a.email || undefined,
  };
}

export function autoriaAtualizacao<T extends Autoria>(existente: T, usuario: User | null): T {
  const a = autorDaSessao(usuario);
  return {
    ...existente,
    criadoPor: existente.criadoPor || a.uid,
    criadoPorEmail: existente.criadoPorEmail,
    atualizadoPor: a.uid,
    atualizadoPorEmail: a.email || undefined,
  };
}

export function registroImportado(row: { criadoPor?: string; atualizadoPor?: string }): boolean {
  return row.criadoPor === AUTOR_IMPORTADO || row.atualizadoPor === AUTOR_IMPORTADO || !row.criadoPor;
}

export function podeEnviarRegistro(row: { criadoPor?: string; atualizadoPor?: string }, ehAdmin: boolean): boolean {
  return ehAdmin || !registroImportado(row);
}

export function rotuloAutor(criadoPor?: string, email?: string): string {
  if (email) return email;
  if (!criadoPor || criadoPor === "importado") return "Importado";
  if (criadoPor === "local") return "Neste aparelho";
  return criadoPor.slice(0, 8);
}

export function montarAtividade(
  loja: string,
  usuario: User | null,
  acao: AcaoAtividade,
  colecao: string,
  registroId: string,
  resumo: string,
): Atividade {
  const a = autorDaSessao(usuario);
  return {
    id: gerarId(),
    loja,
    uid: a.uid,
    email: a.email,
    acao,
    colecao,
    registroId,
    resumo,
    em: agoraIso(),
  };
}
