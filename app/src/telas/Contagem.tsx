import { useMemo, useState } from "react";
import { useLoja, enfileirar } from "../lib/loja";
import { toast } from "../comum";
import { ativos, buscar, custoBase, emoji } from "../lib/produtos";
import { lerNumero, novoId, num } from "../lib/util";
import { nomeUnidade } from "../lib/tipos";

/** Contagem inicial (dia da virada) ou recontagem: define o estoque real de cada produto. */
export default function Contagem() {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const custos = useLoja((e) => e.custos);
  const papel = useLoja((e) => e.papel);
  const [t, setT] = useState("");
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [custo, setCusto] = useState<Record<string, string>>({});
  const lista = useMemo(() => buscar(ativos(produtos), codigos, t), [produtos, codigos, t]);
  const preenchidos = Object.entries(qtd).filter(([, v]) => lerNumero(v) != null);
  if (papel !== "admin") return <div className="vazio">Só o Admin faz a contagem de estoque.</div>;
  return (
    <>
      <div className="aviso">Conte o que tem na loja e digite a quantidade de cada produto. O estoque passa a ser exatamente o que você digitar. O custo é opcional (use se ainda não registrou nenhuma entrada do produto).</div>
      <div className="busca"><span>🔎</span><input placeholder="Buscar produto" value={t} onChange={(e) => setT(e.target.value)} data-leitor="1" /></div>
      <div className="card" style={{ padding: "0 12px" }}>
        {lista.map((p) => (
          <div key={p.id} className="prod" style={{ cursor: "default" }} data-testid="contagem-linha">
            <div className="ic">{emoji(p.nome)}</div>
            <div className="n"><b>{p.nome}</b><small>agora: {num(custos[p.id]?.estoque ?? 0)} {nomeUnidade(p.unidade)}{custoBase(p, custos[p.id]) == null ? " · sem custo" : ""}</small></div>
            <input className="input" style={{ width: 92, marginTop: 0 }} inputMode="decimal" placeholder={nomeUnidade(p.unidade)} value={qtd[p.id] ?? ""} aria-label={`Quantidade de ${p.nome}`}
              onChange={(e) => setQtd({ ...qtd, [p.id]: e.target.value })} data-testid="contagem-qtd" />
            <input className="input" style={{ width: 92, marginTop: 0 }} inputMode="decimal" placeholder="custo R$" value={custo[p.id] ?? ""} aria-label={`Custo de ${p.nome}`}
              onChange={(e) => setCusto({ ...custo, [p.id]: e.target.value })} />
          </div>
        ))}
      </div>
      <button className="btn b-folha w100" style={{ position: "sticky", bottom: 76 }} disabled={!preenchidos.length} data-testid="contagem-salvar" onClick={() => {
        if (!confirm(`Definir o estoque de ${preenchidos.length} produto(s)?`)) return;
        enfileirar("contagem", { id: novoId(), itens: preenchidos.map(([id, v]) => ({ produto_id: id, quantidade: lerNumero(v), custo: lerNumero(custo[id] ?? "") })) });
        toast(`Estoque de ${preenchidos.length} produto(s) salvo`); setQtd({}); setCusto({});
      }}>Salvar contagem ({preenchidos.length})</button>
    </>
  );
}
