import { Capacitor } from "@capacitor/core";
import { getMeta, setMeta } from "./db";
import { textoNotificacaoEncomenda, encomendaAtrasada, statusDeEncomenda } from "./encomendas";
import { PREFS_NOTIFICACAO_PADRAO, type ConfiguracaoLoja, type Encomenda, type MembroLoja, type PrefsNotificacao, type Venda } from "./types";

export const CANAL_ALERTAS = "loja_alertas";
const SOM_WEB = "sounds/alerta.wav";

let audio: HTMLAudioElement | null = null;

export function mesclarPrefs(parcial?: Partial<PrefsNotificacao> | null, base: PrefsNotificacao = PREFS_NOTIFICACAO_PADRAO): PrefsNotificacao {
  return { ...base, ...(parcial ?? {}) };
}

export async function carregarPrefsNotificacao(config?: ConfiguracaoLoja): Promise<PrefsNotificacao> {
  const local = await getMeta<Partial<PrefsNotificacao>>("prefs_notificacao");
  const base = mesclarPrefs(config?.notificacoes_padrao);
  return mesclarPrefs(local, base);
}

export async function salvarPrefsNotificacao(prefs: PrefsNotificacao): Promise<void> {
  await setMeta("prefs_notificacao", prefs);
}

function hashId(texto: string, faixa = 2_000_000_000): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return (Math.abs(h) % faixa) + 1;
}

export async function tocarSomInApp(prefs: PrefsNotificacao): Promise<void> {
  if (!prefs.som) return;
  try {
    if (!audio) {
      audio = new Audio(import.meta.env.BASE_URL + SOM_WEB);
      audio.preload = "auto";
    }
    audio.currentTime = 0;
    await audio.play();
  } catch {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      o.stop(ctx.currentTime + 0.36);
    } catch { /* ignore */ }
  }
}

async function plugin() {
  if (!Capacitor.isNativePlatform()) return null;
  const mod = await import("@capacitor/local-notifications");
  return mod.LocalNotifications;
}

export async function pedirPermissaoNotificacoes(): Promise<boolean> {
  const ln = await plugin();
  if (!ln) return true;
  try {
    let st = await ln.checkPermissions();
    if (st.display !== "granted") st = await ln.requestPermissions();
    try {
      await ln.createChannel({
        id: CANAL_ALERTAS,
        name: "Alertas da loja",
        description: "Avisos de encomendas, equipe e sincronização, com som",
        importance: 5,
        sound: "alerta",
        vibration: true,
        visibility: 1,
      });
    } catch { /* channel may already exist */ }
    return st.display === "granted";
  } catch {
    return false;
  }
}

export async function notificarAgora(opts: {
  prefs: PrefsNotificacao;
  chave: keyof PrefsNotificacao;
  titulo: string;
  corpo: string;
  id?: number;
  extra?: Record<string, string>;
}): Promise<void> {
  if (opts.chave !== "som" && !opts.prefs[opts.chave]) return;
  await tocarSomInApp(opts.prefs);
  const ln = await plugin();
  if (!ln) return;
  const ok = await pedirPermissaoNotificacoes();
  if (!ok) return;
  try {
    await ln.schedule({
      notifications: [{
        id: opts.id ?? hashId(`agora:${opts.titulo}:${opts.corpo}`),
        title: opts.titulo,
        body: opts.corpo,
        channelId: CANAL_ALERTAS,
        sound: opts.prefs.som ? "alerta" : undefined,
        extra: opts.extra,
      }],
    });
  } catch { /* ignore */ }
}

export async function agendarLembretesEncomendas(encomendas: Encomenda[], prefs: PrefsNotificacao): Promise<void> {
  const ln = await plugin();
  const agora = Date.now();
  const ativas = encomendas.filter((e) => !e.excluido && statusDeEncomenda(e) === "pendente" && e.prazo_lembrete);
  const idsAtivos = new Set(ativas.map((e) => hashId(`prazo:${e.id}`)));
  if (ln) {
    try {
      const pend = await ln.getPending();
      const cancelar = (pend.notifications ?? [])
        .filter((n) => typeof n.extra?.tipo === "string" && n.extra.tipo === "prazo" && !idsAtivos.has(n.id))
        .map((n) => n.id);
      if (cancelar.length) await ln.cancel({ notifications: cancelar.map((id) => ({ id })) });
    } catch { /* ignore */ }
  }
  if (!prefs.encomendaAtrasada) return;
  const ok = ln ? await pedirPermissaoNotificacoes() : true;
  for (const e of ativas) {
    const quando = new Date(e.prazo_lembrete!).getTime();
    if (!Number.isFinite(quando)) continue;
    const corpo = textoNotificacaoEncomenda(e, quando <= agora ? "atrasada" : "lembrete");
    if (quando <= agora) {
      const ja = await getMeta<string[]>( "encomendas_atraso_notificado") ?? [];
      if (!ja.includes(e.id)) {
        await notificarAgora({ prefs, chave: "encomendaAtrasada", titulo: "Encomenda atrasada", corpo, id: hashId(`atraso:${e.id}`), extra: { tipo: "atrasada", id: e.id } });
        await setMeta("encomendas_atraso_notificado", [...ja, e.id]);
      }
      continue;
    }
    if (!ln || !ok) continue;
    try {
      await ln.schedule({
        notifications: [{
          id: hashId(`prazo:${e.id}`),
          title: "Lembrete de encomenda",
          body: corpo,
          schedule: { at: new Date(quando), allowWhileIdle: true },
          channelId: CANAL_ALERTAS,
          sound: prefs.som ? "alerta" : undefined,
          extra: { tipo: "prazo", id: e.id },
        }],
      });
    } catch { /* ignore */ }
  }
}

export async function avisarEncomendasNovas(encomendas: Encomenda[], prefs: PrefsNotificacao, meuUid?: string): Promise<void> {
  if (!prefs.encomendaNova) return;
  const vistos = new Set(await getMeta<string[]>("encomendas_vistas") ?? []);
  const novas = encomendas.filter((e) => !e.excluido && !vistos.has(e.id) && statusDeEncomenda(e) === "pendente");
  for (const e of novas) {
    const propria = Boolean(meuUid && e.criadoPor === meuUid);
    if (propria && vistos.size === 0) continue;
    await notificarAgora({
      prefs,
      chave: "encomendaNova",
      titulo: "Nova encomenda",
      corpo: textoNotificacaoEncomenda(e, "nova"),
      id: hashId(`nova:${e.id}`),
      extra: { tipo: "nova", id: e.id },
    });
  }
  await setMeta("encomendas_vistas", encomendas.filter((e) => !e.excluido).map((e) => e.id));
}

export async function avisarNovosMembros(membros: MembroLoja[], prefs: PrefsNotificacao, souLider: boolean, meuUid?: string): Promise<void> {
  if (!souLider || !prefs.novoMembro) return;
  const vistos = new Set(await getMeta<string[]>("membros_vistos") ?? []);
  const novos = membros.filter((m) => m.uid !== meuUid && !vistos.has(m.uid));
  if (vistos.size > 0) {
    for (const m of novos) {
      await notificarAgora({
        prefs,
        chave: "novoMembro",
        titulo: "Alguém entrou na loja",
        corpo: `${m.nome || "Um aparelho"} entrou com o PIN.`,
        id: hashId(`membro:${m.uid}`),
      });
    }
  }
  await setMeta("membros_vistos", membros.map((m) => m.uid));
}

export async function avisarAlteracoesOutros(
  vendas: Venda[],
  encomendas: Encomenda[],
  prefs: PrefsNotificacao,
  meuUid?: string,
  desdeIso?: string,
): Promise<void> {
  if (!prefs.alteracaoOutro || !meuUid || !desdeIso) return;
  const desde = new Date(desdeIso).getTime();
  const vendasNovas = vendas.filter((v) => !v.excluido && v.criadoPor && v.criadoPor !== meuUid && v.criadoPor !== "importado" && v.criadoPor !== "local" && new Date(v.atualizado_em).getTime() > desde);
  const encNovas = encomendas.filter((e) => !e.excluido && e.atualizadoPor && e.atualizadoPor !== meuUid && e.atualizadoPor !== "importado" && new Date(e.atualizado_em).getTime() > desde);
  if (vendasNovas.length === 0 && encNovas.length === 0) return;
  const partes = [];
  if (vendasNovas.length) partes.push(`${vendasNovas.length} venda${vendasNovas.length > 1 ? "s" : ""}`);
  if (encNovas.length) partes.push(`${encNovas.length} encomenda${encNovas.length > 1 ? "s" : ""}`);
  await notificarAgora({
    prefs,
    chave: "alteracaoOutro",
    titulo: "Movimentação na loja",
    corpo: `Outra pessoa registrou ${partes.join(" e ")}.`,
    id: hashId(`outros:${desdeIso}`),
  });
}

export async function avisarErroSync(mensagem: string, prefs: PrefsNotificacao): Promise<void> {
  await notificarAgora({ prefs, chave: "erroSync", titulo: "Falha na sincronização", corpo: mensagem });
}

export async function avisarBackupSePreciso(prefs: PrefsNotificacao, temDados: boolean): Promise<void> {
  if (!prefs.lembreteBackup || !temDados) return;
  const ultimo = await getMeta<string>("ultimo_backup");
  const seteDias = 7 * 24 * 60 * 60 * 1000;
  if (ultimo && Date.now() - new Date(ultimo).getTime() < seteDias) return;
  const ultimaNota = await getMeta<string>("lembrete_backup_em");
  if (ultimaNota && Date.now() - new Date(ultimaNota).getTime() < 24 * 60 * 60 * 1000) return;
  await notificarAgora({
    prefs,
    chave: "lembreteBackup",
    titulo: "Lembrete de backup",
    corpo: ultimo
      ? "Já faz mais de uma semana desde o último backup em arquivo. Exporte em Ajustes."
      : "Faça um backup em arquivo das vendas (Mais → Ajustes) e guarde num lugar seguro.",
  });
  await setMeta("lembrete_backup_em", new Date().toISOString());
}

export async function marcarBackupFeito(): Promise<void> {
  await setMeta("ultimo_backup", new Date().toISOString());
}
