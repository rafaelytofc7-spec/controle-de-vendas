import { useMemo, useState } from "react";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { chaveMes, chaveSemana, diasDoMes, formatarDia, hojeChave, zonedParts } from "../lib/datas";
import { resumoDia, resumoMes, resumoSemana, resumoTotal, totaisPorDia } from "../lib/faturamento";

const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function LivroCaixa() {
  const { vendas } = useStore();
  const hoje = hojeChave();
  const [sel, setSel] = useState(hoje);
  const parts = zonedParts(sel + "T12:00:00-03:00");
  const [ano, setAno] = useState(parts.year);
  const [mes, setMes] = useState(parts.month);

  const totais = useMemo(() => totaisPorDia(vendas), [vendas]);
  const ym = `${ano}-${String(mes).padStart(2, "0")}`;
  const dia = resumoDia(vendas, sel);
  const semana = resumoSemana(vendas, chaveSemana(sel + "T12:00:00-03:00"));
  const mesR = resumoMes(vendas, ym);
  const total = resumoTotal(vendas);

  const dias = diasDoMes(ano, mes);
  const primeiro = dias[0];
  // Monday start: JS getUTCDay 0=Sun
  const pad = (primeiro.getUTCDay() + 6) % 7;

  function mover(delta: number) {
    const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
    setAno(d.getUTCFullYear());
    setMes(d.getUTCMonth() + 1);
  }

  return (
    <div>
      <div className="kpi" data-testid="kpis-caixa">
        <div className="box"><div className="lbl">Dia</div><div className="v">{formatarReais(dia.total)}</div><div className="muted small">{dia.quantidade} venda(s)</div></div>
        <div className="box"><div className="lbl">Semana</div><div className="v">{formatarReais(semana.total)}</div><div className="muted small">{semana.quantidade} venda(s)</div></div>
        <div className="box"><div className="lbl">Mês</div><div className="v">{formatarReais(mesR.total)}</div><div className="muted small">{mesR.quantidade} venda(s)</div></div>
        <div className="box"><div className="lbl">Ticket médio</div><div className="v" data-testid="ticket-medio">{formatarReais(dia.ticketMedio)}</div><div className="muted small">do dia selecionado</div></div>
        <div className="box span"><div className="lbl">Total geral</div><div className="v" data-testid="total-geral">{formatarReais(total.total)}</div><div className="muted small">{total.quantidade} vendas · ticket médio {formatarReais(total.ticketMedio)}</div></div>
      </div>
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
            const tot = totais.get(chave) ?? 0;
            const cls = ["day", tot > 0 ? "has" : "", chave === sel ? "sel" : ""].filter(Boolean).join(" ");
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
    </div>
  );
}
