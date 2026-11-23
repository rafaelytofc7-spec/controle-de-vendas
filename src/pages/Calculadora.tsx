import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import {
  acrescentarDigito, apagarUltimoDigito, calcular, digitsParaValor,
  formatarReais, historicoVigente, somarValores, troco, type Operador, valorParaDigits,
} from "../lib/dinheiro";
import { formatarDataHora, hojeChave } from "../lib/datas";
import { resumoOuVazio } from "../lib/agregados";
import { useConfirmar } from "../components/Dialogo";
import { ListaVirtual } from "../components/ListaVirtual";
import type { Venda } from "../lib/types";
import { EstadoVazio } from "../components/EstadoVazio";
import { Link } from "react-router-dom";
import { encomendaAtrasada, statusDeEncomenda } from "../lib/encomendas";
import { nomeDeRegistro } from "../lib/presenca";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { BotaoLeitor } from "../components/BotaoLeitor";
import { interpretarLeituraVenda } from "../lib/codigoBarras";
import { gerarId } from "../lib/importacao";
import { agoraIso } from "../lib/datas";

const CHAVES = [5, 10, 20, 50, 100];

const PainelTroco = memo(function PainelTroco({ valor }: { valor: number }) {
  const [recebido, setRecebido] = useState("");
  const rec = Number(recebido.replace(/\./g, "").replace(",", ".")) || 0;
  const tco = troco(valor, rec);
  return (
    <div className="troco-card">
      <div className="troco-row">
        <label className="field">Recebido
          <input
            className="input num"
            data-testid="recebido"
            inputMode="decimal"
            placeholder="0,00"
            value={recebido}
            onChange={(e) => setRecebido(e.target.value.replace(/[^0-9,.]/g, ""))}
          />
        </label>
        <label className="field">{rec && tco < 0 ? "Falta" : "Troco"}
          <div className="troco-valor">{formatarReais(tco)}</div>
        </label>
      </div>
      <div className="chip-row">
        {CHAVES.map((n) => (
          <button type="button" key={n} className="chip" onClick={() => setRecebido(String(n))}>R$ {n}</button>
        ))}
      </div>
    </div>
  );
});

const ItemVendaHoje = memo(function ItemVendaHoje({
  venda, onExcluir, autor,
}: { venda: Venda; onExcluir: (v: Venda) => void; autor: string }) {
  return (
    <div className="item">
      <div>
        <div className="titulo">{formatarReais(venda.valor)}</div>
        <div className="muted small">{formatarDataHora(venda.criado_em)} · <span className="autor">{autor}</span></div>
      </div>
      <button className="btn btn-sm btn-ghost" aria-label="Excluir venda" onClick={() => onExcluir(venda)}>✕</button>
    </div>
  );
});

export function Calculadora() {
  const { agregados, registrarVenda, excluirVenda, registrarCobranca, confirmarCobranca, cancelarCobranca, cobrancas, encomendas, membros, produtos, salvarProduto } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [digits, setDigits] = useState("");
  const [acumulado, setAcumulado] = useState<number | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [historico, setHistorico] = useState<{ valor: number; em: number }[]>([]);
  const [agora, setAgora] = useState(Date.now());
  const [cobrando, setCobrando] = useState(false);
  const [cobrancaAtual, setCobrancaAtual] = useState<string | null>(null);
  const [avisoScan, setAvisoScan] = useState("");
  const [cadastroScan, setCadastroScan] = useState<{ codigo: string; nome: string; preco: string; unidade: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const vigentes = useMemo(() => historicoVigente(historico, agora), [historico, agora]);
  const somaHist = useMemo(() => somarValores(vigentes.map((h) => h.valor)), [vigentes]);
  const valor = digitsParaValor(digits);
  const chaveHoje = hojeChave();
  const hoje = resumoOuVazio(agregados.porDia, chaveHoje);
  const vendasHoje = agregados.porDiaLista.get(chaveHoje) ?? [];
  const cob = cobrancas.find((c) => c.id === cobrancaAtual);

  const digito = useCallback((d: string) => setDigits((x) => acrescentarDigito(x, d)), []);
  const apagar = useCallback(() => setDigits((x) => apagarUltimoDigito(x)), []);
  const limpar = useCallback(() => { setDigits(""); setAcumulado(null); setOperador(null); }, []);

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

  async function pedirExclusao(v: Venda) {
    const ok = await confirmar({
      titulo: "Apagar esta venda?",
      descricao: `A venda de ${formatarReais(v.valor)} será removida do livro caixa.`,
      confirmar: "Apagar",
      destrutivo: true,
    });
    if (ok) await excluirVenda(v.id);
  }


  function aplicarPrecoLido(preco: number) {
    const base = (acumulado != null && operador) ? calcular(acumulado, valor, operador) : valor;
    const total = base + preco;
    setDigits(valorParaDigits(total));
    setAcumulado(null);
    setOperador(null);
  }

  async function lerProduto() {
    setAvisoScan("");
    try {
      const lido = await lerCodigoBarras();
      if (!lido) return;
      const r = interpretarLeituraVenda(produtos, lido);
      if (r.tipo === "invalido") { setAvisoScan("Não foi possível ler o código."); return; }
      if (r.tipo === "por_kg") {
        setAvisoScan(`“${r.produto.nome}” é vendido por quilo. Use a calculadora para informar o peso.`);
        return;
      }
      if (r.tipo === "desconhecido") {
        setCadastroScan({ codigo: r.codigo, nome: "", preco: "", unidade: "un" });
        return;
      }
      aplicarPrecoLido(r.preco);
      setAvisoScan(`${r.produto.nome} · ${formatarReais(r.preco)} adicionado. Leia de novo para somar outra unidade.`);
    } catch (e) {
      setAvisoScan(e instanceof Error ? e.message : "Não foi possível ler o código.");
    }
  }

  async function salvarProdutoDoScan() {
    if (!cadastroScan) return;
    const nome = cadastroScan.nome.trim();
    const preco = Number(cadastroScan.preco.replace(/\./g, "").replace(",", ".")) || 0;
    if (!nome || preco <= 0) { setAvisoScan("Informe o nome e o preço do produto."); return; }
    if (cadastroScan.unidade.trim().toLowerCase() === "kg" || /quilo/.test(cadastroScan.unidade.toLowerCase())) {
      setAvisoScan("Produtos vendidos por quilo não usam o leitor. Cadastre no cardápio e use a calculadora.");
      return;
    }
    const id = gerarId();
    await salvarProduto({
      id, nome, preco, unidade: cadastroScan.unidade.trim() || "un",
      ordem: produtos.length + 1, criado_em: agoraIso(),
      preco_promocional: null, promo_inicia_em: null, promo_expira_em: null,
      codigos_barras: [cadastroScan.codigo],
    });
    aplicarPrecoLido(preco);
    setAvisoScan(`${nome} cadastrado e ${formatarReais(preco)} adicionado à venda.`);
    setCadastroScan(null);
  }

  const dataHoje = new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const encomendasPendentes = encomendas.filter((e) => !e.excluido && statusDeEncomenda(e) === "pendente");
  const encomendasAtrasadas = encomendasPendentes.filter((e) => encomendaAtrasada(e));


  return (
    <div className="calc-page">
      {dialogo}
      <div className="uso-hoje">
        <div className="total-hoje">
          <div className="lbl">Total de hoje</div>
          <div className="v" data-testid="total-hoje">{formatarReais(hoje.total)}</div>
          <div className="muted small" style={{ color: "rgba(255,255,255,.85)" }}>{hoje.quantidade} venda{hoje.quantidade === 1 ? "" : "s"} · ticket {formatarReais(hoje.ticketMedio)}</div>
        </div>
        <Link to="/encomendas" className="btn btn-encomenda-rapida" data-testid="atalho-nova-encomenda">
          Nova encomenda
        </Link>
      </div>
      {encomendasPendentes.length > 0 && (
        <Link to="/encomendas" className="banner aviso-encomendas-home" data-testid="aviso-encomendas-home">
          {encomendasAtrasadas.length > 0
            ? `${encomendasAtrasadas.length} encomenda${encomendasAtrasadas.length === 1 ? "" : "s"} atrasada${encomendasAtrasadas.length === 1 ? "" : "s"}`
            : `${encomendasPendentes.length} encomenda${encomendasPendentes.length === 1 ? "" : "s"} pendente${encomendasPendentes.length === 1 ? "" : "s"}`}
          {encomendasAtrasadas.length > 0 && encomendasPendentes.length > encomendasAtrasadas.length
            ? ` · ${encomendasPendentes.length - encomendasAtrasadas.length} pendente(s)`
            : ""}
          . Abrir lista
        </Link>
      )}

      <div className="venda-calc">
      <div className="calc-display">
        <div className="lbl">{operador ? `Conta ${operador}` : "Total da venda"} · {dataHoje}</div>
        <div className="valor" data-testid="calc-valor">{formatarReais(valor)}</div>
        {acumulado != null && <div className="muted small" style={{ color: "var(--lima)" }}>{formatarReais(acumulado)} {operador ?? ""}</div>}
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

      <PainelTroco valor={valor} />

      <div className="acoes-venda">
        <BotaoLeitor testId="ler-codigo-venda" onClick={() => void lerProduto()} />
        <div className="acoes-venda-baixo">
          <button className="btn grow" onClick={limpar}>Limpar</button>
          <button className="btn btn-primary grow" data-testid="registrar-venda" disabled={valor <= 0} onClick={() => void registrar()}>Registrar venda</button>
        </div>
      </div>
      {avisoScan && <p className="muted small" data-testid="aviso-scan">{avisoScan}</p>}
      {cadastroScan && (
        <div className="card col" data-testid="cadastro-codigo-desconhecido">
          <h3>Código não cadastrado</h3>
          <p className="muted small">O código <strong>{cadastroScan.codigo}</strong> ainda não está no cardápio. Cadastre para adicionar o preço à venda. Só produtos vendidos por unidade (não por quilo).</p>
          <label className="field">Nome
            <input className="input" data-testid="scan-novo-nome" value={cadastroScan.nome} onChange={(e) => setCadastroScan({ ...cadastroScan, nome: e.target.value })} />
          </label>
          <label className="field">Preço
            <input className="input num" data-testid="scan-novo-preco" value={cadastroScan.preco} onChange={(e) => setCadastroScan({ ...cadastroScan, preco: e.target.value })} />
          </label>
          <label className="field">Unidade
            <input className="input" data-testid="scan-novo-unidade" value={cadastroScan.unidade} onChange={(e) => setCadastroScan({ ...cadastroScan, unidade: e.target.value })} placeholder="un, bandeja..." />
          </label>
          <div className="row">
            <button type="button" className="btn grow" onClick={() => setCadastroScan(null)}>Agora não</button>
            <button type="button" className="btn btn-primary grow" data-testid="scan-salvar-produto" onClick={() => void salvarProdutoDoScan()}>Cadastrar e somar</button>
          </div>
        </div>
      )}
      </div>

      <div className="venda-lado">
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
        <div className="row"><h3 className="grow">Vendas de hoje</h3><strong>{hoje.quantidade}</strong></div>
        <p className="muted small">{hoje.quantidade === 0 ? "Nenhuma venda registrada hoje." : `${hoje.quantidade} venda(s) · ticket médio ${formatarReais(hoje.ticketMedio)}`}</p>
        <ListaVirtual
          itens={vendasHoje}
          chave={(v) => v.id}
          altura={320}
          alturaLinha={76}
          vazio={<EstadoVazio icone="venda" titulo="Nenhuma venda hoje" texto="Use a calculadora acima e toque em Registrar venda." />}
          render={(v) => <ItemVendaHoje venda={v} autor={nomeDeRegistro(v, membros)} onExcluir={(x) => void pedirExclusao(x)} />}
        />
      </div>
      </div>
    </div>
  );
}
