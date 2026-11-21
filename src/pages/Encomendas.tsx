import { useState } from "react";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { formatarDataHora } from "../lib/datas";
import { useConfirmar } from "../components/Dialogo";
import { EstadoVazio } from "../components/EstadoVazio";

export function Encomendas() {
  const { encomendas, salvarEncomenda, concluirEncomenda, excluirEncomenda } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [edit, setEdit] = useState(false);
  const [id, setId] = useState<string | undefined>();
  const [cliente, setCliente] = useState("");
  const [produto, setProduto] = useState("");
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState(false);
  const [paraEntrega, setParaEntrega] = useState(false);
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");

  function abrir(e?: typeof encomendas[0]) {
    setEdit(true); setId(e?.id);
    setCliente(e?.cliente ?? ""); setProduto(e?.produto ?? "");
    setValor(e ? String(e.valor).replace(".", ",") : "");
    setPago(e?.pago ?? false); setParaEntrega(e?.para_entrega ?? false);
    setEndereco(e?.endereco ?? ""); setTelefone(e?.telefone ?? "");
  }

  async function salvar() {
    await salvarEncomenda({
      id, cliente, produto, valor: Number(valor.replace(",", ".")) || 0,
      pago, para_entrega: paraEntrega, endereco: endereco || null, telefone: telefone || null,
    });
    setEdit(false);
  }

  return (
    <div>
      {dialogo}
      <button className="btn btn-primary btn-block" onClick={() => abrir()}>Nova encomenda</button>
      <div className="lista" style={{ marginTop: 12 }} data-testid="lista-encomendas">
        {encomendas.length === 0 && <EstadoVazio icone="encomenda" titulo="Nenhuma encomenda" texto="Reserve um pedido com valor, cliente e data combinada. Ele aparece aqui até ser concluído." />}
        {encomendas.map((e) => (
          <div className="item" key={e.id}>
            <div className="grow">
              <div className="titulo">{e.cliente} · {e.produto}</div>
              <div><strong>{formatarReais(e.valor)}</strong> {e.pago ? <span className="tag ok">pago</span> : <span className="tag warn">a pagar</span>}</div>
              <div className="muted small">{formatarDataHora(e.criado_em)}{e.concluido_em ? ` · concluída ${formatarDataHora(e.concluido_em)}` : ""}</div>
              {e.para_entrega && <span className="tag">para entrega</span>}
            </div>
            <div className="col">
              <button className="btn btn-sm" onClick={() => void concluirEncomenda(e.id, !e.concluido_em)}>{e.concluido_em ? "Reabrir" : "Concluir"}</button>
              <button className="btn btn-sm" onClick={() => abrir(e)}>Editar</button>
              <button className="btn btn-sm btn-danger" onClick={async () => {
                const ok = await confirmar({ titulo: "Apagar encomenda?", descricao: `${e.cliente} · ${e.produto}`, confirmar: "Apagar", destrutivo: true });
                if (ok) await excluirEncomenda(e.id);
              }}>Apagar</button>
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <div className="dialog-bg" onClick={() => setEdit(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{id ? "Editar encomenda" : "Nova encomenda"}</h3>
            <div className="col" style={{ marginTop: 10 }}>
              <label className="field">Cliente<input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></label>
              <label className="field">Produto<input className="input" value={produto} onChange={(e) => setProduto(e.target.value)} /></label>
              <label className="field">Valor<input className="input num" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já pago</label>
              <label className="check"><input type="checkbox" checked={paraEntrega} onChange={(e) => setParaEntrega(e.target.checked)} /> Para entrega</label>
              {paraEntrega && (
                <>
                  <label className="field">Endereço<input className="input" value={endereco} onChange={(e) => setEndereco(e.target.value)} /></label>
                  <label className="field">Telefone<input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></label>
                </>
              )}
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
