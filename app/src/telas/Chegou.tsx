import { useMemo, useState } from "react";
import { useLoja, enfileirar } from "../lib/loja";
import { toast, useLeitorUSB } from "../comum";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { acharPorCodigo, custoBase, emoji } from "../lib/produtos";
import { custoEfetivo, custoMedioNovo, precoSugerido } from "../lib/calc";
import { brl, dataHoraSP, lerNumero, novoId, num, r2 } from "../lib/util";
import { nomeUnidade, type Produto } from "../lib/tipos";
import { BuscaProduto } from "./Caixa";
import { Calculadora } from "./Calculadora";
import { FornecedorForm } from "./Fornecedores";
import { Modal } from "../comum";

export default function Chegou() {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const custos = useLoja((e) => e.custos);
  const fornecedores = useLoja((e) => e.fornecedores);
  const papel = useLoja((e) => e.papel);
  const cfg = useLoja((e) => e.config);
  const admin = papel === "admin";
  const [produto, setProduto] = useState<Produto | null>(null);
  const [escolher, setEscolher] = useState(false);
  const [forn, setForn] = useState(() => localStorage.getItem("cv3-ult-forn") || "");
  const [qtd, setQtd] = useState("");
  const [valor, setValor] = useState("");
  const [perda, setPerda] = useState("");
  const [frete, setFrete] = useState("");
  const [validade, setValidade] = useState("");
  const [margem, setMargem] = useState(35);
  const [erro, setErro] = useState("");
  const [novoForn, setNovoForn] = useState(false);

  function escolherProduto(p: Produto) {
    setProduto(p); setEscolher(false); setErro("");
    setPerda(p.perda_padrao ? String(p.perda_padrao).replace(".", ",") : "");
    setMargem(p.margem_desejada ?? cfg?.margem_padrao ?? 35);
  }
  useLeitorUSB((cod) => { const a = acharPorCodigo(cod, produtos, codigos); if (a) escolherProduto(a.produto); else setErro(`Código ${cod} não cadastrado.`); }, !escolher);

  const q = lerNumero(qtd) ?? 0, v = lerNumero(valor) ?? 0, pp = lerNumero(perda) ?? 0, fr = lerNumero(frete) ?? 0;
  const c = produto ? custos[produto.id] : undefined;
  const custoCompra = q > 0 && v > 0 ? v / q : null;
  const custoEf = custoEfetivo(v, q, pp, fr);
  const util = q * (1 - pp / 100);
  const medioNovo = produto ? custoMedioNovo(c?.estoque ?? 0, c?.custo_medio ?? null, util, custoEf) : null;
  const baseNova = produto?.base_custo === "ultimo" ? custoEf ?? medioNovo : medioNovo;
  const sugerido = precoSugerido(baseNova, margem, cfg?.arredondamento ?? "49_99", cfg?.modo_margem ?? "venda");

  function salvar(usarPreco: boolean) {
    if (!produto) { setErro("Escolha o produto."); return; }
    if (!(q > 0)) { setErro("Digite a quantidade que chegou."); return; }
    if (pp < 0 || pp >= 100) { setErro("Perda deve ser entre 0 e 99%."); return; }
    const id = novoId();
    enfileirar("entrada", {
      id, fornecedor_id: forn || null, data: new Date().toISOString(), frete: fr,
      itens: [{ id: `${id}-1`, produto_id: produto.id, quantidade: q, valor_pago: v, perda_pct: pp, validade_em: validade || null }],
    });
    if (usarPreco && admin && sugerido != null) enfileirar("preco", { produto_id: produto.id, preco: sugerido, margem });
    if (forn) localStorage.setItem("cv3-ult-forn", forn);
    toast(`Entrada salva: ${num(q)} ${nomeUnidade(produto.unidade)} de ${produto.nome}${usarPreco && sugerido != null ? ` · preço ${brl(sugerido)}` : ""}`);
    setProduto(null); setQtd(""); setValor(""); setPerda(""); setFrete(""); setValidade(""); setErro("");
  }

  const listaForn = Object.values(fornecedores).filter((f) => !f.excluido && f.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <>
      <label className="field">Produto
        <div className="row" style={{ marginTop: 4 }}>
          <button className="input" style={{ marginTop: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setEscolher(true)} data-testid="chegou-produto">
            {produto ? `${emoji(produto.nome)} ${produto.nome}` : "Toque para escolher…"}
          </button>
          <button className="btn b-claro" aria-label="Ler código" onClick={async () => { const cod = await lerCodigoBarras(); if (cod) { const a = acharPorCodigo(cod, produtos, codigos); if (a) escolherProduto(a.produto); else setErro(`Código ${cod} não cadastrado.`); } }}>📷</button>
        </div>
      </label>
      <label className="field">Fornecedor
        <div className="row" style={{ marginTop: 4 }}>
          <select className="input" style={{ marginTop: 0 }} value={forn} onChange={(e) => setForn(e.target.value)} data-testid="chegou-fornecedor">
            <option value="">— sem fornecedor —</option>
            {listaForn.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          {admin && <button className="btn b-claro" onClick={() => setNovoForn(true)} aria-label="Novo fornecedor">＋</button>}
        </div>
      </label>
      <div className="g2">
        <label className="field">Quantidade que chegou {produto ? `(${nomeUnidade(produto.unidade)})` : ""}
          <input className="input" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} data-testid="chegou-qtd" /></label>
        <label className="field">Valor pago (total R$)
          <input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} data-testid="chegou-valor" /></label>
      </div>
      <div className="g3">
        <label className="field">Perda estimada %<input className="input" inputMode="decimal" value={perda} onChange={(e) => setPerda(e.target.value)} data-testid="chegou-perda" /></label>
        <label className="field">Frete / outros R$<input className="input" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} data-testid="chegou-frete" /></label>
        <label className="field">Validade<input className="input" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></label>
      </div>

      {produto && (
        <div className="card" data-testid="chegou-custos">
          <h3>Custo calculado</h3>
          <div className="linha-it"><span>Custo por {nomeUnidade(produto.unidade)} desta compra</span><b>{brl(custoCompra)}</b></div>
          <div className="linha-it"><span>Com perda {num(pp, 1)}% {fr ? "+ frete" : ""}</span><b data-testid="custo-efetivo">{brl(custoEf)}</b></div>
          <div className="linha-it"><span>Custo médio do estoque ({num(Math.max(c?.estoque ?? 0, 0))} + {num(r2(util))} {nomeUnidade(produto.unidade)})</span><b data-testid="custo-medio">{brl(medioNovo)}</b></div>
          {custoBase(produto, c) != null && <div className="linha-it"><span className="mut">Custo antes desta compra</span><span className="mut">{brl(custoBase(produto, c))}</span></div>}
        </div>
      )}
      {produto && (
        <div className="card">
          <Calculadora custo={baseNova} precoAtual={produto.preco} margem={margem} setMargem={setMargem} unidade={nomeUnidade(produto.unidade)} />
        </div>
      )}
      {erro && <div className="erro">{erro}</div>}
      {admin ? (
        <div className="g2">
          <button className="btn b-claro" onClick={() => salvar(false)} data-testid="chegou-salvar">Salvar{produto ? ` (manter ${brl(produto.preco)})` : ""}</button>
          <button className="btn b-folha" disabled={sugerido == null} onClick={() => salvar(true)} data-testid="chegou-salvar-preco">Salvar e usar {sugerido != null ? brl(sugerido) : "sugerido"}</button>
        </div>
      ) : (
        <>
          <button className="btn b-folha w100" onClick={() => salvar(false)} data-testid="chegou-salvar">Salvar entrada</button>
          <div className="peq-t mut" style={{ marginTop: 6 }}>O preço de venda só o Admin muda.</div>
        </>
      )}
      <UltimasEntradas />
      {escolher && <BuscaProduto titulo="O que chegou?" aoEscolher={escolherProduto} aoFechar={() => setEscolher(false)} />}
      {novoForn && <Modal titulo="Novo fornecedor" aoFechar={() => setNovoForn(false)}><FornecedorForm aoSalvar={(id) => { setForn(id); setNovoForn(false); }} /></Modal>}
    </>
  );
}

function UltimasEntradas() {
  const entradas = useLoja((e) => e.entradas);
  const itens = useLoja((e) => e.entradaItens);
  const produtos = useLoja((e) => e.produtos);
  const fornecedores = useLoja((e) => e.fornecedores);
  const porEntrada = useMemo(() => {
    const m: Record<string, typeof itens[string][]> = {};
    for (const i of Object.values(itens)) (m[i.entrada_id] ??= []).push(i);
    return m;
  }, [itens]);
  const lista = Object.values(entradas).filter((e) => !e.excluido).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15);
  if (!lista.length) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}><h3>Últimas entradas</h3>
      {lista.map((e) => (porEntrada[e.id] ?? []).map((i) => (
        <div key={i.id} className="linha-it" data-testid="entrada">
          <span><b>{produtos[i.produto_id]?.nome ?? "?"}</b> <small>{num(i.quantidade)} {nomeUnidade(produtos[i.produto_id]?.unidade)} · {e.fornecedor_id ? fornecedores[e.fornecedor_id]?.nome ?? "" : "sem fornecedor"} · {dataHoraSP(e.data)}{e.pendente ? " · aguardando envio" : ""}</small></span>
          <b>{brl(i.valor_pago || null)}</b>
        </div>
      )))}
    </div>
  );
}
