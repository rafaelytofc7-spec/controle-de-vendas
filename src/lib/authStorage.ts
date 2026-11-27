import { openDB, type IDBPDatabase } from "idb";

const DB = "controle-vendas-auth";
const STORE = "kv";

let dbp: Promise<IDBPDatabase> | undefined;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbp;
}

/** Durable session store: IndexedDB first (survives WebView reloads), localStorage as fallback. */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await (await db()).get(STORE, key);
      if (typeof v === "string") return v;
    } catch { /* ignore */ }
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    try { await (await db()).put(STORE, value, key); } catch { /* ignore */ }
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  async removeItem(key: string): Promise<void> {
    try { await (await db()).delete(STORE, key); } catch { /* ignore */ }
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const CHAVE_APARELHO = "aparelho_id";

/** Stable id for this installation; used to rebind the member if the anonymous session is recreated. */
export async function obterIdAparelho(): Promise<string> {
  const atual = await authStorage.getItem(CHAVE_APARELHO);
  if (atual && atual.length >= 8) return atual;
  const id = (globalThis.crypto?.randomUUID?.() ?? `ap-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await authStorage.setItem(CHAVE_APARELHO, id);
  return id;
}
