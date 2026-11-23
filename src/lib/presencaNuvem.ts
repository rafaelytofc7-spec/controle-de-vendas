import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { agoraIso } from "./datas";
import { getFirebase } from "./firebase";
import { LOJA_NUVEM_ID } from "./firebasePadrao";
import { upsertMembro } from "./db";
import type { MembroLoja } from "./types";

export async function atualizarPresenca(uid: string): Promise<string> {
  const agora = agoraIso();
  const { db } = getFirebase();
  await setDoc(doc(db, "lojas", LOJA_NUVEM_ID, "membros", uid), { ultimoAcesso: agora }, { merge: true });
  return agora;
}

export function ouvirMembros(onLista: (membros: MembroLoja[]) => void): () => void {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, "lojas", LOJA_NUVEM_ID, "membros"),
    (snap) => {
      const lista: MembroLoja[] = [];
      snap.forEach((d) => {
        const r = d.data() as Partial<MembroLoja>;
        const uid = String(r.uid || d.id);
        lista.push({
          uid,
          nome: String(r.nome ?? uid),
          papel: r.papel === "lider" ? "lider" : "membro",
          email: r.email,
          bloqueado: Boolean(r.bloqueado),
          ultimoAcesso: r.ultimoAcesso ?? null,
          criado_em: r.criado_em || new Date().toISOString(),
        });
      });
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      onLista(lista);
      void Promise.all(lista.map((m) => upsertMembro(m)));
    },
    () => { /* permissão ainda não liberada, ou rede */ },
  );
}
