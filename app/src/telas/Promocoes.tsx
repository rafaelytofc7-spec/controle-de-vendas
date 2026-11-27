import { useMemo, useState } from "react";
import { useLoja, enfileirar, relatorioAgora } from "../lib/loja";
import { toast } from "../comum";
import { emoji, promoAtiva } from "../lib/produtos";
import { brl, dataHoraSP, diaSP, lerNumero, pct } from "../lib/util";

/** Sugestões de promoção (geradas toda madrugada) e promoções ativas. Só Admin aplica. */
export default function Promocoes() {
  const promocoes = useLoja((e) => e.promocoes);
  const produtos = useLoja((e) => e.produtos);
  const papel = useLoja((e) => e.papel);
  const [rodando, setRodando] = useState(false);
  const lim = diaSP(new Date(Date.now() - 3 * 86400_000));
  const novas = useMemo(() => {
    const m = new Map<string, (typeof promocoes)[string]>();
    for (const p of Object.values(promocoes).sort((a, b) => a.dia.localeCompare(b.dia))) if (p.dia >= lim && produtos[p.produto_id]) m.set(p.produto_id, p);
    return [...m.values()].filter((p) => p.status === "nova" && !promoAtiva(produtos[p.produto_id]));
  }, [promocoes, produtos, lim]);
  const ativas = Object.values(produtos).filter((p) => !p.excluido && promoAtiva(p));
  if (papel !== "admin") return <div className="vazio">Só o Admin aplica promoções. As promoções ativas já aparecem com o preço certo no caixa.</div>;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <p className="peq-t mut" style={{ margin: 0 }}>Sugestões geradas toda madrugada: produto parado, estoque alto ou perto de vencer. Nunca abaixo de 10% de margem.</p>
        <button className="btn b-claro" disabled={rodando} data-testid="atualizar-sugestoes" onClick={async () => { setRodando(true); try { await relatorioAgora(); toast("Sugestões atualizadas"); } catch (e) { toast((e as Error).message); } finally { setRodando(false); } }}>{rodando ? "Calculando…" : "Atualizar agora"}</button>
      </div>
      <div className="card"><h3>Sugestões ({novas.length})</h3>
        {novas.length === 0 && <div className="vazio">Nenhuma sugestão agora.</div>}
        {novas.map((s) => <Sugestao key={s.produto_id} s={s} />)}
      </div>
      <div className="card"><h3>Promoções ativas ({ativas.length})</h3>
        {ativas.map((p) => (
          <div key={p.id} className="linha-it" data-testid="promo-ativa">
            <span>{emoji(p.nome)} <b>{p.nome}</b> <s className="mut">{brl(p.preco)}</s> <b>{brl(p.preco_promocional)}</b><br /><small className="mut">até {p.promo_expira_em ? dataHoraSP(p.promo_expira_em) : "sem fim"}</small></span>
            <button className="btn peq b-claro" onClick={() => enfileirar("promocao", { produto_id: p.id, preco: null })}>Encerrar</button>
          </div>))}
        {ativas.length === 0 && <div className="vazio">Nenhuma promoção ativa.</div>}
      </div>
    </>
  );
}

function Sugestao({ s }: { s: { dia: string; produto_id: string; motivos: { tipo: string; texto: string }[]; preco_atual: number | null; preco_sugerido: number | null; margem_resultante: number | null } }) {
  const p = useLoja((e) => e.produtos[s.produto_id]);
  const [preco, setPreco] = useState(String(s.preco_sugerido ?? "").replace(".", ","));
  const [dias, setDias] = useState(3);
  if (!p) return null;
  return (
    <div className="linha-it" data-testid="sugestao" style={{ alignItems: "flex-start" }}>
      <span style={{ flex: 1 }}>{emoji(p.nome)} <b>{p.nome}</b><br />
        <small>{s.motivos.map((m) => m.texto).join(" · ")}</small><br />
        <small className="mut">de {brl(s.preco_atual)} por {brl(s.preco_sugerido)}{s.margem_resultante != null ? ` · margem ${pct(Number(s.margem_resultante))}` : ""}</small></span>
      <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <span className="row"><input className="input" style={{ width: 80, marginTop: 0 }} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} aria-label="Preço da promoção" />
          <select className="input" style={{ width: 80, marginTop: 0 }} value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Dias">{[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d} dia{d > 1 ? "s" : ""}</option>)}</select></span>
        <span className="row">
          <button className="btn peq b-claro" onClick={() => enfileirar("responder_promocao", { dia: s.dia, produto_id: s.produto_id, status: "ignorada" })} data-testid="ignorar-sugestao">Ignorar</button>
          <button className="btn peq b-folha" data-testid="aplicar-sugestao" onClick={() => {
            const v = lerNumero(preco); if (!v || v <= 0) { toast("Preço inválido"); return; }
            enfileirar("promocao", { produto_id: s.produto_id, preco: v, dias, dia_sugestao: s.dia }); toast(`${p.nome} em promoção por ${dias} dia(s)`);
          }}>Aplicar</button></span>
      </span>
    </div>
  );
}
