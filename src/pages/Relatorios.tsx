import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { diasDoMes, hojeChave } from "../lib/datas";
import { RESUMO_VAZIO } from "../lib/agregados";
import {
  anosDoRelatorio,
  avancarMes,
  diasDoMesRelatorio,
  formatarChaveDia,
  formatarMes,
  formatarVariacao,
  intervaloRelatorio,
  montarLinhasMes,
  parseChaveMes,
  semanasDoMesRelatorio,
  totalDoPeriodo,
} from "../lib/relatorio";
import { GraficoBarras } from "../components/GraficoBarras";
import { EstadoVazio } from "../components/EstadoVazio";

const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function Relatorios() {
  const { agregados } = useStore();
  const hoje = hojeChave();
  const [filtro, setFiltro] = useState<"tudo" | string>("tudo");

  const { de, ate } = useMemo(() => intervaloRelatorio(agregados.porMes, hoje), [agregados.porMes, hoje]);
  const todas = useMemo(() => montarLinhasMes(agregados, de, ate), [agregados, de, ate]);
  const anos = useMemo(() => anosDoRelatorio(todas, hoje), [todas, hoje]);
  const linhas = useMemo(
    () => (filtro === "tudo" ? todas : todas.filter((l) => String(l.ano) === filtro)),
    [todas, filtro],
  );
  const periodo = useMemo(() => totalDoPeriodo(linhas), [linhas]);
  const visiveis = useMemo(() => [...linhas].reverse(), [linhas]);
  const rotuloPeriodo = filtro === "tudo" ? "Total geral" : `Total de ${filtro}`;

  return (
    <div data-testid="relatorios">
      <div className="chips" style={{ marginBottom: 12 }} role="tablist" aria-label="Período">
        <button type="button" className={`chip ${filtro === "tudo" ? "on" : ""}`} onClick={() => setFiltro("tudo")}>Tudo</button>
        {anos.map((ano) => (
          <button key={ano} type="button" className={`chip ${filtro === String(ano) ? "on" : ""}`} onClick={() => setFiltro(String(ano))}>{ano}</button>
        ))}
      </div>

      <div className="kpi kpi-painel">
        <div className="box span destaque">
          <div className="lbl">{rotuloPeriodo}</div>
          <div className="v v-grande" data-testid="total-periodo">{formatarReais(periodo.total)}</div>
          <div className="muted small">{periodo.quantidade.toLocaleString("pt-BR")} vendas · ticket médio {formatarReais(periodo.ticketMedio)}</div>
        </div>
      </div>

      {linhas.some((l) => l.total > 0) && (
        <div className="card grafico-card">
          <div className="row">
            <div className="grow">
              <h3>Por mês</h3>
              <p className="muted small">{linhas.length} {linhas.length === 1 ? "mês" : "meses"} no período</p>
            </div>
          </div>
          <GraficoBarras
            itens={linhas.map((l) => ({ chave: l.chave, rotulo: l.rotuloCurto, total: l.total, qtd: l.quantidade }))}
            ariaLabel="Gráfico dos totais mensais"
          />
        </div>
      )}

      <div className="lista-meses" data-testid="lista-meses">
        {visiveis.length === 0 && (
          <EstadoVazio icone="grafico" titulo="Nenhum mês neste período" texto="Registre vendas ou escolha outro filtro." />
        )}
        {visiveis.map((l) => (
          <Link key={l.chave} to={`/relatorios/${l.chave}`} className="card mes-card" data-testid={`mes-${l.chave}`}>
            <div className="row">
              <h3 className="grow mes-titulo" style={{ textTransform: "none" }}>{l.rotulo}</h3>
              <span className={`var ${l.variacao == null ? "" : l.variacao > 0 ? "up" : l.variacao < 0 ? "down" : ""}`}>
                {formatarVariacao(l.variacao)}
              </span>
            </div>
            <div className="v v-mes">{formatarReais(l.total)}</div>
            <div className="muted small">
              {l.quantidade.toLocaleString("pt-BR")} vendas · ticket {formatarReais(l.ticketMedio)}
              {l.melhorDia ? ` · melhor dia ${formatarChaveDia(l.melhorDia)} (${formatarReais(l.melhorTotal ?? 0)})` : ""}
            </div>
            <span className="mais-seta mes-seta" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function RelatorioMes() {
  const { agregados } = useStore();
  const nav = useNavigate();
  const raw = useParams().mes ?? "";
  const parsed = parseChaveMes(raw);
  const [aba, setAba] = useState<"dias" | "semanas">("dias");
  const hoje = hojeChave();

  const linha = useMemo(() => {
    if (!parsed) return null;
    const { de, ate } = intervaloRelatorio(agregados.porMes, hoje);
    const base = de <= raw && raw <= ate ? montarLinhasMes(agregados, de, ate) : montarLinhasMes(agregados, raw, raw);
    return base.find((l) => l.chave === raw) ?? montarLinhasMes(agregados, raw, raw)[0] ?? null;
  }, [agregados, raw, parsed, hoje]);

  const dias = useMemo(() => (parsed ? diasDoMesRelatorio(agregados, raw) : []), [agregados, raw, parsed]);
  const semanas = useMemo(() => (parsed ? semanasDoMesRelatorio(agregados, raw) : []), [agregados, raw, parsed]);
  const diasCal = useMemo(() => (parsed ? diasDoMes(parsed.ano, parsed.mes) : []), [parsed]);
  const maxDia = useMemo(() => Math.max(...dias.map((d) => d.total), 1), [dias]);

  if (!parsed || !linha) {
    return (
      <div>
        <EstadoVazio icone="grafico" titulo="Mês inválido" texto="Volte aos relatórios e escolha um mês da lista." acao={<Link className="btn btn-primary" to="/relatorios">Relatórios</Link>} />
      </div>
    );
  }

  const pad = (diasCal[0].getUTCDay() + 6) % 7;
  const r = agregados.porMes.get(raw) ?? RESUMO_VAZIO;

  return (
    <div data-testid="relatorio-mes">
      <div className="mes-nav">
        <button className="btn btn-sm" onClick={() => nav(`/relatorios/${avancarMes(raw, -1)}`)} aria-label="Mês anterior">‹</button>
        <h3 style={{ textTransform: "none" }}>{linha.rotulo}</h3>
        <button className="btn btn-sm" onClick={() => nav(`/relatorios/${avancarMes(raw, 1)}`)} aria-label="Próximo mês">›</button>
      </div>

      <div className="kpi kpi-painel">
        <div className="box span destaque">
          <div className="lbl">Total do mês</div>
          <div className="v v-grande" data-testid="total-mes">{formatarReais(r.total)}</div>
          <div className="muted small">
            {r.quantidade.toLocaleString("pt-BR")} vendas · ticket médio {formatarReais(r.ticketMedio)}
            {linha.variacao != null && <> · {formatarVariacao(linha.variacao)} vs mês anterior</>}
          </div>
        </div>
        {linha.melhorDia && (
          <div className="box span">
            <div className="lbl">Melhor dia</div>
            <div className="v">{formatarReais(linha.melhorTotal ?? 0)}</div>
            <div className="muted small">{formatarChaveDia(linha.melhorDia)}</div>
          </div>
        )}
      </div>

      <div className="card grafico-card">
        <div className="row">
          <h3 className="grow">{aba === "dias" ? "Por dia" : "Por semana"}</h3>
          <div className="seg">
            <button type="button" className={aba === "dias" ? "on" : ""} onClick={() => setAba("dias")}>Dias</button>
            <button type="button" className={aba === "semanas" ? "on" : ""} onClick={() => setAba("semanas")}>Semanas</button>
          </div>
        </div>
        {aba === "dias" ? (
          <GraficoBarras
            itens={dias.map((d) => ({ chave: d.chave, rotulo: String(d.dia), total: d.total, qtd: d.quantidade }))}
            ariaLabel={`Gráfico diário de ${linha.rotulo}`}
          />
        ) : (
          <GraficoBarras
            itens={semanas.map((s) => ({ chave: s.chave, rotulo: s.rotulo.replace("Semana de ", ""), total: s.total, qtd: s.quantidade }))}
            ariaLabel={`Gráfico semanal de ${linha.rotulo}`}
          />
        )}
      </div>

      {aba === "dias" && (
        <div className="card">
          <h3>Calendário</h3>
          <div className="cal heatmap">
            {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
            {Array.from({ length: pad }, (_, i) => <div className="day empty" key={`e${i}`} />)}
            {diasCal.map((d) => {
              const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
              const tot = agregados.porDia.get(chave)?.total ?? 0;
              const nivel = tot <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((tot / maxDia) * 4)));
              const cls = ["day", tot > 0 ? "has" : "", `h${nivel}`, chave === hoje ? "hoje" : ""].filter(Boolean).join(" ");
              return (
                <div className={cls} key={chave} title={`${formatarChaveDia(chave)}: ${formatarReais(tot)}`}>
                  <span>{d.getUTCDate()}</span>
                  {tot > 0 && <span className="tot">{formatarReais(tot).replace("R$", "").trim()}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="lista" style={{ marginTop: 12 }} data-testid={aba === "dias" ? "lista-dias" : "lista-semanas"}>
        {aba === "dias"
          ? dias.filter((d) => d.quantidade > 0).slice().reverse().map((d) => (
            <div className="item" key={d.chave}>
              <div className="grow">
                <div className="titulo">{formatarChaveDia(d.chave)}</div>
                <div className="muted small">{d.quantidade.toLocaleString("pt-BR")} vendas · ticket {formatarReais(d.ticketMedio)}</div>
              </div>
              <strong className="num-lista">{formatarReais(d.total)}</strong>
            </div>
          ))
          : semanas.map((s) => (
            <div className="item" key={s.chave}>
              <div className="grow">
                <div className="titulo">{s.rotulo}</div>
                <div className="muted small">{s.quantidade.toLocaleString("pt-BR")} vendas · ticket {formatarReais(s.ticketMedio)}</div>
              </div>
              <strong className="num-lista">{formatarReais(s.total)}</strong>
            </div>
          ))}
        {aba === "dias" && dias.every((d) => d.quantidade === 0) && (
          <EstadoVazio icone="venda" titulo="Nenhuma venda neste mês" texto="Quando houver registros, os dias aparecem aqui." />
        )}
      </div>

      <p className="muted small" style={{ marginTop: 14 }}>
        <Link to="/relatorios">← Todos os meses</Link>
      </p>
    </div>
  );
}
