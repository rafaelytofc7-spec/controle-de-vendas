import { useMemo } from "react";
import { useLoja } from "../lib/loja";
import { brl, diaSP, num, pct, r2 } from "../lib/util";
import { promoAtiva } from "../lib/produtos";
import { GraficoBarras } from "../graficos";
import { useProblemasSync } from "../comum";

const hora = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso)));

/** Painel do PC: o dia em números, últimos 14 dias, estoque, encomendas, promoções e aparelhos. */
export default function Painel({ ir }: { ir: (t: string) => void }) {
  const vendas = useLoja((e) => e.vendas);
  const itens = useLoja((e) => e.itens);
  const produtos = useLoja((e) => e.produtos);
  const custos = useLoja((e) => e.custos);
  const encomendas = useLoja((e) => e.encomendas);
  const promocoes = useLoja((e) => e.promocoes);
  const entradas = useLoja((e) => e.entradas);
  const aparelhos = useLoja((e) => e.aparelhos);
  const margem = useLoja((e) => e.config?.margem_padrao ?? 35);
  const { outros, meu } = useProblemasSync();
  const hoje = diaSP();
  const semanaPassada = diaSP(new Date(Date.now() - 7 * 86400_000));

  const r = useMemo(() => {
    const porDia: Record<string, { n: number; t: number }> = {};
    const horasHoje: Record<number, number> = {}; const horasSP: Record<number, number> = {};
    const formas: Record<string, { n: number; t: number }> = {}; const ops: Record<string, { n: number; t: number }> = {};
    let lucro = 0, estimado = false; const idsHoje = new Set<string>();
    const agoraH = hora(new Date().toISOString());
    let spAteAgora = 0;
    for (const v of Object.values(vendas)) {
      if (v.excluido) continue;
      const d = diaSP(v.criado_em);
      (porDia[d] ??= { n: 0, t: 0 }); porDia[d].n++; porDia[d].t += v.total;
      if (d === semanaPassada) { const h = hora(v.criado_em); horasSP[h] = (horasSP[h] ?? 0) + v.total; if (h <= agoraH) spAteAgora += v.total; }
      if (d !== hoje) continue;
      idsHoje.add(v.id);
      const h = hora(v.criado_em); horasHoje[h] = (horasHoje[h] ?? 0) + v.total;
      const f = v.forma ?? (v.origem === "v3" ? "não informado" : "app antigo"); (formas[f] ??= { n: 0, t: 0 }); formas[f].n++; formas[f].t += v.total;
      const o = v.operador ?? (v.origem === "v3" ? "sem nome" : "app antigo"); (ops[o] ??= { n: 0, t: 0 }); ops[o].n++; ops[o].t += v.total;
      if (v.tem_itens && v.custo_total != null) lucro += v.total - v.custo_total; else { lucro += v.total * margem / 100; estimado = true; }
    }
    const top: Record<string, { nome: string; q: number; t: number }> = {};
    for (const i of Object.values(itens)) if (idsHoje.has(i.venda_id)) { const k = i.produto_id ?? i.nome; (top[k] ??= { nome: i.nome, q: 0, t: 0 }); top[k].q += i.quantidade; top[k].t += i.total; }
    const dias = Array.from({ length: 14 }, (_, k) => diaSP(new Date(Date.now() - (13 - k) * 86400_000)));
    const h = [...new Set([...Object.keys(horasHoje), ...Object.keys(horasSP)].map(Number))].sort((a, b) => a - b);
    return { hoje: porDia[hoje] ?? { n: 0, t: 0 }, sp: porDia[semanaPassada] ?? { n: 0, t: 0 }, spAteAgora, lucro: r2(lucro), estimado, formas, ops,
      top: Object.values(top).sort((a, b) => b.t - a.t).slice(0, 8), dias: dias.map((d) => ({ rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`, valor: r2(porDia[d]?.t ?? 0), dica: `${d.slice(8, 10)}/${d.slice(5, 7)}: ${porDia[d]?.n ?? 0} vendas · ${brl(porDia[d]?.t ?? 0)}` })),
      horas: h.map((x) => ({ rotulo: `${x}h`, valor: r2(horasHoje[x] ?? 0), dica: `${x}h hoje ${brl(horasHoje[x] ?? 0)} · semana passada ${brl(horasSP[x] ?? 0)}` })) };
  }, [vendas, itens, hoje, semanaPassada, margem]);

  const baixo = Object.values(produtos).filter((p) => !p.excluido && p.ativo && ((p.estoque_minimo != null && (custos[p.id]?.estoque ?? 0) <= p.estoque_minimo) || (custos[p.id]?.estoque ?? 0) < 0));
  const abertas = Object.values(encomendas).filter((e) => !e.excluido && !["entregue", "cancelada"].includes(e.status));
  const amanha = diaSP(new Date(Date.now() + 86400_000));
  const encHoje = abertas.filter((e) => e.data_entrega?.slice(0, 10) === hoje).length;
  const encAmanha = abertas.filter((e) => e.data_entrega?.slice(0, 10) === amanha).length;
  const encAtras = abertas.filter((e) => e.data_entrega && e.data_entrega.slice(0, 10) < hoje).length;
  const sugestoes = Object.values(promocoes).filter((p) => p.status === "nova" && p.dia >= diaSP(new Date(Date.now() - 3 * 86400_000)) && produtos[p.produto_id] && !promoAtiva(produtos[p.produto_id])).length;
  const comprasHoje = Object.values(entradas).filter((e) => !e.excluido && diaSP(e.criado_em) === hoje).reduce((s, e) => s + e.total, 0);
  const varSP = r.spAteAgora ? (r.hoje.t - r.spAteAgora) / r.spAteAgora * 100 : null;
  const lista = (o: Record<string, { n: number; t: number }>) => Object.entries(o).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => <div key={k} className="linha-it"><span>{k}</span><span>{v.n} · <b>{brl(v.t)}</b></span></div>);
  const ativos = Object.values(aparelhos).filter((a) => !a.bloqueado && a.sync_em && Date.now() - Date.parse(a.sync_em) < 86400_000);

  return (
    <div data-testid="painel">
      <div className="kpis">
        <div className="kpi"><small>Vendas hoje</small><b data-testid="kpi-vendas">{r.hoje.n}</b><small className="mut">semana passada: {r.sp.n} no dia</small></div>
        <div className="kpi"><small>Total hoje</small><b data-testid="kpi-total">{brl(r.hoje.t)}</b>{varSP != null && <small className={varSP >= 0 ? "up" : "dn"}>{varSP >= 0 ? "▲" : "▼"} {pct(Math.abs(varSP))} vs. mesma hora semana passada</small>}</div>
        <div className="kpi"><small>Ticket médio</small><b>{brl(r.hoje.n ? r.hoje.t / r.hoje.n : 0)}</b></div>
        <div className="kpi"><small>Lucro {r.estimado ? "(estimado)" : ""}</small><b>{brl(r.lucro)}</b></div>
        <div className="kpi"><small>Compras hoje</small><b>{brl(comprasHoje)}</b></div>
      </div>
      {(meu || outros.length > 0) && <div className="aviso">⚠️ Sincronização: {meu ? meu.texto : ""}{outros.map((o) => ` · ${o.nome}: ${o.texto}`).join("")}</div>}
      <div className="g2">
        <div className="card"><h3>Hoje por hora</h3><GraficoBarras dados={r.horas} /></div>
        <div className="card"><h3>Últimos 14 dias</h3><GraficoBarras dados={r.dias} destaque={`${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`} /></div>
      </div>
      <div className="g3">
        <div className="card"><h3>Formas de pagamento</h3>{lista(r.formas)}{!Object.keys(r.formas).length && <div className="vazio">—</div>}</div>
        <div className="card"><h3>Por operador</h3>{lista(r.ops)}{!Object.keys(r.ops).length && <div className="vazio">—</div>}</div>
        <div className="card"><h3>Mais vendidos hoje</h3>{r.top.map((t) => <div key={t.nome} className="linha-it"><span>{t.nome} <small className="mut">{num(t.q)}</small></span><b>{brl(t.t)}</b></div>)}{!r.top.length && <div className="vazio">Só vendas por valor até agora.</div>}</div>
      </div>
      <div className="g3">
        <button className="card w100 cartao-link" onClick={() => ir("encomendas")} data-testid="painel-encomendas"><h3>Encomendas</h3>
          <div className="linha-it"><span>Hoje</span><b>{encHoje}</b></div><div className="linha-it"><span>Amanhã</span><b>{encAmanha}</b></div>
          <div className="linha-it"><span>Atrasadas</span><b className={encAtras ? "erro-t" : ""}>{encAtras}</b></div></button>
        <button className="card w100 cartao-link" onClick={() => ir("promocoes")} data-testid="painel-promocoes"><h3>Promoções</h3>
          <div className="linha-it"><span>Sugestões novas</span><b>{sugestoes}</b></div>
          <div className="linha-it"><span>Ativas</span><b>{Object.values(produtos).filter((p) => !p.excluido && promoAtiva(p)).length}</b></div></button>
        <button className="card w100 cartao-link" onClick={() => ir("produtos")}><h3>Estoque baixo ({baixo.length})</h3>
          {baixo.slice(0, 6).map((p) => <div key={p.id} className="linha-it"><span>{p.nome}</span><b className={(custos[p.id]?.estoque ?? 0) < 0 ? "erro-t" : ""}>{num(custos[p.id]?.estoque ?? 0)}</b></div>)}
          {!baixo.length && <div className="vazio">Tudo certo.</div>}</button>
      </div>
      <div className="card"><h3>Aparelhos (últimas 24 h)</h3>
        {ativos.map((a) => { const min = Math.round((Date.now() - Date.parse(a.sync_em!)) / 60000); return (
          <div key={a.uid} className="linha-it"><span><b>{a.nome}</b> {a.operador && <small>👤 {a.operador}</small>}<br /><small className="mut">{a.papel === "admin" ? "Admin" : "Caixa"} · v{a.versao_code}</small></span>
            <span>{(a.pendentes ?? 0) > 0 ? <b className="al-t">{a.pendentes} na fila</b> : "em dia"} · <small className="mut">sinal há {min} min</small></span></div>); })}
        {!ativos.length && <div className="vazio">Nenhum aparelho mandou sinal hoje.</div>}
      </div>
    </div>
  );
}
