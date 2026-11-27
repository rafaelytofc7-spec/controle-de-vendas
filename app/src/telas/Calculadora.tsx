import { useLoja } from "../lib/loja";
import { margemDe, precoParaMargem, precoSugerido, arredondar } from "../lib/calc";
import { brl, pct, r2 } from "../lib/util";

/** Margem desejada (controle deslizante) → preço sugerido. */
export function Calculadora({ custo, precoAtual, margem, setMargem, unidade, estoque }: {
  custo: number | null; precoAtual: number; margem: number; setMargem: (m: number) => void; unidade: string; estoque?: number;
}) {
  const cfg = useLoja((e) => e.config);
  const arred = cfg?.arredondamento ?? "49_99";
  const modo = cfg?.modo_margem ?? "venda";
  const sugerido = precoSugerido(custo, margem, arred, modo);
  const margemAtual = margemDe(precoAtual, custo, modo);
  return (
    <div data-testid="calculadora">
      <div className="sec">Margem de lucro desejada: <span data-testid="margem">{margem}%</span></div>
      <input type="range" min={0} max={80} step={1} value={margem} onChange={(e) => setMargem(Number(e.target.value))} aria-label="Margem desejada" data-testid="margem-slider" />
      <div>{[25, 30, 35, 40, 50].map((m) => <button key={m} className={`chip ${m === margem ? "on" : ""}`} onClick={() => setMargem(m)}>{m}%</button>)}</div>
      <div className="res" style={{ marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--folha-2)" }}>PREÇO SUGERIDO</div>
          <div className="big" data-testid="preco-sugerido">{sugerido == null ? "—" : `${brl(sugerido)}`}<small style={{ fontSize: 14 }}>{sugerido != null ? ` /${unidade}` : ""}</small></div>
          {custo == null && <div className="peq-t mut">Sem custo ainda: registre uma entrada de mercadoria.</div>}
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          atual <b>{brl(precoAtual)}</b><br />
          margem atual <b className={margemAtual != null && margemAtual < margem - 5 ? "dn" : ""}>{pct(margemAtual)}</b><br />
          {custo != null && <>custo <b>{brl(r2(custo))}</b></>}
        </div>
      </div>
      {custo != null && (
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Margem</th><th className="n">Preço</th><th className="n">Lucro/{unidade}</th>{estoque != null && estoque > 0 && <th className="n">No estoque</th>}</tr></thead>
          <tbody>
            {[25, 30, 35, 40, 50].map((m) => {
              const p = arredondar(precoParaMargem(custo, m, modo), arred);
              return (
                <tr key={m} style={m === margem ? { background: "var(--folha-clara)", fontWeight: 800 } : undefined}>
                  <td>{m}%</td><td className="n">{brl(p)}</td><td className="n">{brl(r2(p - custo))}</td>
                  {estoque != null && estoque > 0 && <td className="n">{brl(r2((p - custo) * estoque))}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="peq-t mut" style={{ marginTop: 6 }}>
        {modo === "venda" ? "Margem sobre a venda: preço = custo ÷ (1 − margem)." : "Markup: preço = custo × (1 + margem)."} Arredondado para {arred === "49_99" ? ",49 ou ,99" : arred === "x9" ? ",x9" : "centavos"}.
      </div>
    </div>
  );
}
