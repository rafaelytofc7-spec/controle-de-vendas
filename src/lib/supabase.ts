import { createClient, type SupabaseClient, type User as SbUser } from "@supabase/supabase-js";
import type { SupabaseWebConfig } from "./types";
import { SUPABASE_CONFIG_PADRAO } from "./supabasePadrao";
import { authStorage } from "./authStorage";

export type NuvemUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

let client: SupabaseClient | null = null;
let lastKey = "";

export function configValida(cfg: SupabaseWebConfig | undefined | null): cfg is SupabaseWebConfig {
  if (!cfg) return false;
  return Boolean(cfg.url && cfg.anonKey && /^https:\/\//.test(cfg.url));
}

export function configEfetiva(salva?: SupabaseWebConfig | null): SupabaseWebConfig {
  return configValida(salva) ? salva : SUPABASE_CONFIG_PADRAO;
}

export function userDe(u: SbUser | null | undefined): NuvemUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as { display_name?: string; full_name?: string };
  return {
    uid: u.id,
    displayName: (meta.display_name || meta.full_name || null) as string | null,
    email: u.email ?? null,
  };
}

export function iniciarSupabase(cfg: SupabaseWebConfig): SupabaseClient {
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (client && lastKey === key) return client;
  client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: authStorage,
      flowType: "implicit",
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  lastKey = key;
  return client;
}

export function supabaseAtivo(): boolean {
  return Boolean(client);
}

export function getSupabase(): SupabaseClient {
  if (!client) throw new Error("A nuvem ainda não foi configurada.");
  return client;
}

export function ouvirAuth(cb: (user: NuvemUser | null) => void): () => void {
  const sb = getSupabase();
  void sb.auth.getSession().then(({ data }) => cb(userDe(data.session?.user ?? null)));
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(userDe(session?.user ?? null));
  });
  return () => data.subscription.unsubscribe();
}

export async function sairAuth(): Promise<void> {
  const sb = getSupabase();
  await sb.auth.signOut();
}

export async function usuarioAtual(): Promise<NuvemUser | null> {
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  return userDe(data.user);
}
