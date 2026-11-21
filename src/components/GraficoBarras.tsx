import { formatarReais } from "../lib/dinheiro";

export interface BarraItem {
  chave: string;
  rotulo: string;
  total: number;
  qtd?: number;
}

export function GraficoBarras({
  itens,
  ariaLabel,
  altura = 56,
}: {
  itens: BarraItem[];
  ariaLabel: string;
  altura?: number;
}) {
  if (itens.length === 0) return null;
  const max = Math.max(...itens.map((p) => p.total), 1);
  const w = 100;
  const h = altura;
  const gap = itens.length <= 8 ? 2.2 : itens.length <= 16 ? 1.2 : 0.6;
  const bw = (w - gap * (itens.length - 1)) / itens.length;
  const rotular = itens.length <= 14 || itens.length <= 31;

  return (
    <svg className="grafico-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel}>
      {itens.map((p, i) => {
        const bar = Math.max(p.total > 0 ? 3 : 1.2, (p.total / max) * (h - 12));
        const x = i * (bw + gap);
        const mostrar = rotular && (itens.length <= 12 || i % Math.ceil(itens.length / 8) === 0 || i === itens.length - 1);
        return (
          <g key={p.chave}>
            <title>{`${p.rotulo}: ${formatarReais(p.total)}${p.qtd != null ? ` · ${p.qtd} venda(s)` : ""}`}</title>
            <rect x={x} y={h - 10 - bar} width={bw} height={bar} rx={1.1} className={p.total > 0 ? "bar" : "bar vazia"} />
            {mostrar && (
              <text x={x + bw / 2} y={h - 1.5} textAnchor="middle" className="lbl">{p.rotulo}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
