// Gráficos simples em SVG (sem biblioteca): linhas por série e barras.
import { brl } from "./lib/util";

export const CORES = ["#1f7a4d", "#d9822b", "#2b6cb0", "#b83280", "#6b46c1", "#c53030", "#2c7a7b", "#975a16"];

export interface Serie { nome: string; cor?: string; pontos: { x: string; y: number }[]; tracejada?: boolean }

/** Linhas com eixo X por data (AAAA-MM-DD). */
export function GraficoLinhas({ series, altura = 220, formatoY = brl }: { series: Serie[]; altura?: number; formatoY?: (v: number) => string }) {
  const xs = [...new Set(series.flatMap((s) => s.pontos.map((p) => p.x)))].sort();
  const ys = series.flatMap((s) => s.pontos.map((p) => p.y));
  if (!xs.length || !ys.length) return <div className="vazio" style={{ padding: 16 }}>Sem dados ainda.</div>;
  const W = 640, H = altura, ml = 56, mr = 12, mt = 10, mb = 28;
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min = min * 0.9; max = max * 1.1 || 1; }
  const pad = (max - min) * 0.08; min = Math.max(0, min - pad); max += pad;
  const px = (x: string) => ml + (xs.length === 1 ? (W - ml - mr) / 2 : (xs.indexOf(x) / (xs.length - 1)) * (W - ml - mr));
  const py = (y: number) => mt + (1 - (y - min) / (max - min)) * (H - mt - mb);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  const rotX = xs.length <= 8 ? xs : xs.filter((_, i) => i % Math.ceil(xs.length / 8) === 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="gráfico">
        {ticks.map((t, i) => <g key={i}><line x1={ml} x2={W - mr} y1={py(t)} y2={py(t)} stroke="#e5e0d5" /><text x={ml - 6} y={py(t) + 4} fontSize="11" textAnchor="end" fill="#6b6b6b">{formatoY(t)}</text></g>)}
        {rotX.map((x) => <text key={x} x={px(x)} y={H - 8} fontSize="11" textAnchor="middle" fill="#6b6b6b">{x.slice(8, 10)}/{x.slice(5, 7)}</text>)}
        {series.map((s, i) => {
          const cor = s.cor ?? CORES[i % CORES.length];
          const pts = [...s.pontos].sort((a, b) => (a.x < b.x ? -1 : 1));
          return (
            <g key={s.nome}>
              <polyline fill="none" stroke={cor} strokeWidth={2.5} strokeDasharray={s.tracejada ? "6 4" : undefined} points={pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} />
              {pts.map((p) => <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r={3.5} fill={cor}><title>{`${s.nome} · ${p.x.slice(8, 10)}/${p.x.slice(5, 7)} · ${formatoY(p.y)}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12.5 }}>
        {series.map((s, i) => <span key={s.nome}><span style={{ display: "inline-block", width: 12, height: 3, background: s.cor ?? CORES[i % CORES.length], verticalAlign: "middle", marginRight: 4 }} />{s.nome}</span>)}
      </div>
    </div>
  );
}

/** Barras verticais com rótulo. */
export function GraficoBarras({ dados, altura = 180, formato = brl, destaque }: { dados: { rotulo: string; valor: number; dica?: string }[]; altura?: number; formato?: (v: number) => string; destaque?: string }) {
  if (!dados.length) return <div className="vazio" style={{ padding: 16 }}>Sem dados ainda.</div>;
  const W = 640, H = altura, mb = 22, mt = 16;
  const max = Math.max(...dados.map((d) => d.valor), 0.01);
  const bw = (W / dados.length) * 0.7;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="gráfico de barras">
      {dados.map((d, i) => {
        const x = (i + 0.15) * (W / dados.length); const h = (d.valor / max) * (H - mb - mt);
        return (
          <g key={d.rotulo}>
            <rect x={x} y={H - mb - h} width={bw} height={Math.max(h, 0)} rx={3} fill={d.rotulo === destaque ? "#d9822b" : "#1f7a4d"}><title>{d.dica ?? `${d.rotulo}: ${formato(d.valor)}`}</title></rect>
            <text x={x + bw / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="#6b6b6b">{d.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}
