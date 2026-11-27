import { useMemo, useState } from "react";
import { useLoja } from "../lib/loja";
import { ativos, buscar, emoji } from "../lib/produtos";
import { brl, diaSP, pct } from "../lib/util";
import { nomeUnidade } from "../lib/tipos";
import { GraficoLinhas, type Serie } from "../graficos";

/** Preço de compra por fornecedor: gráfico no tempo + comparação. Só Admin. */
export default function PrecosFornecedor() {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const precos = useLoja((e) => e.precosDiarios);
  const fornecedores = useLoja((e) => e.fornecedores);
  const papel = useLoja((e) => e.papel);
  const [t, setT] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [dias, setDias] = useState(90);

  const nomeF = (id: string) => (id ? fornecedores[id]?.nome ?? "Fornecedor removido" : "Sem fornecedor");
  const lim = diaSP(new Date(Date.now() - dias * 86400_000));

  // resumo por produto: mais barato nos últimos 30 dias e diferença para o mais caro
  const resumo = useMemo(() => {
    const lim30 = diaSP(new Date(Date.now() - 30 * 86400_000));
    const m: Record<string, Record<string, { q: number; v: number; ultimo: number; dia: string }>> = {};
    for (const p of Object.values(precos)) {
      if (p.dia < lim30 || !p.quantidade) continue;
      const f = ((m[p.produto_id] ??= {})[p.fornecedor_id] ??= { q: 0, v: 0, ultimo: 0, dia: "" });
      f.q += Number(p.quantidade); f.v += Number(p.valor);
      if (p.dia >= f.dia) { f.dia = p.dia; f.ultimo = Number(p.valor) / Number(p.quantidade); }
    }
    return Object.entries(m).map(([pid, fs]) => {
      const lista = Object.entries(fs).map(([fid, x]) => ({ fid, medio: x.v / x.q, ultimo: x.ultimo, dia: x.dia })).sort((a, b) => a.medio - b.medio);
      return { pid, lista, economia: lista.length > 1 ? (lista[lista.length - 1].medio - lista[0].medio) / lista[lista.length - 1].medio * 100 : 0 };
    }).filter((r) => produtos[r.pid]).sort((a, b) => b.economia - a.economia);
  }, [precos, produtos]);

  const lista = useMemo(() => buscar(ativos(produtos), codigos, t).slice(0, 30), [produtos, codigos, t]);
  if (papel !== "admin") return <div className="vazio">Só o Admin vê os preços de compra.</div>;

  if (sel && produtos[sel]) {
    const p = produtos[sel];
    const doProd = Object.values(precos).filter((x) => x.produto_id === sel && x.dia >= lim && x.quantidade > 0);
    const porF: Record<string, { x: string; y: number }[]> = {};
    for (const x of doProd) (porF[x.fornecedor_id] ??= []).push({ x: x.dia, y: Number(x.valor) / Number(x.quantidade) });
    const series: Serie[] = Object.entries(porF).map(([fid, pts]) => ({ nome: nomeF(fid), pontos: pts }));
    const venda = doProd.filter((x) => x.preco_venda != null).map((x) => ({ x: x.dia, y: Number(x.preco_venda) }));
    const vendaDia = Object.values(Object.fromEntries(venda.map((v) => [v.x, v])));
    if (vendaDia.length) series.push({ nome: "Preço de venda", cor: "#999", tracejada: true, pontos: vendaDia });
    const comp = Object.entries(porF).map(([fid, pts]) => {
      const ord = [...pts].sort((a, b) => (a.x < b.x ? -1 : 1));
      const q = doProd.filter((x) => x.fornecedor_id === fid);
      const qt = q.reduce((s, x) => s + Number(x.quantidade), 0); const vt = q.reduce((s, x) => s + Number(x.valor), 0);
      return { fid, ultimo: ord[ord.length - 1], medio: vt / qt, min: Math.min(...pts.map((x) => x.y)), max: Math.max(...pts.map((x) => x.y)), compras: q.length };
    }).sort((a, b) => a.medio - b.medio);
    const melhor = comp[0]?.medio;
    return (
      <>
        <button className="btn b-claro" onClick={() => setSel(null)} data-testid="voltar-precos">‹ Todos os produtos</button>
        <div className="card" style={{ marginTop: 10 }}>
          <h3>{emoji(p.nome)} {p.nome} · custo por {nomeUnidade(p.unidade)} (já com frete e perda)</h3>
          <div style={{ marginBottom: 6 }}>{[30, 90, 180].map((d) => <button key={d} className={`chip ${dias === d ? "on" : ""}`} onClick={() => setDias(d)}>{d} dias</button>)}</div>
          <div data-testid="grafico-precos"><GraficoLinhas series={series} /></div>
        </div>
        <div className="card" style={{ padding: "4px 12px" }}>
          <table data-testid="comparacao-fornecedores">
            <thead><tr><th>Fornecedor</th><th className="n">Último</th><th className="n">Médio</th><th className="n">Mín–máx</th><th className="n">Compras</th><th className="n">vs. melhor</th></tr></thead>
            <tbody>{comp.map((c, i) => (
              <tr key={c.fid}><td><b>{nomeF(c.fid)}</b>{i === 0 && comp.length > 1 && <small className="al-t"> mais barato</small>}</td>
                <td className="n">{brl(c.ultimo.y)}<br /><small className="mut">{c.ultimo.x.slice(8, 10)}/{c.ultimo.x.slice(5, 7)}</small></td>
                <td className="n">{brl(c.medio)}</td><td className="n">{brl(c.min)}–{brl(c.max)}</td><td className="n">{c.compras}</td>
                <td className="n">{i === 0 ? "—" : `+${pct((c.medio - melhor) / melhor * 100)}`}</td></tr>))}</tbody>
          </table>
          {!comp.length && <div className="vazio">Nenhuma compra deste produto no período. As compras entram pelo “Chegou mercadoria”.</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="busca"><span>🔎</span><input placeholder="Buscar produto" value={t} onChange={(e) => setT(e.target.value)} data-leitor="1" data-testid="busca-precos" /></div>
      {t ? (
        <div className="card" style={{ padding: "0 12px" }}>
          {lista.map((p) => <button key={p.id} className="prod" onClick={() => setSel(p.id)} data-testid="produto-precos"><div className="ic">{emoji(p.nome)}</div><div className="n"><b>{p.nome}</b></div><div className="p">›</div></button>)}
        </div>
      ) : (
        <div className="card" style={{ padding: "4px 12px" }}>
          <h3 style={{ marginTop: 8 }}>Comparação dos últimos 30 dias</h3>
          {resumo.length === 0 ? <div className="vazio">Ainda não há compras registradas. Cada “Chegou mercadoria” com fornecedor entra aqui.</div> : (
            <table data-testid="resumo-precos">
              <thead><tr><th>Produto</th><th>Mais barato</th><th className="n">Custo médio</th><th className="n">Diferença p/ o mais caro</th></tr></thead>
              <tbody>{resumo.map((r) => (
                <tr key={r.pid} onClick={() => setSel(r.pid)} style={{ cursor: "pointer" }}>
                  <td><b>{produtos[r.pid].nome}</b></td><td>{nomeF(r.lista[0].fid)}</td><td className="n">{brl(r.lista[0].medio)}</td>
                  <td className="n">{r.lista.length > 1 ? pct(r.economia) : "só 1 fornecedor"}</td></tr>))}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
