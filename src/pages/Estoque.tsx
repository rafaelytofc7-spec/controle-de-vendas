import { useMemo, useState } from "react";
import { useDebounce } from "../lib/debounce";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { precoSugerido as calcSug, custoUnitario } from "../lib/reabastecimento";
import { formatarDataHora, chaveMes, agoraIso } from "../lib/datas";
import { useConfirmar } from "../components/Dialogo";
import { EstadoVazio } from "../components/EstadoVazio";

export function Estoque() {
  const { produtos, reabastecimentos, registrarReabastecimento, excluirReabastecimento, salvarProduto } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [busca, setBusca] = useState("");
  const buscaDeb = useDebounce(busca, 160);
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [total, setTotal] = useState("");
  const [margem, setMargem] = useState("40");
  const [erro, setErro] = useState("");

  const lista = useMemo(() => {
    const q = buscaDeb.trim().toLowerCase();
    return q ? produtos.filter((p) => p.nome.toLowerCase().includes(q)) : produtos;
  }, [produtos, buscaDeb]);
  const p = produtos.find((x) => x.id === produtoId);
  const quantidade = Number(qtd.replace(",", ".")) || 0;
  const valorTotal = Number(total.replace(",", ".")) || 0;
  const margemN = Number(margem.replace(",", ".")) || 0;
  const custo = custoUnitario(valorTotal, quantidade);
  const sugerido = calcSug(valorTotal, quantidade, margemN);
  const mes = chaveMes(agoraIso());
  const gastoMes = reabastecimentos.filter((r) => r.criado_em.slice(0, 7) === mes.slice(0, 7) || chaveMes(r.criado_em) === mes)
    .reduce((a, r) => a + r.valor_total, 0);

  async function salvar() {
    if (!p || quantidade <= 0) return;
    setErro("");
    try {
      const row = await registrarReabastecimento({
        produtoId: p.id, produto: p.nome, unidade: p.unidade, quantidade, valorTotal, margem: margemN,
      });
      setQtd(""); setTotal("");
      void row;
    } catch { setErro("Não foi possível salvar."); }
  }

  async function aplicarPreco(id: string, preco: number, nome: string, unidade: string | null) {
    const prod = produtos.find((x) => x.id === id);
    if (!prod) return;
    const ok = await confirmar({
      titulo: `Colocar ${formatarReais(preco)} no cardápio?`,
      descricao: `${nome} passa de ${formatarReais(prod.preco)} para ${formatarReais(preco)}.`,
      confirmar: "Atualizar preço",
    });
    if (ok) await salvarProduto({ ...prod, preco });
    void unidade;
  }

  return (
    <div>
      {dialogo}
      <div className="card">
        <h3>Reabastecimento</h3>
        <p className="muted small">Gasto no mês: <strong>{formatarReais(gastoMes)}</strong></p>
        <input className="input search" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="field">Produto
          <select className="input" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
            <option value="">Selecione</option>
            {lista.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        <div className="row">
          <label className="field grow">Quantidade<input className="input num" value={qtd} onChange={(e) => setQtd(e.target.value)} /></label>
          <label className="field grow">Valor total<input className="input num" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
        </div>
        <label className="field">Margem %
          <input className="input num" value={margem} onChange={(e) => setMargem(e.target.value)} />
        </label>
        <p>Custo unitário: <strong>{formatarReais(custo)}</strong> · Sugerido: <strong>{formatarReais(sugerido)}</strong></p>
        {erro && <div className="banner erro">{erro}</div>}
        <div className="row">
          <button className="btn btn-primary grow" disabled={!p || quantidade <= 0} onClick={() => void salvar()}>Registrar entrada</button>
          {p && sugerido > 0 && (
            <button className="btn grow" onClick={() => void aplicarPreco(p.id, sugerido, p.nome, p.unidade)}>Usar no cardápio</button>
          )}
        </div>
      </div>
      <div className="lista" style={{ marginTop: 12 }}>
        {reabastecimentos.length === 0 && (
          <EstadoVazio icone="estoque" titulo="Nenhuma entrada ainda" texto="Registre uma compra com quantidade e valor pago. O custo e o preço sugerido são calculados na hora." />
        )}
        {reabastecimentos.map((r) => (
          <div className="item" key={r.id}>
            <div className="grow">
              <div className="titulo">{r.produto}</div>
              <div className="muted small">{r.quantidade} {r.unidade || ""} · pago {formatarReais(r.valor_total)} · custo {formatarReais(r.custo_unitario)}</div>
              <div>Sugerido {formatarReais(r.preco_sugerido)} <span className="muted small">{formatarDataHora(r.criado_em)}</span></div>
            </div>
            <div className="col">
              <button className="btn btn-sm" onClick={() => r.produto_id && void aplicarPreco(r.produto_id, r.preco_sugerido, r.produto, r.unidade)}>No cardápio</button>
              <button className="btn btn-sm btn-danger" onClick={async () => {
                const ok = await confirmar({ titulo: "Apagar esta entrada?", descricao: `${r.produto} · ${formatarReais(r.valor_total)}`, confirmar: "Apagar", destrutivo: true });
                if (ok) await excluirReabastecimento(r.id);
              }}>Apagar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
