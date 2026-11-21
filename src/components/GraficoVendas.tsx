import { useMemo, useState } from "react";
import { hojeChave } from "../lib/datas";
import { formatarReais } from "../lib/dinheiro";
import type { ResumoPeriodo } from "../lib/faturamento";
import { RESUMO_VAZIO } from "../lib/agregados";

function chavesCivis(n: number, hoje = hojeChave()): string[] {
  const [y, m, d] = hoje.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

export function GraficoVendas({ porDia }: { porDia: Map<string, ResumoPeriodo> }) {
  const [janela, setJanela] = useState<7 | 30>(7);
  const pontos = useMemo(() => {
    return chavesCivis(janela).map((chave) => {
      const r = porDia.get(chave) ?? RESUMO_VAZIO;
      return { chave, total: r.total, qtd: r.quantidade, dia: chave.slice(8) };
    });
  }, [porDia, janela]);
  const max = Math.max(...pontos.map((p) => p.total), 1);
  const soma = pontos.reduce((a, p) => a + p.total, 0);
  const w = 100, h = 56, gap = janela === 7 ? 2.2 : 0.7;
  const bw = (w - gap * (pontos.length - 1)) / pontos.length;

  return (
    <div className="card grafico-card">
      <div className="row">
        <div className="grow">
          <h3>Vendas recentes</h3>
          <p className="muted small">{janela === 7 ? "Últimos 7 dias" : "Últimos 30 dias"} · {formatarReais(soma)}</p>
        </div>
        <div className="seg">
          <button type="button" className={janela === 7 ? "on" : ""} onClick={() => setJanela(7)}>7 dias</button>
          <button type="button" className={janela === 30 ? "on" : ""} onClick={() => setJanela(30)}>30 dias</button>
        </div>
      </div>
      <svg className="grafico-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Gráfico dos últimos ${janela} dias`}>
        {pontos.map((p, i) => {
          const bar = Math.max(p.total > 0 ? 3 : 1.2, (p.total / max) * (h - 10));
          const x = i * (bw + gap);
          return (
            <g key={p.chave}>
              <title>{`${p.chave}: ${formatarReais(p.total)} · ${p.qtd} venda(s)`}</title>
              <rect x={x} y={h - 8 - bar} width={bw} height={bar} rx={1.1} className={p.total > 0 ? "bar" : "bar vazia"} />
              {(janela === 7 || i % 5 === 0 || i === pontos.length - 1) && (
                <text x={x + bw / 2} y={h - 1.5} textAnchor="middle" className="lbl">{p.dia}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
