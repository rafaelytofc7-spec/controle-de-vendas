import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import {
  HISTORICO_EXPIRA_MS, acrescentarDigito, apagarUltimoDigito, calcular, digitsParaValor,
  formatarReais, historicoVigente, somarValores, troco, type Operador, valorParaDigits,
} from "../lib/dinheiro";
import { formatarDataHora, mesmoDia, hojeChave } from "../lib/datas";
import { useConfirmar } from "../components/Dialogo";
import { resumoDia } from "../lib/faturamento";

const CHAVES = [5, 10, 20, 50, 100];

export function Calculadora() {
  const { vendas, registrarVenda, excluirVenda, registrarCobranca, confirmarCobranca, cancelarCobranca, cobrancas } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [digits, setDigits] = useState("");
  const [acumulado, setAcumulado] = useState<number | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [recebido, setRecebido] = useState("");
  const [historico, setHistorico] = useState<{ valor: number; em: number }[]>([]);
  const [agora, setAgora] = useState(Date.now());
  const [cobrando, setCobrando] = useState(false);
  const [cobrancaAtual, setCobrancaAtual] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const vigentes = useMemo(() => historicoVigente(historico, agora), [historico, agora]);
  const somaHist = somarValores(vigentes.map((h) => h.valor));
  const valor = digitsParaValor(digits);
  const rec = Number(recebido.replace(/\./g, "").replace(",", ".")) || 0;
  const tco = troco(valor, rec);
  const hoje = resumoDia(vendas, hojeChave());
  const vendasHoje = vendas.filter((v) => mesmoDia(v.criado_em, hojeChave()));
  const cob = cobrancas.find((c) => c.id === cobrancaAtual);

  function digito(d: string) {
    setDigits((x) => acrescentarDigito(x, d));
  }
  function apagar() { setDigits((x) => apagarUltimoDigito(x)); }
  function limpar() { setDigits(""); setAcumulado(null); setOperador(null); setRecebido(""); }

  async function aplicarOp(op: Operador) {
    if (op === "*" && valor > 0) {
      const ok = await confirmar({
        titulo: "Multiplicar mesmo?",
        descricao: `${formatarReais(valor)} vai ser multiplicado pelo próximo número.`,
        confirmar: "Multiplicar",
      });
      if (!ok) return;
    }
    if (acumulado != null && operador && digits) {
      const r = calcular(acumulado, valor, operador);
      setAcumulado(r); setDigits(""); setOperador(op);
    } else if (digits) {
      setAcumulado(valor); setDigits(""); setOperador(op);
    } else {
      setOperador(op);
    }
  }

  function igual() {
    if (acumulado != null && operador) {
      const r = calcular(acumulado, valor, operador);
      setDigits(valorParaDigits(r));
      setAcumulado(null); setOperador(null);
    }
  }

  async function registrar() {
    const v = (acumulado != null && !digits && operador == null) ? acumulado : valor;
    if (v <= 0) return;
    await registrarVenda(v);
    setHistorico((h) => [{ valor: v, em: Date.now() }, ...h]);
    limpar();
  }

  async function abrirCobranca(provedor: "stone" | "picpay" | "manual", forma: "debito" | "credito" | "pix") {
    const v = valor;
    if (v <= 0) return;
    const c = await registrarCobranca(v, provedor, forma);
    setCobrancaAtual(c.id);
  }

  return (
    <div>
      {dialogo}
      <div className="calc-display">
        <div className="lbl">{operador ? `Conta ${operador}` : "Total da venda"} · {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</div>
        <div className="valor" data-testid="calc-valor">{formatarReais(valor)}</div>
      </div>
      <div className="calc-grid">
        {["7","8","9"].map((d) => <button key={d} className="btn" onClick={() => digito(d)}>{d}</button>)}
        <button className="btn op" onClick={() => void aplicarOp("+")}>+</button>
        {["4","5","6"].map((d) => <button key={d} className="btn" onClick={() => digito(d)}>{d}</button>)}
        <button className="btn op" onClick={() => void aplicarOp("-")}>−</button>
        {["1","2","3"].map((d) => <button key={d} className="btn" onClick={() => digito(d)}>{d}</button>)}
        <button className="btn op" onClick={() => void aplicarOp("*")}>×</button>
        <button className="btn" onClick={() => digito("0")}>0</button>
        <button className="btn" onClick={apagar} aria-label="Apagar último dígito">⌫</button>
        <button className="btn" onClick={igual}>=</button>
        <button className="btn op" onClick={() => void aplicarOp("/")}>÷</button>
      </div>
      <div className="troco-row">
        <label className="field">Recebido
          <input className="input num" inputMode="decimal" placeholder="0,00" value={recebido} onChange={(e) => setRecebido(e.target.value.replace(/[^0-9,.]/g, ""))} />
        </label>
        <label className="field">{rec && tco < 0 ? "Falta" : "Troco"}
          <div className="input num" style={{ display: "flex", alignItems: "center", fontWeight: 700 }}>{formatarReais(tco)}</div>
        </label>
      </div>
      <div className="chip-row">
        {CHAVES.map((n) => (
          <button key={n} className="chip" onClick={() => setRecebido(String(n).replace(".", ",") )}>R$ {n}</button>
        ))}
      </div>
      <div className="row wrap" style={{ margin: "12px 0" }}>
        <button className="btn grow" onClick={limpar}>Limpar</button>
        <button className="btn btn-primary grow" data-testid="registrar-venda" disabled={valor <= 0} onClick={() => void registrar()}>Registrar venda</button>
      </div>
      <div className="card">
        <h3>Cobrança manual</h3>
        <p className="muted small">Somente registro local de teste. Não envia nada para Stone ou PicPay.</p>
        {cob && cob.status === "aguardando" ? (
          <div className="col">
            <p>{cob.provedor} · {cob.forma} · <strong>{formatarReais(cob.valor)}</strong></p>
            <div className="row">
              <button className="btn btn-primary grow" onClick={() => void confirmarCobranca(cob.id).then(() => { setCobrancaAtual(null); limpar(); })}>Pagou</button>
              <button className="btn grow" onClick={() => void cancelarCobranca(cob.id).then(() => setCobrancaAtual(null))}>Cancelar</button>
            </div>
          </div>
        ) : cobrando ? (
          <div className="col">
            {(["manual", "stone", "picpay"] as const).map((p) => (
              <div key={p} className="col">
                <strong style={{ textTransform: "capitalize" }}>{p === "manual" ? "Manual" : p}</strong>
                <div className="row">
                  <button className="btn grow" disabled={valor <= 0} onClick={() => void abrirCobranca(p, "debito")}>Débito</button>
                  <button className="btn grow" disabled={valor <= 0} onClick={() => void abrirCobranca(p, "credito")}>Crédito</button>
                  <button className="btn grow" disabled={valor <= 0} onClick={() => void abrirCobranca(p, "pix")}>Pix</button>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => setCobrando(false)}>Fechar</button>
          </div>
        ) : (
          <button className="btn btn-block" disabled={valor <= 0} onClick={() => setCobrando(true)}>Cartão ou Pix (manual)</button>
        )}
      </div>
      {vigentes.length > 0 && (
        <div className="card">
          <div className="row"><h3 className="grow">Últimos números</h3><span className="muted small">somem em 5 min</span></div>
          <div className="chip-row">
            {vigentes.map((h, i) => (
              <button key={`${h.em}-${i}`} className="chip" onClick={() => setDigits(valorParaDigits(h.valor))}>{formatarReais(h.valor)}</button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">Soma</span>
            <strong className="grow right">{formatarReais(somaHist)}</strong>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => setDigits(valorParaDigits(somaHist))}>Usar soma</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setHistorico([])}>Limpar</button>
          </div>
        </div>
      )}
      <div className="card">
        <div className="row"><h3 className="grow">Vendas de hoje</h3><strong data-testid="total-hoje">{formatarReais(hoje.total)}</strong></div>
        <p className="muted small">{hoje.quantidade} venda(s) · ticket médio {formatarReais(hoje.ticketMedio)}</p>
        <div className="lista" style={{ marginTop: 8 }}>
          {vendasHoje.length === 0 && <p className="muted">Nenhuma venda registrada hoje.</p>}
          {vendasHoje.map((v) => (
            <div className="item" key={v.id}>
              <div>
                <div className="titulo">{formatarReais(v.valor)}</div>
                <div className="muted small">{formatarDataHora(v.criado_em)}</div>
              </div>
              <button className="btn btn-sm btn-ghost" aria-label="Excluir venda" onClick={async () => {
                const ok = await confirmar({ titulo: "Apagar esta venda?", descricao: `A venda de ${formatarReais(v.valor)} será removida do livro caixa.`, confirmar: "Apagar", destrutivo: true });
                if (ok) await excluirVenda(v.id);
              }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
