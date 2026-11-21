import { useMemo, useState } from "react";
import { useDebounce } from "../lib/debounce";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { precoAtual, promoAgendada, promoAtiva } from "../lib/preco";
import { gerarId } from "../lib/importacao";
import { agoraIso } from "../lib/datas";
import { linkWhatsapp, textoCardapio } from "../lib/whatsapp";
import { useConfirmar } from "../components/Dialogo";
import { EstadoVazio } from "../components/EstadoVazio";

export function Cardapio() {
  const { produtos, config, salvarProduto, excluirProduto } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [busca, setBusca] = useState("");
  const buscaDeb = useDebounce(busca, 160);
  const [edit, setEdit] = useState<string | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [unidade, setUnidade] = useState("kg");
  const [promo, setPromo] = useState("");
  const [inicia, setInicia] = useState("");
  const [expira, setExpira] = useState("");

  const lista = useMemo(() => {
    const q = buscaDeb.trim().toLowerCase();
    return q ? produtos.filter((p) => p.nome.toLowerCase().includes(q)) : produtos;
  }, [produtos, buscaDeb]);

  function abrir(id: string | "novo") {
    if (id === "novo") {
      setEdit("novo"); setNome(""); setPreco(""); setUnidade("kg"); setPromo(""); setInicia(""); setExpira("");
      return;
    }
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    setEdit(id); setNome(p.nome); setPreco(String(p.preco).replace(".", ",")); setUnidade(p.unidade ?? "");
    setPromo(p.preco_promocional != null ? String(p.preco_promocional).replace(".", ",") : "");
    setInicia(p.promo_inicia_em ? p.promo_inicia_em.slice(0, 16) : "");
    setExpira(p.promo_expira_em ? p.promo_expira_em.slice(0, 16) : "");
  }

  function parseN(s: string) { return Number(s.replace(/\./g, "").replace(",", ".")) || 0; }

  async function salvar() {
    if (!nome.trim() || !edit) return;
    const id = edit === "novo" ? gerarId() : edit;
    const atual = produtos.find((p) => p.id === id);
    await salvarProduto({
      id, nome: nome.trim(), preco: parseN(preco), unidade: unidade.trim() || null,
      ordem: atual?.ordem ?? (produtos.length + 1),
      criado_em: atual?.criado_em || agoraIso(),
      preco_promocional: promo ? parseN(promo) : null,
      promo_inicia_em: inicia ? new Date(inicia).toISOString() : null,
      promo_expira_em: expira ? new Date(expira).toISOString() : null,
    });
    setEdit(null);
  }

  const texto = textoCardapio(produtos, config);

  return (
    <div>
      {dialogo}
      <div className="row wrap search">
        <input className="input grow" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn btn-primary" onClick={() => abrir("novo")}>Novo</button>
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
          <div className="item" key={p.id}>
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
            <div className="col" style={{ marginTop: 10 }}>
              <label className="field">Nome<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
              <label className="field">Preço<input className="input num" value={preco} onChange={(e) => setPreco(e.target.value)} /></label>
              <label className="field">Unidade<input className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="kg, un, bandeja..." /></label>
              <label className="field">Preço promocional<input className="input num" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="opcional" /></label>
              <label className="field">Início da promo<input className="input" type="datetime-local" value={inicia} onChange={(e) => setInicia(e.target.value)} /></label>
              <label className="field">Fim da promo<input className="input" type="datetime-local" value={expira} onChange={(e) => setExpira(e.target.value)} /></label>
              <div className="row">
                {edit !== "novo" && <button className="btn btn-danger" onClick={async () => {
                  const ok = await confirmar({ titulo: "Excluir produto?", descricao: nome, confirmar: "Excluir", destrutivo: true });
                  if (ok && typeof edit === "string") { await excluirProduto(edit); setEdit(null); }
                }}>Excluir</button>}
                <button className="btn grow" onClick={() => setEdit(null)}>Cancelar</button>
                <button className="btn btn-primary grow" onClick={() => void salvar()}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
