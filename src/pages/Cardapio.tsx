import { useMemo, useRef, useState } from "react";
import { useTravaToque } from "../components/useTravaToque";
import { useDebounce } from "../lib/debounce";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { precoAtual, promoAgendada, promoAtiva } from "../lib/preco";
import { gerarId } from "../lib/importacao";
import { agoraIso } from "../lib/datas";
import { linkWhatsapp, textoCardapio } from "../lib/whatsapp";
import { useConfirmar } from "../components/Dialogo";
import { EstadoVazio } from "../components/EstadoVazio";
import { lerCodigoBarras } from "../lib/leitorCodigo";
import { BotaoLeitor } from "../components/BotaoLeitor";
import { mensagemCodigoBarras, podeAdicionarCodigo, produtoVendidoPorPeso } from "../lib/codigoBarras";

export function Cardapio() {
  const { produtos, config, salvarProduto, excluirProduto } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const trava = useTravaToque();
  const [busca, setBusca] = useState("");
  const buscaDeb = useDebounce(busca, 160);
  const [edit, setEdit] = useState<string | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [unidade, setUnidade] = useState("kg");
  const [promo, setPromo] = useState("");
  const [inicia, setInicia] = useState("");
  const [expira, setExpira] = useState("");
  const [codigos, setCodigos] = useState<string[]>([]);
  const [codigoNovo, setCodigoNovo] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");
  const precoRef = useRef<HTMLInputElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);

  const lista = useMemo(() => {
    const q = buscaDeb.trim().toLowerCase();
    return q ? produtos.filter((p) => p.nome.toLowerCase().includes(q)) : produtos;
  }, [produtos, buscaDeb]);

  function abrir(id: string | "novo") {
    if (id === "novo") {
      setEdit("novo"); setNome(""); setPreco(""); setUnidade("kg"); setPromo(""); setInicia(""); setExpira(""); setCodigos([]); setCodigoNovo(""); setErroCodigo("");
      return;
    }
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    setEdit(id); setNome(p.nome); setPreco(String(p.preco).replace(".", ",")); setUnidade(p.unidade ?? "");
    setPromo(p.preco_promocional != null ? String(p.preco_promocional).replace(".", ",") : "");
    setInicia(p.promo_inicia_em ? p.promo_inicia_em.slice(0, 16) : "");
    setExpira(p.promo_expira_em ? p.promo_expira_em.slice(0, 16) : "");
    setCodigos(p.codigos_barras ?? []); setCodigoNovo(""); setErroCodigo("");
  }

  function parseN(s: string) { return Number(s.replace(/\./g, "").replace(",", ".")) || 0; }

  async function salvar() {
    const nomeEl = document.querySelector<HTMLInputElement>('[data-testid="produto-nome"]');
    const precoEl = document.querySelector<HTMLInputElement>('[data-testid="produto-preco"]');
    const nomeV = (nomeEl?.value ?? nomeRef.current?.value ?? nome).trim();
    const precoV = precoEl?.value ?? precoRef.current?.value ?? preco;
    if (!nomeV || !edit) return;
    if (!trava.comecar()) return;
    try {
    const id = edit === "novo" ? gerarId() : edit;
    const atual = produtos.find((p) => p.id === id);
    await salvarProduto({
      id, nome: nomeV, preco: parseN(precoV), unidade: unidade.trim() || null,
      ordem: atual?.ordem ?? (produtos.length + 1),
      criado_em: atual?.criado_em || agoraIso(),
      preco_promocional: promo ? parseN(promo) : null,
      promo_inicia_em: inicia ? new Date(inicia).toISOString() : null,
      promo_expira_em: expira ? new Date(expira).toISOString() : null,
      codigos_barras: produtoVendidoPorPeso(unidade) ? [] : codigos,
    });
    setEdit(null);
    } finally {
      trava.soltar();
    }
  }

  const texto = textoCardapio(produtos, config);

  return (
    <div>
      <div className="row wrap search">
        <input className="input grow" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn btn-primary" data-testid="novo-produto" onClick={() => abrir("novo")}>Novo</button>
      </div>
      <a className="btn btn-lima btn-block" href={linkWhatsapp(config.telefone, texto)} target="_blank" rel="noreferrer">Compartilhar cardápio no WhatsApp</a>
      <div className="lista" style={{ marginTop: 12 }}>
        {lista.length === 0 && (
          <EstadoVazio
            icone="cardapio"
            titulo={buscaDeb.trim() ? "Nenhum produto encontrado" : "Cardápio vazio"}
            texto={buscaDeb.trim() ? "Tente outro nome ou limpe a busca." : "Cadastre os produtos com preço, unidade e promoção. Eles aparecem no texto para WhatsApp."}
          />
        )}
        {lista.map((p) => (
          <div className="item" key={p.id} data-testid={`produto-item-${p.nome}`}>
            <div className="grow">
              <div className="titulo">{p.nome} {p.unidade && <span className="muted small">/ {p.unidade}</span>}</div>
              <div>
                {promoAtiva(p) ? (
                  <><s className="muted">{formatarReais(p.preco)}</s> <strong>{formatarReais(precoAtual(p))}</strong> <span className="tag promo">promo</span></>
                ) : promoAgendada(p) ? (
                  <><strong>{formatarReais(p.preco)}</strong> <span className="tag warn">promo agendada {formatarReais(p.preco_promocional ?? 0)}</span></>
                ) : <strong>{formatarReais(p.preco)}</strong>}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => abrir(p.id)}>Editar</button>
          </div>
        ))}
      </div>
      {edit && (
        <div className="dialog-bg" onClick={() => setEdit(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{edit === "novo" ? "Novo produto" : "Editar produto"}</h3>
            <form className="col" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
              <label className="field">Nome<input className="input" data-testid="produto-nome" ref={nomeRef} defaultValue={nome} /></label>
              <label className="field">Preço<input className="input num" data-testid="produto-preco" ref={precoRef} defaultValue={preco} /></label>
              <label className="field">Unidade<input className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="kg, un, bandeja..." /></label>
              <div className="field">
                <span>Código de barras</span>
                {produtoVendidoPorPeso(unidade) ? (
                  <p className="muted small" data-testid="aviso-codigo-kg">Produtos vendidos por quilo não usam o leitor de código de barras. Use a calculadora na venda.</p>
                ) : (
                  <>
                    {codigos.length > 0 && (
                      <ul className="lista-codigos" data-testid="lista-codigos">
                        {codigos.map((c) => (
                          <li key={c} className="chip-row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                            <code>{c}</code>
                            <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remover código ${c}`} onClick={() => setCodigos((xs) => xs.filter((x) => x !== c))}>Remover</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {erroCodigo && <p className="muted small" data-testid="erro-codigo" style={{ color: "var(--tomate-2)" }}>{erroCodigo}</p>}
                    <div className="campo-codigo">
                      <div className="campo-codigo-linha">
                        <input className="input grow" data-testid="codigo-barras-input" value={codigoNovo} onChange={(e) => setCodigoNovo(e.target.value)} placeholder="Digite ou leia o código" />
                        <button type="button" className="btn" data-testid="adicionar-codigo" onClick={() => {
                          const r = podeAdicionarCodigo(produtos, { id: edit === "novo" || !edit ? "" : edit, unidade, codigos_barras: codigos }, codigoNovo);
                          if (!r.ok) { setErroCodigo(mensagemCodigoBarras(r)); return; }
                          setCodigos((xs) => [...xs, r.codigo]); setCodigoNovo(""); setErroCodigo("");
                        }}>Adicionar</button>
                      </div>
                      <BotaoLeitor
                        testId="ler-codigo-produto"
                        label="Ler pela câmera"
                        onClick={() => void (async () => {
                          setErroCodigo("");
                          try {
                            const lido = await lerCodigoBarras();
                            if (!lido) return;
                            const r = podeAdicionarCodigo(produtos, { id: edit === "novo" || !edit ? "" : edit, unidade, codigos_barras: codigos }, lido);
                            if (!r.ok) { setErroCodigo(mensagemCodigoBarras(r)); return; }
                            setCodigos((xs) => [...xs, r.codigo]); setErroCodigo("");
                          } catch (e) {
                            setErroCodigo(e instanceof Error ? e.message : "Não foi possível ler o código.");
                          }
                        })()}
                      />
                    </div>
                    <p className="muted small">Um produto pode ter vários códigos. O mesmo código não pode se repetir no cardápio.</p>
                  </>
                )}
              </div>
              <label className="field">Preço promocional<input className="input num" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="opcional" /></label>
              <label className="field">Início da promo<input className="input" type="datetime-local" value={inicia} onChange={(e) => setInicia(e.target.value)} /></label>
              <label className="field">Fim da promo<input className="input" type="datetime-local" value={expira} onChange={(e) => setExpira(e.target.value)} /></label>
              <div className="row">
                {edit !== "novo" && <button type="button" className="btn btn-danger" data-testid="produto-excluir" onClick={async () => {
                  const ok = await confirmar({ titulo: "Excluir produto?", descricao: nome, confirmar: "Excluir", destrutivo: true });
                  if (ok && typeof edit === "string") { await excluirProduto(edit); setEdit(null); }
                }}>Excluir</button>}
                <button type="button" className="btn grow" onClick={() => setEdit(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary grow" data-testid="produto-salvar" disabled={trava.ocupado}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {dialogo}
    </div>
  );
}
