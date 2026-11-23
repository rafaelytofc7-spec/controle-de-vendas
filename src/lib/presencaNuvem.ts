import { agoraIso } from "./datas";
import { getSupabase } from "./supabase";
import { LOJA_NUVEM_ID } from "./supabasePadrao";
import { upsertMembro } from "./db";
import { membroFromRow } from "./mapeamentoNuvem";
import type { MembroLoja } from "./types";

export async function atualizarPresenca(uid: string): Promise<string> {
  const agora = agoraIso();
  const sb = getSupabase();
  const { error } = await sb
    .from("membros")
    .update({ ultimo_acesso: agora })
    .eq("loja_id", LOJA_NUVEM_ID)
    .eq("uid", uid);
  if (error) throw new Error(error.message);
  return agora;
}

export function ouvirMembros(onLista: (membros: MembroLoja[]) => void): () => void {
  const sb = getSupabase();
  let cancelado = false;

  const carregar = async () => {
    const { data, error } = await sb
      .from("membros")
      .select("*")
      .eq("loja_id", LOJA_NUVEM_ID);
    if (error || cancelado) return;
    const lista = (data ?? []).map((r) => membroFromRow(r as Record<string, unknown>));
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    onLista(lista);
    void Promise.all(lista.map((m) => upsertMembro(m)));
  };

  void carregar();
  const canal = sb
    .channel(`membros:${LOJA_NUVEM_ID}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "membros", filter: `loja_id=eq.${LOJA_NUVEM_ID}` },
      () => { void carregar(); },
    )
    .subscribe();

  return () => {
    cancelado = true;
    void sb.removeChannel(canal);
  };
}
