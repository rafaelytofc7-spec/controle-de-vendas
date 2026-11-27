import { useState } from "react";
import { useLoja, relatorioAgora } from "../lib/loja";
import { toast } from "../comum";
import { brl, diaSP, num, pct } from "../lib/util";
import { GraficoBarras } from "../graficos";

const nomeDia = (d: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

/** Relatórios diários (gerados às 00:10 pelo servidor). */
export default function Relatorios() {
  const relatorios = useLoja((e) => e.relatorios);
  const papel = useLoja((e) => e.papel);
  const lista = Object.values(relatorios).sort((a, b) => b.dia.localeCompare(a.dia));
  const [sel, setSel] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const r = sel ? relatorios[sel] : lista[0];
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" }}>
        <select className="input" style={{ maxWidth: 260, marginTop: 0 }} value={r?.dia ?? ""} onChange={(e) => setSel(e.target.value)} data-testid="escolher-relatorio">
          {lista.map((x) => <option key={x.dia} value={x.dia}>{nomeDia(x.dia)}{x.dia === diaSP() ? " (parcial)" : ""}</option>)}
        </select>
        {papel === "admin" && <button className="btn b-claro" disabled={rodando} data-testid="relatorio-hoje" onClick={async () => {
          setRodando(true); try { await relatorioAgora(); setSel(diaSP()); toast("Relatório de hoje (até agora) gerado"); } catch (e) { toast((e as Error).message); } finally { setRodando(false); }
        }}>{rodando ? "Gerando…" : "Gerar o de hoje até agora"}</button>}
      </div>
      {!r ? <div className="vazio">O primeiro relatório sai hoje à noite (00:10).</div> : <RelatorioDia d={r.dados} />}
    </>
  );
}

export function RelatorioDia({ d }: { d: any }) {
  const sp = d.semana_passada ?? { total: 0, vendas: 0 };
  const varT = sp.total ? (d.total - sp.total) / sp.total * 100 : null;
  const horas = Object.entries(d.por_hora ?? {}).map(([h, v]: any) => ({ rotulo: `${h}h`, valor: v.total, dica: `${h}h: ${v.vendas} vendas · ${brl(v.total)}` })).sort((a, b) => parseInt(a.rotulo) - parseInt(b.rotulo));
  const tabela = (obj: Record<string, { vendas: number; total: number }>) => Object.entries(obj ?? {}).sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => <div key={k} className="linha-it"><span>{k}</span><span>{v.vendas} · <b>{brl(v.total)}</b></span></div>);
  return (
    <div data-testid="relatorio">
      <div className="kpis">
        <div className="kpi"><small>Vendas</small><b>{d.vendas}</b></div>
        <div className="kpi"><small>Total</small><b>{brl(d.total)}</b>{varT != null && <small className={varT >= 0 ? "up" : "dn"}>{varT >= 0 ? "▲" : "▼"} {pct(Math.abs(varT))} vs. semana passada</small>}</div>
        <div className="kpi"><small>Ticket médio</small><b>{brl(d.ticket_medio)}</b></div>
        <div className="kpi"><small>Lucro{d.lucro_estimado ? " (estimado)" : ""}</small><b>{brl(d.lucro)}</b></div>
      </div>
      <div className="card"><h3>Por hora</h3><GraficoBarras dados={horas} /></div>
      <div className="g2">
        <div className="card"><h3>Formas de pagamento</h3>{tabela(d.por_forma)}</div>
        <div className="card"><h3>Por operador</h3>{tabela(d.por_operador)}</div>
      </div>
      <div className="card"><h3>Produtos que mais venderam</h3>
        {(d.top_produtos ?? []).length === 0 && <div className="vazio">Só vendas por valor neste dia.</div>}
        {(d.top_produtos ?? []).map((p: any) => <div key={p.id} className="linha-it"><span>{p.nome} <small className="mut">{num(p.quantidade)}</small></span><span><b>{brl(p.total)}</b>{p.lucro != null && <small className="mut"> · lucro {brl(p.lucro)}</small>}</span></div>)}
      </div>
      <div className="card"><h3>Estoque e compras</h3>
        <div className="linha-it"><span>Compras (Chegou mercadoria)</span><span>{d.entradas?.quantidade ?? 0} · <b>{brl(d.entradas?.total ?? 0)}</b></span></div>
        <div className="linha-it"><span>Perdas</span><span>{d.perdas?.itens ?? 0} · <b>{brl(d.perdas?.custo ?? 0)}</b></span></div>
        <div className="linha-it"><span>Encomendas para o dia seguinte</span><b>{d.encomendas_amanha ?? 0}</b></div>
        {(d.encomendas_atrasadas ?? 0) > 0 && <div className="linha-it"><span>Encomendas atrasadas</span><b className="erro-t">{d.encomendas_atrasadas}</b></div>}
        <div className="linha-it"><span>Sugestões de promoção</span><b>{d.promocoes_sugeridas ?? 0}</b></div>
        {(d.estoque_baixo ?? []).length > 0 && <p className="peq-t"><b>Estoque baixo:</b> {(d.estoque_baixo as any[]).map((e) => `${e.produto} (${num(e.estoque)})`).join(", ")}</p>}
      </div>
    </div>
  );
}
