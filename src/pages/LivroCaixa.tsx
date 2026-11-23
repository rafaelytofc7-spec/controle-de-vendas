import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { chaveMes, chaveSemana, diasDoMes, formatarDataHora, formatarDia, hojeChave, zonedParts } from "../lib/datas";
import { RESUMO_VAZIO, resumoOuVazio } from "../lib/agregados";
import { ListaVirtual } from "../components/ListaVirtual";
import { GraficoVendas } from "../components/GraficoVendas";
import { EstadoVazio } from "../components/EstadoVazio";
import { nomeDeRegistro, totaisPorPessoa } from "../lib/presenca";

const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function LivroCaixa() {
  const { agregados, membros, vendas } = useStore();
  const hoje = hojeChave();
  const [sel, setSel] = useState(hoje);
  const [pessoa, setPessoa] = useState<string>("todas");
  const parts = zonedParts(sel + "T12:00:00-03:00");
  const [ano, setAno] = useState(parts.year);
  const [mes, setMes] = useState(parts.month);

  const ym = `${ano}-${String(mes).padStart(2, "0")}`;
  const dia = resumoOuVazio(agregados.porDia, sel);
  const semana = resumoOuVazio(agregados.porSemana, chaveSemana(sel + "T12:00:00-03:00"));
  const mesR = resumoOuVazio(agregados.porMes, ym);
  const total = agregados.total ?? RESUMO_VAZIO;
  const listaDiaBruta = agregados.porDiaLista.get(sel) ?? [];
  const listaDia = pessoa === "todas" ? listaDiaBruta : listaDiaBruta.filter((v) => (v.criadoPor || "importado") === pessoa);
  const diaFiltrado = { total: listaDia.reduce((a, v) => a + v.valor, 0), quantidade: listaDia.length };
  const vendasHoje = vendas.filter((v) => !v.excluido && zonedParts(v.criado_em).chaveDia === hoje);
  const vendasMes = vendas.filter((v) => !v.excluido && chaveMes(v.criado_em) === ym);
  const porHoje = totaisPorPessoa(vendasHoje, membros);
  const porMes = totaisPorPessoa(vendasMes, membros);
  const pessoasFiltro = totaisPorPessoa(listaDiaBruta, membros);


  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes]);
  const primeiro = dias[0];
  const pad = (primeiro.getUTCDay() + 6) % 7;

  function mover(delta: number) {
    const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
    setAno(d.getUTCFullYear());
    setMes(d.getUTCMonth() + 1);
  }

  return (
    <div>
      <div className="kpi kpi-painel" data-testid="kpis-caixa">
        <div className="box destaque">
          <div className="lbl">Hoje</div>
          <div className="v">{sel === hoje ? formatarReais(resumoOuVazio(agregados.porDia, hoje).total) : formatarReais(dia.total)}</div>
          <div className="muted small">{sel === hoje ? `${resumoOuVazio(agregados.porDia, hoje).quantidade} venda(s) de hoje` : `Dia selecionado · ${dia.quantidade} venda(s)`}</div>
        </div>
        <div className="box"><div className="lbl">Semana</div><div className="v">{formatarReais(semana.total)}</div><div className="muted small">{semana.quantidade} venda(s)</div></div>
        <div className="box"><div className="lbl">Mês</div><div className="v">{formatarReais(mesR.total)}</div><div className="muted small">{mesR.quantidade} venda(s)</div></div>
        <div className="box"><div className="lbl">Ticket médio</div><div className="v" data-testid="ticket-medio">{formatarReais(dia.ticketMedio)}</div><div className="muted small">do dia selecionado</div></div>
        <div className="box span"><div className="lbl">Total geral</div><div className="v" data-testid="total-geral">{formatarReais(total.total)}</div><div className="muted small" data-testid="qtd-geral">{total.quantidade.toLocaleString("pt-BR")} vendas · ticket médio {formatarReais(total.ticketMedio)}</div></div>
      </div>
      <GraficoVendas porDia={agregados.porDia} />
      <div className="card">
        <div className="mes-nav">
          <button className="btn btn-sm" onClick={() => mover(-1)} aria-label="Mês anterior">‹</button>
          <h3>{new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
          <button className="btn btn-sm" onClick={() => mover(1)} aria-label="Próximo mês">›</button>
        </div>
        <div className="cal">
          {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
          {Array.from({ length: pad }, (_, i) => <div className="day empty" key={`e${i}`} />)}
          {dias.map((d) => {
            const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
            const tot = agregados.porDia.get(chave)?.total ?? 0;
            const cls = ["day", tot > 0 ? "has" : "", chave === sel ? "sel" : "", chave === hoje ? "hoje" : ""].filter(Boolean).join(" ");
            return (
              <button type="button" className={cls} key={chave} onClick={() => setSel(chave)}>
                <span>{d.getUTCDate()}</span>
                {tot > 0 && <span className="tot">{formatarReais(tot).replace("R$", "").trim()}</span>}
              </button>
            );
          })}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>Selecionado: {formatarDia(sel + "T12:00:00-03:00")}</p>
      </div>
      <div className="card" data-testid="vendas-do-dia">
        <div className="row"><h3 className="grow">Vendas do dia</h3><strong>{formatarReais(pessoa === "todas" ? dia.total : diaFiltrado.total)}</strong></div>
        {pessoasFiltro.length > 0 && (
          <div className="filtro-pessoa" data-testid="filtro-pessoa">
            <button type="button" className={pessoa === "todas" ? "btn btn-sm btn-primary" : "btn btn-sm"} onClick={() => setPessoa("todas")}>Todas</button>
            {pessoasFiltro.map((p) => (
              <button type="button" key={p.chave} className={pessoa === p.chave ? "btn btn-sm btn-primary" : "btn btn-sm"} onClick={() => setPessoa(p.chave)}>{p.nome}</button>
            ))}
          </div>
        )}
        <ListaVirtual
          itens={listaDia}
          chave={(v) => v.id}
          altura={360}
          alturaLinha={84}
          vazio={<EstadoVazio icone="venda" titulo="Nenhuma venda neste dia" texto="Toque em outro dia no calendário ou registre uma venda na calculadora." />}
          render={(v) => (
            <div className="item">
              <div className="grow">
                <div className="titulo">{formatarReais(v.valor)}</div>
                <div className="muted small">{formatarDataHora(v.criado_em)} · <span className="autor" data-testid="autor-venda">{nomeDeRegistro(v, membros)}</span></div>
              </div>
            </div>
          )}
        />
        <div className="totais-pessoa" data-testid="totais-pessoa">
          <h3 style={{ marginTop: 12 }}>Por pessoa</h3>
          <p className="muted small">Totais de hoje e do mês, por quem registrou a venda.</p>
          {(porHoje.length === 0 && porMes.length === 0) ? <p className="muted">Ainda não há vendas neste período.</p> : (
            <ul className="lista">
              {[...new Map([...porMes, ...porHoje].map((p) => [p.chave, p.nome])).entries()].map(([chave, nome]) => {
                const h = porHoje.find((x) => x.chave === chave);
                const m = porMes.find((x) => x.chave === chave);
                return (
                  <li key={chave} className="lista-item">
                    <div className="grow">
                      <strong>{nome}</strong>
                      <div className="muted small">Hoje: {h ? `${h.quantidade} · ${formatarReais(h.total)}` : "—"} · Mês: {m ? `${m.quantidade} · ${formatarReais(m.total)}` : "—"}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 16, textAlign: "center" }}>
        <Link to="/relatorios" data-testid="atalho-relatorios">Ver relatórios mensais</Link>
      </p>
    </div>
  );
}
