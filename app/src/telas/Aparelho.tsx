import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useLoja, criarConvite, definirAparelho, renomearAparelho, usarCodigo, enfileirar, descartarOp, tentarDeNovo } from "../lib/loja";
import { Modal, toast } from "../comum";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { LOJA, PLATAFORMA, VERSAO_NOME } from "../lib/config";
import { dataHoraSP } from "../lib/util";
import type { Papel } from "../lib/tipos";

export default function Aparelho() {
  const meuNome = useLoja((e) => e.meuNome);
  const papel = useLoja((e) => e.papel);
  const uid = useLoja((e) => e.uid);
  const aparelhos = useLoja((e) => e.aparelhos);
  const fila = useLoja((e) => e.fila);
  const cfg = useLoja((e) => e.config);
  const ultimaSync = useLoja((e) => e.ultimaSync);
  const [nome, setNome] = useState(meuNome);
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState("");
  const [convite, setConvite] = useState<Papel | null>(null);
  const [balanca, setBalanca] = useState(localStorage.getItem("cv3-balanca") || "preco");
  useEffect(() => setNome(meuNome), [meuNome]);
  const admin = papel === "admin";
  const erros = fila.filter((o) => o.erro);

  return (
    <>
      <div className="card">
        <h3>Este aparelho</h3>
        <div className="row"><input className="input" style={{ marginTop: 0 }} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do aparelho" />
          <button className="btn b-claro" onClick={async () => { try { await renomearAparelho(nome.trim()); toast("Nome salvo"); } catch (e) { toast(String((e as Error).message)); } }}>Salvar</button></div>
        <p className="peq-t mut" style={{ marginBottom: 0 }}>Papel: <b data-testid="papel">{admin ? "Admin" : "Caixa"}</b> · versão {VERSAO_NOME} ({PLATAFORMA}) · loja {LOJA}{ultimaSync ? ` · sincronizado ${dataHoraSP(ultimaSync)}` : ""}</p>
      </div>

      {erros.length > 0 && (
        <div className="card"><h3>Envios com erro</h3>
          {erros.map((o) => (
            <div key={o.id} className="linha-it"><span><b>{o.tipo}</b> <small>{o.erro}</small></span>
              <span className="row"><button className="btn peq b-claro" onClick={() => tentarDeNovo(o.id)}>Tentar de novo</button>
                <button className="btn peq b-perigo" onClick={() => { if (confirm("Descartar este envio?")) descartarOp(o.id); }}>Descartar</button></span></div>
          ))}
        </div>
      )}

      {!admin && (
        <div className="card"><h3>Virar Admin</h3>
          <p className="peq-t">Leia o QR mostrado no aparelho Admin, ou digite o convite / código de recuperação.</p>
          <div className="row"><input className="input" style={{ marginTop: 0, textTransform: "uppercase" }} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código" data-testid="codigo-admin" />
            <button className="btn b-claro" onClick={async () => { const c = await lerCodigoBarras(); if (c) setCodigo(c.replace(/^.*convite=/, "")); }}>📷</button>
            <button className="btn b-folha" onClick={async () => { const r = await usarCodigo(codigo); setMsg(r ?? "Pronto! Este aparelho agora é Admin."); setCodigo(""); }} data-testid="usar-codigo">Usar</button></div>
          {msg && <div className={msg.startsWith("Pronto") ? "aviso" : "erro"}>{msg}</div>}
        </div>
      )}

      {admin && (
        <>
          <div className="card"><h3>Ligar outro aparelho</h3>
            <p className="peq-t">Gera um QR/código de uso único que vale 10 minutos.</p>
            <div className="g2"><button className="btn b-claro" onClick={() => setConvite("caixa")} data-testid="convite-caixa">Como Caixa</button><button className="btn b-folha" onClick={() => setConvite("admin")} data-testid="convite-admin">Como Admin</button></div>
          </div>
          <div className="card"><h3>Aparelhos da loja</h3>
            {Object.values(aparelhos).sort((a, b) => (b.ultimo_acesso ?? "").localeCompare(a.ultimo_acesso ?? "")).map((a) => (
              <div key={a.uid} className="linha-it" data-testid="aparelho">
                <span><b>{a.nome}</b> {a.uid === uid && <small>(este)</small>}<br /><small>{a.papel === "admin" ? "Admin" : "Caixa"} · {a.plataforma ?? ""} · v{a.versao_code ?? "?"} · {a.ultimo_acesso ? dataHoraSP(a.ultimo_acesso) : ""}{a.bloqueado ? " · BLOQUEADO" : ""}</small></span>
                {a.uid !== uid && (
                  <span className="row">
                    <button className="btn peq b-claro" onClick={async () => { const n = prompt("Nome do aparelho", a.nome); if (n) await renomearAparelho(n, a.uid).catch((e) => toast(e.message)); }}>Nome</button>
                    <button className="btn peq b-claro" onClick={() => definirAparelho(a.uid, a.papel === "admin" ? "caixa" : "admin", null).catch((e) => toast(e.message))}>{a.papel === "admin" ? "Tornar Caixa" : "Tornar Admin"}</button>
                    <button className="btn peq b-perigo" onClick={() => definirAparelho(a.uid, null, !a.bloqueado).catch((e) => toast(e.message))}>{a.bloqueado ? "Desbloquear" : "Bloquear"}</button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="card"><h3>Preços</h3>
            <label className="field">Margem padrão (%)
              <input className="input" inputMode="numeric" defaultValue={cfg?.margem_padrao ?? 35} onBlur={(e) => { const m = Number(e.target.value); if (m >= 0 && m < 100) enfileirar("config", { margem_padrao: m }); }} /></label>
            <div className="field">Arredondamento<div style={{ marginTop: 4 }}>
              {([["49_99", ",49 ou ,99"], ["x9", ",x9"], ["nenhum", "sem arredondar"]] as const).map(([v, n]) => (
                <button key={v} className={`chip ${cfg?.arredondamento === v ? "on" : ""}`} onClick={() => enfileirar("config", { arredondamento: v })}>{n}</button>))}
            </div></div>
            <div className="field">Margem calculada<div style={{ marginTop: 4 }}>
              <button className={`chip ${cfg?.modo_margem !== "markup" ? "on" : ""}`} onClick={() => enfileirar("config", { modo_margem: "venda" })}>sobre a venda</button>
              <button className={`chip ${cfg?.modo_margem === "markup" ? "on" : ""}`} onClick={() => enfileirar("config", { modo_margem: "markup" })}>markup sobre o custo</button>
            </div></div>
          </div>
        </>
      )}

      <div className="card"><h3>Etiqueta da balança</h3>
        <p className="peq-t">Etiquetas que começam com 2 trazem o {balanca === "peso" ? "peso" : "preço"} no código.</p>
        <button className={`chip ${balanca === "preco" ? "on" : ""}`} onClick={() => { localStorage.setItem("cv3-balanca", "preco"); setBalanca("preco"); }}>Preço total</button>
        <button className={`chip ${balanca === "peso" ? "on" : ""}`} onClick={() => { localStorage.setItem("cv3-balanca", "peso"); setBalanca("peso"); }}>Peso (gramas)</button>
      </div>

      {convite && <ConviteQR papel={convite} aoFechar={() => setConvite(null)} />}
    </>
  );
}

function ConviteQR({ papel, aoFechar }: { papel: Papel; aoFechar: () => void }) {
  const [c, setC] = useState<{ codigo: string; expira_em: string } | null>(null);
  const [qr, setQr] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    criarConvite(papel).then(async (r) => { setC(r); setQr(await QRCode.toDataURL(r.codigo, { margin: 1, width: 240 })); }).catch((e) => setErro(e.message || "Sem internet"));
  }, [papel]);
  return (
    <Modal titulo={`Ligar aparelho como ${papel === "admin" ? "Admin" : "Caixa"}`} aoFechar={aoFechar}>
      <div style={{ textAlign: "center" }}>
        {erro && <div className="erro">{erro}</div>}
        {qr && <div className="qr"><img src={qr} alt="QR do convite" width={240} height={240} /></div>}
        {c && <><div className="codigo-grande" data-testid="codigo-convite">{c.codigo.slice(0, 4)} {c.codigo.slice(4)}</div>
          <p className="peq-t">No outro aparelho: Ajustes → “Virar Admin” (ou a tela “Ligar este aparelho”) → ler o QR ou digitar o código. Vale até {dataHoraSP(c.expira_em)} e só uma vez.</p></>}
        {!c && !erro && <p>Gerando…</p>}
      </div>
    </Modal>
  );
}
