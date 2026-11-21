import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { formatarDataHora } from "../lib/datas";

const FORMA: Record<string, string> = { debito: "Débito", credito: "Crédito", pix: "Pix" };

export function Cobrancas() {
  const { cobrancas, confirmarCobranca, cancelarCobranca } = useStore();
  const lista = cobrancas.slice(0, 20);
  return (
    <div>
      <div className="card">
        <h3>Cobranças</h3>
        <p className="muted small">Somente registros manuais de teste. Este aplicativo não envia cobranças para Stone ou PicPay e não guarda chaves de pagamento.</p>
      </div>
      <div className="lista" style={{ marginTop: 12 }} data-testid="lista-cobrancas">
        {lista.length === 0 && <p className="muted">Nenhuma cobrança.</p>}
        {lista.map((c) => (
          <div className="item" key={c.id}>
            <div className="grow">
              <div className="titulo">{formatarReais(c.valor)} · {c.provedor} · {FORMA[c.forma] ?? c.forma}</div>
              <div className="muted small">{c.mensagem} {c.modo_teste && <span className="tag warn">teste</span>}</div>
              <div className="muted small">{formatarDataHora(c.criado_em)}</div>
              <span className={`tag ${c.status === "paga" ? "ok" : c.status === "cancelada" ? "bad" : "warn"}`}>{c.status}</span>
            </div>
            {c.status === "aguardando" && (
              <div className="col">
                <button className="btn btn-sm btn-primary" onClick={() => void confirmarCobranca(c.id)}>Pagou</button>
                <button className="btn btn-sm" onClick={() => void cancelarCobranca(c.id)}>Cancelar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
