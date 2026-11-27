import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLoja, enviarFila, reconectar } from "./lib/loja";

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
