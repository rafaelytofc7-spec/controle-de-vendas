import { useEffect, useMemo, useRef, useState } from "react";
import { useLoja, enfileirar } from "../lib/loja";
import { Modal, Teclado, centavos, toast, useLeitorUSB } from "../comum";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { acharPorCodigo, ativos, buscar, emoji, precoVenda } from "../lib/produtos";
import { brl, diaSP, horaSP, novoId, num, r2 } from "../lib/util";
import { nomeUnidade, type Produto } from "../lib/tipos";
import { ProdutoForm } from "./Produtos";

type Item = { key: string; produto_id: string | null; nome: string; unidade: string; quantidade: number; preco_unit: number; total: number };
type Forma = "dinheiro" | "pix" | "cartao" | null;

export function useResumoDia() {
  const vendas = useLoja((e) => e.vendas);
  const margem = useLoja((e) => e.config?.margem_padrao ?? 35);
  return useMemo(() => {
    const hoje = diaSP();
    let n = 0, total = 0, lucro = 0, estimado = false;
    for (const v of Object.values(vendas)) {
      if (v.excluido || diaSP(v.criado_em) !== hoje) continue;
      n++; total += v.total;
      if (v.tem_itens && v.custo_total != null) lucro += v.total - v.custo_total;
      else { lucro += v.total * margem / 100; estimado = true; }
    }
    return { n, total: r2(total), lucro: r2(lucro), estimado };
  }, [vendas, margem]);
}

export default function Caixa() {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const [itens, setItens] = useState<Item[]>([]);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<Forma>(null);
  const [recebido, setRecebido] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [pesando, setPesando] = useState<Produto | null>(null);
  const [editando, setEditando] = useState<Item | null>(null);
  const [desconhecido, setDesconhecido] = useState<string | null>(null);
  const [verHoje, setVerHoje] = useState(false);
  const idVenda = useRef(novoId());
  const travado = useRef(false);
  const resumo = useResumoDia();
  const modoBalanca = (localStorage.getItem("cv3-balanca") as "preco" | "peso") || "preco";

  const somaItens = r2(itens.reduce((s, i) => s + i.total, 0));
  const avulso = centavos(valor);
  const total = r2(somaItens + avulso);
  const rec = centavos(recebido);
  const troco = forma === "dinheiro" && recebido ? r2(rec - total) : null;

  function adicionar(p: Produto, quantidade?: number, totalItem?: number) {
    const pv = precoVenda(p);
    if (quantidade == null && p.unidade === "kg") { setPesando(p); return; }
    setItens((l) => {
      const q = quantidade ?? 1;
      const igual = quantidade == null ? l.find((i) => i.produto_id === p.id && p.unidade !== "kg") : undefined;
      if (igual) return l.map((i) => (i === igual ? { ...i, quantidade: i.quantidade + 1, total: r2((i.quantidade + 1) * i.preco_unit) } : i));
      return [...l, { key: novoId(), produto_id: p.id, nome: p.nome, unidade: p.unidade, quantidade: q, preco_unit: pv, total: totalItem ?? r2(q * pv) }];
    });
  }

  function aoLerCodigo(cod: string) {
    const a = acharPorCodigo(cod, produtos, codigos, modoBalanca);
    if (!a) { setDesconhecido(cod); return; }
    adicionar(a.produto, a.quantidade, a.total);
    toast(`${a.produto.nome} adicionado`);
  }

  // teclado físico (PC) e leitor USB
  const antesDaRajada = useRef("");
  const ultimaTecla = useRef(0);
  useLeitorUSB((cod) => { setValor(antesDaRajada.current); aoLerCodigo(cod); }, !buscando && !pesando && !editando && !desconhecido);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || document.querySelector(".modal-fundo")) return;
      const agora = performance.now();
      if (/^\d$/.test(e.key)) {
        setValor((v) => { if (agora - ultimaTecla.current > 60) antesDaRajada.current = v; return v.length < 7 ? (v + e.key).replace(/^0+/, "") : v; });
        ultimaTecla.current = agora;
      } else if (e.key === "Backspace") setValor((v) => v.slice(0, -1));
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  function registrar() {
    if (travado.current || total <= 0) return;
    travado.current = true;
    const lista = [...itens];
    if (lista.length && avulso > 0) lista.push({ key: novoId(), produto_id: null, nome: "Avulso", unidade: "un", quantidade: 1, preco_unit: avulso, total: avulso });
    const id = idVenda.current;
    enfileirar("venda", {
      id, total, forma, recebido: forma === "dinheiro" && recebido ? rec : null, troco: troco != null && troco >= 0 ? troco : null,
      criado_em: new Date().toISOString(),
      itens: lista.map((i, n) => ({ id: `${id}-${n + 1}`, produto_id: i.produto_id, nome: i.nome, unidade: i.unidade, quantidade: i.quantidade, preco_unit: i.preco_unit, total: i.total })),
    });
    toast(`Venda de ${brl(total)} registrada`, { rotulo: "Desfazer", fn: () => enfileirar("excluir_venda", { id }) });
    setItens([]); setValor(""); setRecebido(""); setForma(null);
    idVenda.current = novoId();
    window.setTimeout(() => { travado.current = false; }, 400);
  }

  return (
    <>
      <div className="visor" data-testid="visor">
        <div className="r">Total da venda</div>
        <div className="v" data-testid="total">{brl(total)}</div>
        <div className="r">
          {itens.length ? `${itens.length} ${itens.length === 1 ? "item" : "itens"}` : "venda rápida (só valor)"}
          {avulso > 0 && itens.length > 0 && ` + avulso ${brl(avulso)}`}
          {troco != null && <> · troco: <b data-testid="troco">{troco >= 0 ? brl(troco) : `falta ${brl(-troco)}`}</b></>}
        </div>
      </div>

      {itens.length > 0 && (
        <div className="card" style={{ padding: "4px 12px" }}>
          {itens.map((i) => (
            <div key={i.key} className="linha-it" onClick={() => setEditando(i)} style={{ cursor: "pointer" }}>
              <span><b>{i.nome}</b> <small>{num(i.quantidade)} {nomeUnidade(i.unidade)} × {brl(i.preco_unit)}</small></span>
              <b>{brl(i.total)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="g2" style={{ marginBottom: 8 }}>
        <button className="btn b-claro" data-testid="ler-codigo" onClick={async () => { const c = await lerCodigoBarras(); if (c) aoLerCodigo(c); }}>📷 Ler código</button>
        <button className="btn b-claro" data-testid="buscar-produto" onClick={() => setBuscando(true)}>🔎 Produto</button>
      </div>

      <div className="sec" style={{ margin: "6px 0 0" }}>{itens.length ? "Somar valor avulso" : "Ou digite só o valor"}</div>
      <Teclado valor={valor} setValor={setValor} />

      <div className="g3" style={{ marginBottom: 8 }}>
        {(["dinheiro", "pix", "cartao"] as const).map((f) => (
          <button key={f} className={`chip ${forma === f ? "on" : ""}`} style={{ justifyContent: "center", margin: 0, minHeight: 38 }}
            onClick={() => setForma(forma === f ? null : f)} data-testid={`forma-${f}`}>{f === "cartao" ? "Cartão" : f === "pix" ? "Pix" : "Dinheiro"}</button>
        ))}
      </div>
      {forma === "dinheiro" && (
        <label className="field">Valor recebido (para calcular o troco)
          <input className="input" inputMode="decimal" value={recebido ? (centavos(recebido)).toFixed(2).replace(".", ",") : ""} placeholder=""
            data-testid="recebido" onChange={(e) => setRecebido(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 7))} />
        </label>
      )}

      <button className="btn b-folha w100" style={{ fontSize: 18, padding: 15 }} disabled={total <= 0} onClick={registrar} data-testid="registrar">
        Registrar venda · {brl(total)}
      </button>
      {(itens.length > 0 || valor) && (
        <button className="btn w100" style={{ marginTop: 8 }} onClick={() => { setItens([]); setValor(""); setRecebido(""); }}>Limpar</button>
      )}

      <button className="card w100" style={{ marginTop: 12, textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => setVerHoje(true)} data-testid="resumo-dia">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span><b>Hoje:</b> {resumo.n} vendas · <b>{brl(resumo.total)}</b></span>
          <span className="up" title={resumo.estimado ? "Inclui estimativa para vendas só com valor" : ""}><b>lucro {resumo.estimado ? "≈ " : ""}{brl(resumo.lucro)}</b></span>
        </div>
      </button>

      {buscando && <BuscaProduto aoEscolher={(p) => { setBuscando(false); adicionar(p); }} aoFechar={() => setBuscando(false)} />}
      {pesando && <Pesar produto={pesando} aoFechar={() => setPesando(null)} aoConfirmar={(q) => { adicionar(pesando, q); setPesando(null); }} />}
      {editando && (
        <Modal titulo={editando.nome} aoFechar={() => setEditando(null)}>
          <EditarItem item={editando}
            aoSalvar={(q) => { setItens((l) => l.map((i) => (i.key === editando.key ? { ...i, quantidade: q, total: r2(q * i.preco_unit) } : i))); setEditando(null); }}
            aoRemover={() => { setItens((l) => l.filter((i) => i.key !== editando.key)); setEditando(null); }} />
        </Modal>
      )}
      {desconhecido && <CodigoDesconhecido codigo={desconhecido} aoFechar={() => setDesconhecido(null)} aoAdicionar={(p) => { setDesconhecido(null); adicionar(p); }} />}
      {verHoje && <VendasHoje aoFechar={() => setVerHoje(false)} />}
    </>
  );
}

export function BuscaProduto({ aoEscolher, aoFechar, titulo = "Escolher produto" }: { aoEscolher: (p: Produto) => void; aoFechar: () => void; titulo?: string }) {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const [t, setT] = useState("");
  const lista = useMemo(() => buscar(ativos(produtos), codigos, t), [produtos, codigos, t]);
  return (
    <Modal titulo={titulo} aoFechar={aoFechar}>
      <div className="busca"><span>🔎</span><input autoFocus placeholder="Nome ou código" value={t} data-leitor="1" onChange={(e) => setT(e.target.value)} data-testid="busca-produto" /></div>
      <div className="card" style={{ padding: "0 12px" }}>
        {lista.slice(0, 80).map((p) => (
          <button key={p.id} className="prod" onClick={() => aoEscolher(p)} data-testid="opcao-produto">
            <div className="ic">{emoji(p.nome)}</div>
            <div className="n"><b>{p.nome}</b><small>{nomeUnidade(p.unidade)}</small></div>
            <div className="p">{brl(precoVenda(p))}</div>
          </button>
        ))}
        {!lista.length && <div className="vazio">Nenhum produto encontrado.</div>}
      </div>
    </Modal>
  );
}

function Pesar({ produto, aoFechar, aoConfirmar }: { produto: Produto; aoFechar: () => void; aoConfirmar: (kg: number) => void }) {
  const [g, setG] = useState("");
  const kg = g ? Number(g) / 1000 : 0;
  return (
    <Modal titulo={`${produto.nome} — peso`} aoFechar={aoFechar}>
      <div className="visor"><div className="r">Peso (digite em gramas)</div><div className="v" data-testid="peso">{num(kg)} kg</div>
        <div className="r">{brl(precoVenda(produto))}/kg → <b>{brl(r2(kg * precoVenda(produto)))}</b></div></div>
      <Teclado valor={g} setValor={setG} />
      <button className="btn b-folha w100" disabled={kg <= 0} onClick={() => aoConfirmar(kg)} data-testid="confirmar-peso">Adicionar</button>
    </Modal>
  );
}

function EditarItem({ item, aoSalvar, aoRemover }: { item: Item; aoSalvar: (q: number) => void; aoRemover: () => void }) {
  const kg = item.unidade === "kg";
  const [v, setV] = useState(kg ? String(Math.round(item.quantidade * 1000)) : String(item.quantidade));
  const q = kg ? Number(v || 0) / 1000 : Number(v || 0);
  return (
    <>
      <div className="visor"><div className="r">{kg ? "Peso (gramas)" : "Quantidade"}</div><div className="v">{num(q)} {nomeUnidade(item.unidade)}</div><div className="r">{brl(r2(q * item.preco_unit))}</div></div>
      <Teclado valor={v} setValor={setV} />
      <div className="g2"><button className="btn b-perigo" onClick={aoRemover}>Remover</button><button className="btn b-folha" disabled={q <= 0} onClick={() => aoSalvar(q)}>Salvar</button></div>
    </>
  );
}

function CodigoDesconhecido({ codigo, aoFechar, aoAdicionar }: { codigo: string; aoFechar: () => void; aoAdicionar: (p: Produto) => void }) {
  const [modo, setModo] = useState<"" | "vincular" | "novo">("");
  if (modo === "vincular") return <BuscaProduto titulo="Vincular código a…" aoFechar={aoFechar} aoEscolher={(p) => { enfileirar("codigo", { codigo, produto_id: p.id }); toast(`Código salvo em ${p.nome}`); aoAdicionar(p); }} />;
  if (modo === "novo") return <Modal titulo="Novo produto" aoFechar={aoFechar}><ProdutoForm codigoInicial={codigo} aoSalvar={(p) => aoAdicionar(p)} /></Modal>;
  return (
    <Modal titulo="Código não cadastrado" aoFechar={aoFechar}>
      <p>O código <b data-testid="codigo-desconhecido">{codigo}</b> ainda não está em nenhum produto.</p>
      <div className="g2"><button className="btn b-claro" onClick={() => setModo("vincular")}>Vincular a um produto</button><button className="btn b-folha" onClick={() => setModo("novo")}>Cadastrar novo</button></div>
    </Modal>
  );
}

function VendasHoje({ aoFechar }: { aoFechar: () => void }) {
  const vendas = useLoja((e) => e.vendas);
  const itens = useLoja((e) => e.itens);
  const uid = useLoja((e) => e.uid);
  const papel = useLoja((e) => e.papel);
  const hoje = diaSP();
  const lista = Object.values(vendas).filter((v) => !v.excluido && diaSP(v.criado_em) === hoje).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const porVenda = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const i of Object.values(itens)) (m[i.venda_id] ??= []).push(i.nome);
    return m;
  }, [itens]);
  return (
    <Modal titulo={`Vendas de hoje (${lista.length})`} aoFechar={aoFechar}>
      <div className="card" style={{ padding: "2px 12px" }}>
        {lista.map((v) => (
          <div key={v.id} className="linha-it" data-testid="venda-hoje">
            <span><b>{horaSP(v.criado_em)}</b> <small>{v.forma ?? ""} {porVenda[v.id]?.slice(0, 3).join(", ") ?? (v.origem === "app_antigo" ? "app antigo" : "")} {v.pendente ? "· aguardando envio" : ""}</small></span>
            <span className="row"><b>{brl(v.total)}</b>
              {(papel === "admin" || v.aparelho === uid) && (
                <button className="btn peq b-perigo" onClick={() => { if (confirm(`Apagar a venda de ${brl(v.total)}?`)) enfileirar("excluir_venda", { id: v.id }); }}>Apagar</button>
              )}
            </span>
          </div>
        ))}
        {!lista.length && <div className="vazio">Nenhuma venda hoje ainda.</div>}
      </div>
    </Modal>
  );
}
