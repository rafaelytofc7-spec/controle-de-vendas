import { useState } from "react";
import { useLoja, usarCodigo } from "../lib/loja";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { NOME_LOJA, PLATAFORMA, VERSAO_CODE, VERSAO_NOME } from "../lib/config";

export function LigarAparelho() {
  const erro = useLoja((e) => e.erroEntrada);
  const [c, setC] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ir = async (cod: string) => { if (!cod.trim()) return; setOcupado(true); await usarCodigo(cod); setOcupado(false); };
  return (
    <div className="tela-cheia" data-testid="ligar-aparelho">
      <div style={{ fontSize: 56 }}>🔗</div>
      <h1>Ligar este aparelho</h1>
      {PLATAFORMA === "android"
        ? <p>Não deu para entrar sozinho como Caixa no {NOME_LOJA}. Peça um convite (QR) a um Admin ou use o código de recuperação.</p>
        : <p>No computador, para usar o {NOME_LOJA}, abra o app num aparelho Admin, vá em <b>Ajustes → Ligar outro aparelho</b> e leia o QR ou digite o código. O código de recuperação (Admin) também funciona.</p>}
      <input className="input" value={c} onChange={(e) => setC(e.target.value)} placeholder="CÓDIGO" autoFocus data-testid="ligar-codigo"
        onKeyDown={(e) => { if (e.key === "Enter") void ir(c); }} />
      {erro && <div className="erro" style={{ maxWidth: 320 }}>{erro}</div>}
      <div className="row" style={{ marginTop: 12, width: "100%", maxWidth: 320 }}>
        <button className="btn b-claro grow" onClick={async () => { const q = await lerCodigoBarras(); if (q) { setC(q); void ir(q); } }}>📷 Ler QR</button>
        <button className="btn b-ouro grow" disabled={ocupado} onClick={() => void ir(c)} data-testid="ligar-entrar">{ocupado ? "Entrando…" : "Entrar"}</button>
      </div>
    </div>
  );
}

export function NovaVersao() {
  const versao = useLoja((e) => e.versao[PLATAFORMA]);
  const fila = useLoja((e) => e.fila);
  const pend = fila.length;
  return (
    <div className="tela-cheia" data-testid="nova-versao">
      <div style={{ fontSize: 60 }}>⬆️</div>
      <h1>Nova versão disponível</h1>
      <p>Este aparelho está na versão <b>{VERSAO_NOME}</b>. A loja passou a exigir a versão <b>{versao?.nome_atual ?? versao?.minima ?? "nova"}</b>. Para não gravar dados errados, o app fica pausado até atualizar.</p>
      {pend > 0 && <p style={{ fontSize: 14 }}><b>{pend}</b> registro(s) deste aparelho estão guardados e serão enviados depois da atualização.</p>}
      {PLATAFORMA === "web" ? (
        <button className="btn b-ouro w100" style={{ maxWidth: 340, fontSize: 18 }} onClick={async () => {
          const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs ?? []) await r.update().catch(() => {});
          location.reload();
        }}>Atualizar agora</button>
      ) : (
        <a className="btn b-ouro w100" style={{ maxWidth: 340, fontSize: 18, textDecoration: "none" }} href={versao?.url ?? "#"} target="_blank" rel="noreferrer">Baixar a nova versão</a>
      )}
      {versao?.novidades && <p style={{ fontSize: 13, opacity: 0.75 }}>Novidades: {versao.novidades}</p>}
      <p style={{ fontSize: 11, opacity: 0.5 }}>instalada: {VERSAO_CODE} · mínima: {versao?.minima}</p>
    </div>
  );
}

export function AparelhoBloqueado() {
  return (
    <div className="tela-cheia"><div style={{ fontSize: 56 }}>⛔</div><h1>Aparelho bloqueado</h1><p>O Admin bloqueou este aparelho. Fale com ele para liberar.</p></div>
  );
}
