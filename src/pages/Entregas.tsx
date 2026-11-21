import { useState } from "react";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { formatarDataHora } from "../lib/datas";
import { linkWhatsapp, textoEntrega } from "../lib/whatsapp";
import { useConfirmar } from "../components/Dialogo";
import type { StatusEntrega } from "../lib/types";
import { EstadoVazio } from "../components/EstadoVazio";

const LABELS: Record<StatusEntrega, string> = { pendente: "Pendente", a_caminho: "A caminho", entregue: "Entregue" };

export function Entregas() {
  const { entregas, config, salvarEntrega, statusEntrega, excluirEntrega } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [edit, setEdit] = useState(false);
  const [id, setId] = useState<string | undefined>();
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valor, setValor] = useState("");

  function abrir(existente?: typeof entregas[0]) {
    setEdit(true); setId(existente?.id);
    setCliente(existente?.cliente ?? ""); setEndereco(existente?.endereco ?? "");
    setTelefone(existente?.telefone ?? ""); setValor(existente ? String(existente.valor).replace(".", ",") : "");
  }

  async function salvar() {
    await salvarEntrega({ id, cliente, endereco, telefone: telefone || null, valor: Number(valor.replace(",", ".")) || 0 });
    setEdit(false);
  }

  return (
    <div>
      {dialogo}
      <button className="btn btn-primary btn-block" onClick={() => abrir()}>Nova entrega</button>
      <div className="lista" style={{ marginTop: 12 }}>
        {entregas.length === 0 && <EstadoVazio icone="entrega" titulo="Nenhuma entrega" texto="Cadastre a saída com cliente, endereço e valor. O status e o WhatsApp ficam à mão." />}
        {entregas.map((e) => (
          <div className="item" key={e.id}>
            <div className="grow">
              <div className="titulo">{e.cliente} · {formatarReais(e.valor)}</div>
              <div className="muted small">{e.endereco}</div>
              <div className="muted small">{formatarDataHora(e.criado_em)}</div>
              <span className={`tag ${e.status === "entregue" ? "ok" : e.status === "a_caminho" ? "warn" : ""}`}>{LABELS[e.status]}</span>
            </div>
            <div className="col">
              <select className="input" style={{ minHeight: 40 }} value={e.status} onChange={(ev) => void statusEntrega(e.id, ev.target.value as StatusEntrega)}>
                {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <a className="btn btn-sm" href={linkWhatsapp(e.telefone || config.telefone, textoEntrega(e, config))} target="_blank" rel="noreferrer">WhatsApp</a>
              <button className="btn btn-sm" onClick={() => abrir(e)}>Editar</button>
              <button className="btn btn-sm btn-danger" onClick={async () => {
                const ok = await confirmar({ titulo: "Apagar entrega?", descricao: e.cliente, confirmar: "Apagar", destrutivo: true });
                if (ok) await excluirEntrega(e.id);
              }}>Apagar</button>
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <div className="dialog-bg" onClick={() => setEdit(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{id ? "Editar entrega" : "Nova entrega"}</h3>
            <div className="col" style={{ marginTop: 10 }}>
              <label className="field">Cliente<input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></label>
              <label className="field">Endereço<input className="input" value={endereco} onChange={(e) => setEndereco(e.target.value)} /></label>
              <label className="field">Telefone<input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></label>
              <label className="field">Valor<input className="input num" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
              <div className="row">
                <button className="btn grow" onClick={() => setEdit(false)}>Cancelar</button>
                <button className="btn btn-primary grow" onClick={() => void salvar()}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
