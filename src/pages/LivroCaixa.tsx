import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { chaveSemana, diasDoMes, formatarDataHora, formatarDia, hojeChave, zonedParts } from "../lib/datas";
import { RESUMO_VAZIO, resumoOuVazio } from "../lib/agregados";
import { ListaVirtual } from "../components/ListaVirtual";
import { GraficoVendas } from "../components/GraficoVendas";
import { EstadoVazio } from "../components/EstadoVazio";
import { Icone } from "../components/Icone";

const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function LivroCaixa() {
  const { agregados } = useStore();
  const hoje = hojeChave();
  const [sel, setSel] = useState(hoje);
  const parts = zonedParts(sel + "T12:00:00-03:00");
  const [ano, setAno] = useState(parts.year);
  const [mes, setMes] = useState(parts.month);

  const ym = `${ano}-${String(mes).padStart(2, "0")}`;
  const dia = resumoOuVazio(agregados.porDia, sel);
  const semana = resumoOuVazio(agregados.porSemana, chaveSemana(sel + "T12:00:00-03:00"));
  const mesR = resumoOuVazio(agregados.porMes, ym);
  const total = agregados.total ?? RESUMO_VAZIO;
  const listaDia = agregados.porDiaLista.get(sel) ?? [];

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
      <Link to="/relatorios" className="card link-card link-mais" data-testid="atalho-relatorios" style={{ margin: "12px 0" }}>
        <span className="mais-ico"><Icone nome="grafico" size={22} /></span>
        <div className="grow">
          <h3>Relatórios mensais</h3>
          <p className="muted">Total de cada mês, variação e o melhor dia</p>
        </div>
        <span className="mais-seta" aria-hidden="true">›</span>
      </Link>
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
      <div className="card">
        <div className="row"><h3 className="grow">Vendas do dia</h3><strong>{formatarReais(dia.total)}</strong></div>
        <ListaVirtual
          itens={listaDia}
          chave={(v) => v.id}
          altura={360}
          alturaLinha={76}
          vazio={<EstadoVazio icone="venda" titulo="Nenhuma venda neste dia" texto="Toque em outro dia no calendário ou registre uma venda na calculadora." />}
          render={(v) => (
            <div className="item">
              <div>
                <div className="titulo">{formatarReais(v.valor)}</div>
                <div className="muted small">{formatarDataHora(v.criado_em)}</div>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
