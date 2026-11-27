import { useMemo, useState } from "react";
import { useLoja, enfileirar } from "../lib/loja";
import { Modal, toast } from "../comum";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { ativos, buscar, custoBase, emoji, precoVenda, promoAtiva } from "../lib/produtos";
import { margemDe } from "../lib/calc";
import { brl, dataHoraSP, lerNumero, novoId, num, pct } from "../lib/util";
import { UNIDADES, nomeUnidade, type Produto, type Unidade } from "../lib/tipos";
import { Calculadora } from "./Calculadora";

type Filtro = "todos" | "kg" | "un" | "baixo" | "sem_custo";

export default function Produtos() {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const custos = useLoja((e) => e.custos);
  const papel = useLoja((e) => e.papel);
  const [t, setT] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const todos = useMemo(() => ativos(produtos), [produtos]);
  const baixo = (p: Produto) => p.estoque_minimo != null && (custos[p.id]?.estoque ?? 0) < p.estoque_minimo;
  const lista = useMemo(() => buscar(todos, codigos, t).filter((p) =>
    filtro === "todos" ? true : filtro === "kg" ? p.unidade === "kg" : filtro === "un" ? p.unidade !== "kg" : filtro === "baixo" ? baixo(p) : custoBase(p, custos[p.id]) == null,
  ), [todos, codigos, t, filtro, custos]);
  const nBaixo = todos.filter(baixo).length;

  return (
    <>
      <div className="busca">
        <span>🔎</span>
        <input placeholder="Buscar por nome ou código" value={t} onChange={(e) => setT(e.target.value)} data-leitor="1" data-testid="busca-produtos" />
        <button className="btn peq b-claro" onClick={async () => { const c = await lerCodigoBarras(); if (c) setT(c); }} aria-label="Ler código">📷</button>
      </div>
      <div style={{ marginBottom: 6 }}>
        {([["todos", `Todos (${todos.length})`], ["kg", "Por kg"], ["un", "Por unidade"], ["baixo", `Estoque baixo (${nBaixo})`], ["sem_custo", "Sem custo"]] as [Filtro, string][]).map(([f, n]) => (
          <button key={f} className={`chip ${filtro === f ? "on" : f === "baixo" && nBaixo ? "al" : ""}`} onClick={() => setFiltro(f)}>{n}</button>
        ))}
      </div>
      <div className="card" style={{ padding: "0 12px" }}>
        {lista.map((p) => {
          const c = custos[p.id]; const cb = custoBase(p, c); const m = margemDe(precoVenda(p), cb);
          return (
            <button key={p.id} className="prod" onClick={() => setAberto(p.id)} data-testid="produto">
              <div className="ic">{emoji(p.nome)}</div>
              <div className="n"><b>{p.nome}</b>
                <small>{nomeUnidade(p.unidade)} · estoque {c ? num(c.estoque, 3) : "—"}{baixo(p) && <b className="al-t"> · baixo</b>}{cb != null && ` · custo ${brl(cb)}`}</small></div>
              <div className="p">{brl(precoVenda(p))}{promoAtiva(p) && <small className="al-t">promoção</small>}
                {m != null && <small className={m < (p.margem_desejada ?? 35) - 5 ? "dn" : "up"}>margem {pct(m)}</small>}</div>
            </button>
          );
        })}
        {!lista.length && <div className="vazio">Nenhum produto.</div>}
      </div>
      <button className="fab" onClick={() => setNovo(true)} data-testid="novo-produto">＋ Produto</button>
      {novo && <Modal titulo="Novo produto" aoFechar={() => setNovo(false)}><ProdutoForm aoSalvar={() => setNovo(false)} /></Modal>}
      {aberto && produtos[aberto] && (
        <Modal titulo={produtos[aberto].nome} aoFechar={() => setAberto(null)}>
          {papel === "admin" ? <ProdutoForm produto={produtos[aberto]} aoSalvar={() => setAberto(null)} /> : <ProdutoVer produto={produtos[aberto]} />}
        </Modal>
      )}
    </>
  );
}

export function ProdutoForm({ produto, codigoInicial, aoSalvar }: { produto?: Produto; codigoInicial?: string; aoSalvar: (p: Produto) => void }) {
  const papel = useLoja((e) => e.papel);
  const codigos = useLoja((e) => e.codigos);
  const custos = useLoja((e) => e.custos);
  const fornecedores = useLoja((e) => e.fornecedores);
  const cfg = useLoja((e) => e.config);
  const admin = papel === "admin";
  const meusCodigos = produto ? Object.values(codigos).filter((c) => c.produto_id === produto.id).map((c) => c.codigo) : [];
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [unidade, setUnidade] = useState<Unidade>(produto?.unidade ?? "kg");
  const [categoria, setCategoria] = useState(produto?.categoria ?? "");
  const [preco, setPreco] = useState(produto ? String(produto.preco).replace(".", ",") : "");
  const [cods, setCods] = useState<string[]>(codigoInicial ? [...meusCodigos, codigoInicial] : meusCodigos);
  const [novoCod, setNovoCod] = useState("");
  const [margem, setMargem] = useState(produto?.margem_desejada ?? cfg?.margem_padrao ?? 35);
  const [perda, setPerda] = useState(String(produto?.perda_padrao ?? 0));
  const [minimo, setMinimo] = useState(produto?.estoque_minimo != null ? String(produto.estoque_minimo).replace(".", ",") : "");
  const [validade, setValidade] = useState(produto?.validade_dias != null ? String(produto.validade_dias) : "");
  const [forn, setForn] = useState(produto?.fornecedor_id ?? "");
  const [base, setBase] = useState<"medio" | "ultimo">(produto?.base_custo ?? "medio");
  const [promo, setPromo] = useState(produto?.preco_promocional != null ? String(produto.preco_promocional).replace(".", ",") : "");
  const [promoFim, setPromoFim] = useState(produto?.promo_expira_em ? produto.promo_expira_em.slice(0, 10) : "");
  const [erro, setErro] = useState("");
  const custo = produto ? custoBase({ ...produto, base_custo: base }, custos[produto.id]) : null;

  function addCodigo(c: string) {
    const v = c.trim();
    if (!/^[0-9A-Za-z]{3,30}$/.test(v)) { setErro("Código inválido."); return; }
    const dono = codigos[v];
    if (dono && dono.produto_id !== produto?.id) { setErro("Esse código já é de outro produto."); return; }
    if (!cods.includes(v)) setCods([...cods, v]);
    setNovoCod(""); setErro("");
  }

  function salvar(precoForcado?: number) {
    const pr = precoForcado ?? lerNumero(preco);
    if (nome.trim().length < 1) { setErro("Digite o nome."); return; }
    if (pr == null || pr < 0) { setErro("Digite o preço."); return; }
    const id = produto?.id ?? novoId();
    const dados: Record<string, unknown> = { id, nome: nome.trim(), unidade, categoria: categoria.trim() || null, preco: pr, codigos: cods };
    if (admin) Object.assign(dados, {
      margem_desejada: margem, perda_padrao: lerNumero(perda) ?? 0, estoque_minimo: lerNumero(minimo), validade_dias: validade ? Number(validade) : null,
      fornecedor_id: forn || null, base_custo: base, preco_promocional: lerNumero(promo),
      promo_expira_em: promoFim ? new Date(`${promoFim}T23:59:00-03:00`).toISOString() : null, promo_inicia_em: lerNumero(promo) != null ? new Date().toISOString() : null,
    });
    enfileirar("produto", dados);
    toast(produto ? "Produto salvo" : `${nome.trim()} cadastrado`);
    aoSalvar({ ...(produto ?? {}), ...dados } as Produto);
  }

  if (produto && !admin) return <ProdutoVer produto={produto} />;
  return (
    <div data-testid="produto-form">
      <label className="field">Nome<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} data-testid="pf-nome" autoFocus={!produto} /></label>
      <div className="field">Vendido por<div style={{ marginTop: 4 }}>
        {UNIDADES.map((u) => <button key={u.v} className={`chip ${unidade === u.v ? "on" : ""}`} onClick={() => setUnidade(u.v)} data-testid={`pf-un-${u.v}`}>{u.nome}</button>)}
      </div></div>
      <div className="g2">
        <label className="field">Preço de venda (R$/{nomeUnidade(unidade)})<input className="input" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} data-testid="pf-preco" /></label>
        <label className="field">Categoria<input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Frutas, Legumes…" /></label>
      </div>
      <div className="field">Códigos de barras (leitor USB, câmera ou digitado)
        <div style={{ marginTop: 4 }}>{cods.map((c) => <span key={c} className="chip ok">{c} <button className="x" style={{ width: 22, height: 22, fontSize: 12, marginLeft: 4 }} onClick={() => setCods(cods.filter((x) => x !== c))} aria-label={`Remover ${c}`} disabled={!admin && meusCodigos.includes(c)}>✕</button></span>)}</div>
        <div className="row" style={{ marginTop: 4 }}>
          <input className="input" style={{ marginTop: 0 }} value={novoCod} onChange={(e) => setNovoCod(e.target.value)} data-leitor="1" placeholder="Código"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCodigo(novoCod); } }} data-testid="pf-codigo" />
          <button className="btn b-claro" onClick={() => addCodigo(novoCod)}>＋</button>
          <button className="btn b-claro" onClick={async () => { const c = await lerCodigoBarras(); if (c) addCodigo(c); }}>📷</button>
        </div>
        <div className="peq-t mut" style={{ fontWeight: 600, marginTop: 4 }}>Balança: cadastre os 7 primeiros dígitos da etiqueta (ex.: 2000123).</div>
      </div>
      {admin && (
        <>
          <div className="g3">
            <label className="field">Avisar abaixo de<input className="input" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder={nomeUnidade(unidade)} /></label>
            <label className="field">Validade média (dias)<input className="input" inputMode="numeric" value={validade} onChange={(e) => setValidade(e.target.value.replace(/\D/g, ""))} /></label>
            <label className="field">Perda padrão %<input className="input" inputMode="decimal" value={perda} onChange={(e) => setPerda(e.target.value)} /></label>
          </div>
          <div className="g2">
            <label className="field">Fornecedor principal
              <select className="input" value={forn} onChange={(e) => setForn(e.target.value)}>
                <option value="">—</option>
                {Object.values(fornecedores).filter((f) => !f.excluido).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select></label>
            <div className="field">Base do custo<div style={{ marginTop: 4 }}>
              <button className={`chip ${base === "medio" ? "on" : ""}`} onClick={() => setBase("medio")}>Custo médio</button>
              <button className={`chip ${base === "ultimo" ? "on" : ""}`} onClick={() => setBase("ultimo")}>Última compra</button></div></div>
          </div>
          <div className="g2">
            <label className="field">Preço promocional<input className="input" inputMode="decimal" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="vazio = sem promoção" /></label>
            <label className="field">Promoção até<input className="input" type="date" value={promoFim} onChange={(e) => setPromoFim(e.target.value)} /></label>
          </div>
          {produto && (
            <div className="card">
              <h3>Calculadora de preço</h3>
              <Calculadora custo={custo} precoAtual={lerNumero(preco) ?? 0} margem={margem} setMargem={setMargem} unidade={nomeUnidade(unidade)} estoque={custos[produto.id]?.estoque} />
            </div>
          )}
        </>
      )}
      {erro && <div className="erro">{erro}</div>}
      <button className="btn b-folha w100" onClick={() => salvar()} data-testid="pf-salvar">{produto ? "Salvar" : "Cadastrar produto"}</button>
      {admin && produto && (
        <button className="btn b-perigo w100" style={{ marginTop: 8 }} onClick={() => { if (confirm(`Tirar ${produto.nome} da lista?`)) { enfileirar("produto", { id: produto.id, excluido: true }); aoSalvar(produto); } }}>Excluir produto</button>
      )}
      {produto && <Historico produtoId={produto.id} />}
    </div>
  );
}

function ProdutoVer({ produto }: { produto: Produto }) {
  const custos = useLoja((e) => e.custos);
  const codigos = useLoja((e) => e.codigos);
  const [perda, setPerda] = useState("");
  const c = custos[produto.id];
  const cods = Object.values(codigos).filter((x) => x.produto_id === produto.id);
  return (
    <div>
      <div className="kpis">
        <div className="kpi"><div className="t">Preço</div><div className="v">{brl(precoVenda(produto))}</div><div className="d">por {nomeUnidade(produto.unidade)}</div></div>
        <div className="kpi"><div className="t">Estoque</div><div className="v">{c ? num(c.estoque) : "—"}</div><div className="d">{nomeUnidade(produto.unidade)}</div></div>
      </div>
      <div className="card"><h3>Códigos</h3>{cods.length ? cods.map((x) => <span key={x.codigo} className="chip ok">{x.codigo}</span>) : <span className="mut">nenhum</span>}
        <div style={{ marginTop: 8 }}><button className="btn b-claro" onClick={async () => { const cod = await lerCodigoBarras(); if (cod) { enfileirar("codigo", { codigo: cod, produto_id: produto.id }); toast("Código adicionado"); } }}>📷 Adicionar código</button></div></div>
      <div className="card"><h3>Registrar perda / descarte</h3>
        <div className="row"><input className="input" style={{ marginTop: 0 }} inputMode="decimal" placeholder={`quantidade em ${nomeUnidade(produto.unidade)}`} value={perda} onChange={(e) => setPerda(e.target.value)} />
          <button className="btn b-perigo" onClick={() => { const q = lerNumero(perda); if (q && q > 0) { enfileirar("perda", { id: novoId(), produto_id: produto.id, quantidade: q }); setPerda(""); toast("Perda registrada"); } }}>Registrar</button></div></div>
      <div className="aviso">Preço, custo e margem só o Admin altera.</div>
      <Historico produtoId={produto.id} />
    </div>
  );
}

function Historico({ produtoId }: { produtoId: string }) {
  const entradaItens = useLoja((e) => e.entradaItens);
  const entradas = useLoja((e) => e.entradas);
  const fornecedores = useLoja((e) => e.fornecedores);
  const lista = Object.values(entradaItens).filter((i) => i.produto_id === produtoId && entradas[i.entrada_id] && !entradas[i.entrada_id].excluido)
    .sort((a, b) => entradas[b.entrada_id].data.localeCompare(entradas[a.entrada_id].data)).slice(0, 8);
  if (!lista.length) return null;
  return (
    <div className="card" style={{ marginTop: 10 }}><h3>Últimas entradas</h3>
      <table><thead><tr><th>Data</th><th>Fornecedor</th><th className="n">Chegou</th><th className="n">Pago</th><th className="n">Custo</th></tr></thead>
        <tbody>{lista.map((i) => { const e = entradas[i.entrada_id]; return (
          <tr key={i.id}><td>{dataHoraSP(e.data)}</td><td>{e.fornecedor_id ? fornecedores[e.fornecedor_id]?.nome ?? "—" : "—"}</td>
            <td className="n">{num(i.quantidade)}</td><td className="n">{brl(i.valor_pago)}</td><td className="n">{brl(i.custo_efetivo)}</td></tr>); })}</tbody></table>
    </div>
  );
}
