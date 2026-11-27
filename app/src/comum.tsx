import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLoja, enviarFila, reconectar, atrasoSeg, reenviarTudo, definirOperador, lerOperadoresRecentes, getEstado } from "./lib/loja";

export function Modal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="modal" role="dialog" aria-label={titulo}>
        <div className="cab"><h2>{titulo}</h2><button className="x" onClick={aoFechar} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

let mostrarToastGlobal: ((t: string, acao?: { rotulo: string; fn: () => void }) => void) | null = null;
export function toast(t: string, acao?: { rotulo: string; fn: () => void }) { mostrarToastGlobal?.(t, acao); }
export function Toaster() {
  const [t, setT] = useState<{ txt: string; acao?: { rotulo: string; fn: () => void } } | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    mostrarToastGlobal = (txt, acao) => {
      setT({ txt, acao }); clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setT(null), acao ? 8000 : 3200);
    };
    return () => { mostrarToastGlobal = null; };
  }, []);
  if (!t) return null;
  return (
    <div className="toast" role="status" data-testid="toast">
      <span>{t.txt}</span>
      {t.acao && <button onClick={() => { t.acao!.fn(); setT(null); }}>{t.acao.rotulo}</button>}
    </div>
  );
}

export function StatusSync() {
  const fila = useLoja((e) => e.fila);
  const online = useLoja((e) => e.online);
  const tempoReal = useLoja((e) => e.tempoReal);
  const enviando = useLoja((e) => e.enviando);
  const pend = fila.filter((o) => !o.erro).length;
  const erros = fila.filter((o) => o.erro).length;
  let cls = "", txt = "Online, sincronizado";
  if (erros) { cls = "err"; txt = `${erros} com erro`; }
  else if (!online) { cls = "off"; txt = pend ? `Offline, ${pend} aguardando` : "Offline"; }
  else if (pend || enviando) { cls = "env"; txt = `Enviando… ${pend || ""}`.trim(); }
  else if (!tempoReal) { cls = "env"; txt = "Conectando…"; }
  return (
    <button className={`sync ${cls}`} data-testid="status-sync" onClick={() => { void reconectar("toque"); void enviarFila(); }} title="Toque para sincronizar agora">
      <span className="p" />{txt}
    </button>
  );
}

/** Teclado numérico de valor em centavos: "1","2","3" → 0,03 → 0,12 → 1,23 */
export function Teclado({ valor, setValor }: { valor: string; setValor: (v: string) => void }) {
  const t = (k: string) => {
    if (k === "⌫") setValor(valor.slice(0, -1));
    else if (k === "C") setValor("");
    else if (valor.length < 7) setValor((valor + k).replace(/^0+/, ""));
  };
  return (
    <div className="tecl" data-testid="teclado">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
        <button key={k} type="button" onClick={() => t(k)} aria-label={k === "⌫" ? "Apagar" : k === "C" ? "Limpar" : k}>{k}</button>
      ))}
    </div>
  );
}
export const centavos = (s: string) => (s ? Number(s) / 100 : 0);

export function useLargo(): boolean {
  const q = "(min-width: 900px)";
  const [l, setL] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q); const f = () => setL(m.matches);
    m.addEventListener("change", f); return () => m.removeEventListener("change", f);
  }, []);
  return l;
}

/** Leitor USB (teclado): sequência rápida de teclas terminada em Enter. */
export function useLeitorUSB(aoLer: (codigo: string) => void, ativo = true) {
  const ref = useRef(aoLer); ref.current = aoLer;
  useEffect(() => {
    if (!ativo) return;
    let buf = ""; let ultimo = 0; let rapido = true;
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const agora = performance.now();
      if (e.key === "Enter") {
        if (buf.length >= 6 && rapido) {
          const emInput = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA");
          if (!emInput || alvo?.dataset.leitor === "1") { e.preventDefault(); ref.current(buf); }
        }
        buf = ""; rapido = true; return;
      }
      if (e.key.length !== 1) return;
      if (agora - ultimo > 60) { buf = ""; rapido = true; }
      else if (agora - ultimo > 45) rapido = false;
      buf += e.key; ultimo = agora;
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [ativo]);
}

const minDe = (iso: string | null | undefined) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)) : null);

/** Problemas de sincronização deste aparelho e (para o Admin) dos outros aparelhos. */
export function useProblemasSync() {
  const fila = useLoja((e) => e.fila);
  const vigia = useLoja((e) => e.vigia);
  const online = useLoja((e) => e.online);
  const aparelhos = useLoja((e) => e.aparelhos);
  const uid = useLoja((e) => e.uid);
  const papel = useLoja((e) => e.papel);
  useLoja((e) => e.ultimaSync);
  const pend = fila.filter((o) => !o.erro).length;
  const erros = fila.filter((o) => o.erro).length;
  const atrasoMin = Math.floor(atrasoSeg(getEstado()) / 60);
  const semConferir = vigia.okEm ? minDe(vigia.okEm)! : null;
  const faltando = pend + erros + vigia.faltandoAparelho;
  let meu: { min: number; faltando: number; texto: string } | null = null;
  if ((pend && atrasoMin >= 2) || erros || vigia.faltandoServidor || vigia.faltandoAparelho || (online && semConferir != null && semConferir >= 10 && pend)) {
    const min = Math.max(atrasoMin, pend ? semConferir ?? 0 : 0);
    meu = { min, faltando, texto: `Sincronização atrasada ${min} min · ${faltando} faltando` };
  }
  const outros: { nome: string; texto: string }[] = [];
  if (papel === "admin") {
    for (const a of Object.values(aparelhos)) {
      if (a.uid === uid || a.bloqueado || !a.sync_em) continue;
      const sinalMin = minDe(a.sync_em)!;
      if (sinalMin > 24 * 60) continue;
      const falt = (a.pendentes ?? 0) + (a.faltando_servidor ?? 0) + (a.faltando_aparelho ?? 0);
      const atraso = Math.round((a.atraso_seg ?? 0) / 60) + ((a.pendentes ?? 0) > 0 ? sinalMin : 0);
      if (falt > 0 && (atraso >= 2 || sinalMin >= 5)) {
        outros.push({ nome: `${a.nome}${a.operador ? ` (${a.operador})` : ""}`, texto: `atrasado ${atraso} min · ${falt} faltando · último sinal há ${sinalMin} min` });
      }
    }
  }
  return { meu, outros };
}

export function AlertaSync() {
  const { meu, outros } = useProblemasSync();
  const [rodando, setRodando] = useState(false);
  if (!meu && !outros.length) return null;
  return (
    <div className="alerta-sync" role="alert" data-testid="alerta-sync">
      {meu && (
        <div className="l"><span>⚠️ {meu.texto}</span>
          <button className="btn peq b-claro" disabled={rodando} data-testid="reenviar"
            onClick={async () => { setRodando(true); const r = await reenviarTudo().finally(() => setRodando(false)); toast(r ? `Conferido: ${r.reenviadas} reenviada(s), ${r.baixadas} baixada(s)` : "Sem internet agora — tento de novo sozinho"); }}>
            {rodando ? "Reenviando…" : "Reenviar"}</button></div>
      )}
      {outros.map((o) => <div key={o.nome} className="l"><span>📱 <b>{o.nome}</b>: {o.texto}. Abra o app nele (ou toque em “Reenviar tudo” lá).</span></div>)}
    </div>
  );
}

/** Pergunta quem está no caixa. Não trava nada: a sincronização roda por trás. */
export function PerguntaOperador({ aoFechar }: { aoFechar: () => void }) {
  const atual = useLoja((e) => e.operador);
  const [nome, setNome] = useState(atual);
  const recentes = lerOperadoresRecentes();
  const ok = (n: string) => { if (n.trim()) { definirOperador(n); aoFechar(); } };
  return (
    <Modal titulo="Quem está no caixa?" aoFechar={aoFechar}>
      <p className="peq-t" style={{ marginTop: 0 }}>O nome só aparece nas vendas. O app continua sincronizando mesmo sem nome.</p>
      {recentes.length > 0 && <div style={{ marginBottom: 6 }}>{recentes.map((r) => <button key={r} className={`chip ${r === atual ? "on" : ""}`} onClick={() => ok(r)}>{r}</button>)}</div>}
      <form onSubmit={(e) => { e.preventDefault(); ok(nome); }}>
        <input className="input" autoFocus value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" data-testid="nome-operador" />
        <div className="g2" style={{ marginTop: 10 }}>
          <button type="button" className="btn b-claro" onClick={aoFechar}>Agora não</button>
          <button type="submit" className="btn b-folha" disabled={!nome.trim()} data-testid="salvar-operador">Começar</button>
        </div>
      </form>
    </Modal>
  );
}
