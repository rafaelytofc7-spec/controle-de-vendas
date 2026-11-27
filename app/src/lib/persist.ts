import { openDB, type IDBPDatabase } from "idb";

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) dbp = openDB("controle-vendas-v3", 1, { upgrade(d) { d.createObjectStore("kv"); } });
  return dbp;
}
export async function ler<T>(chave: string): Promise<T | undefined> {
  try { return (await (await db()).get("kv", chave)) as T | undefined; } catch { return undefined; }
}
export async function gravar(chave: string, valor: unknown): Promise<void> {
  try { await (await db()).put("kv", valor, chave); } catch { /* sem espaço / modo privado */ }
}
