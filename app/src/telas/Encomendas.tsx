import { useMemo, useState } from "react";
import { useLoja, enfileirar } from "../lib/loja";
import { Modal, toast } from "../comum";
import { ativos, buscar, emoji, precoVenda } from "../lib/produtos";
import { brl, diaSP, lerNumero, novoId, num, r2 } from "../lib/util";
import type { Encomenda, StatusEncomenda } from "../lib/tipos";

const ROTULO: Record<StatusEncomenda, string> = { pendente: "Pendente", separando: "Separando", pronta: "Pronta", entregue: "Entregue", cancelada: "Cancelada" };
const PROXIMO: Partial<Record<StatusEncomenda, StatusEncomenda>> = { pendente: "separando", separando: "pronta" };
const FORMAS = [["dinheiro", "Dinheiro"], ["pix", "Pix"], ["cartao", "Cartão"], ["fiado", "Fiado"]] as const;

function quando(d: string | null): { txt: string; cls: string } {
  if (!d) return { txt: "sem data", cls: "mut" };
  const dia = d.slice(0, 10); const hoje = diaSP(); const amanha = diaSP(new Date(Date.now() + 86400_000));
  const hora = d.length > 10 ? ` ${d.slice(11, 16)}` : "";
  if (dia < hoje) return { txt: `atrasada (${dia.slice(8, 10)}/${dia.slice(5, 7)})`, cls: "erro-t" };
  if (dia === hoje) return { txt: `hoje${hora}`, cls: "al-t" };
  if (dia === amanha) return { txt: `amanhã${hora}`, cls: "al-t" };
  return { txt: `${dia.slice(8, 10)}/${dia.slice(5, 7)}${hora}`, cls: "mut" };
}

export default function Encomendas() {
  const encomendas = useLoja((e) => e.encomendas);
  const papel = useLoja((e) => e.papel);
  const [aba, setAba] = useState<"abertas" | "concluidas">("abertas");
  const [editar, setEditar] = useState<Encomenda | "nova" | null>(null);
  const [entregar, setEntregar] = useState<Encomenda | null>(null);
  const lista = useMemo(() => Object.values(encomendas).filter((e) => !e.excluido)
    .filter((e) => (aba === "abertas" ? !["entregue", "cancelada"].includes(e.status) : ["entregue", "cancelada"].includes(e.status)))
    .sort((a, b) => aba === "abertas" ? (a.data_entrega ?? "9").localeCompare(b.data_entrega ?? "9") : (b.concluido_em ?? b.atualizado_em).localeCompare(a.concluido_em ?? a.atualizado_em)), [encomendas, aba]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div>{(["abertas", "concluidas"] as const).map((a) => <button key={a} className={`chip ${aba === a ? "on" : ""}`} onClick={() => setAba(a)}>{a === "abertas" ? "Abertas" : "Concluídas"}</button>)}</div>
        <button className="btn b-folha" onClick={() => setEditar("nova")} data-testid="nova-encomenda">+ Nova encomenda</button>
      </div>
      {lista.length === 0 && <div className="vazio">{aba === "abertas" ? "Nenhuma encomenda aberta." : "Nenhuma encomenda concluída nos últimos 60 dias."}</div>}
      {lista.map((e) => {
        const q = quando(e.data_entrega); const prox = PROXIMO[e.status];
        return (
          <div key={e.id} className="card" data-testid="encomenda">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ cursor: "pointer" }} onClick={() => setEditar(e)}>
                <b>{e.cliente || "Cliente"}</b> {e.tipo === "entrega" ? "🛵" : "🏪"} <small className={q.cls}>{q.txt}</small><br />
                <small className="mut">{ROTULO[e.status]} · {brl(e.valor)}{e.sinal ? ` · sinal ${brl(e.sinal)}` : ""}{e.pago ? " · pago" : ""}{e.pendente ? " · aguardando envio" : ""}</small>
                {e.descricao && <div className="peq-t">{e.descricao}</div>}
                <ItensResumo id={e.id} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {prox && <button className="btn peq b-claro" onClick={() => enfileirar("encomenda", { id: e.id, status: prox })} data-testid="avancar-encomenda">{ROTULO[prox]}</button>}
                {!["entregue", "cancelada"].includes(e.status) && <button className="btn peq b-folha" onClick={() => setEntregar(e)} data-testid="entregar-encomenda">Entregar</button>}
              </div>
            </div>
          </div>
        );
      })}
      {editar && <Modal titulo={editar === "nova" ? "Nova encomenda" : "Encomenda"} aoFechar={() => setEditar(null)}>
        <EncomendaForm enc={editar === "nova" ? undefined : editar} admin={papel === "admin"} aoSalvar={() => setEditar(null)} /></Modal>}
      {entregar && <Modal titulo="Entregar encomenda" aoFechar={() => setEntregar(null)}><Entrega enc={entregar} aoFim={() => setEntregar(null)} /></Modal>}
    </>
  );
}

function ItensResumo({ id }: { id: string }) {
  const itens = useLoja((e) => e.encItens);
  const l = Object.values(itens).filter((i) => i.encomenda_id === id);
  if (!l.length) return null;
  return <div className="peq-t">{l.map((i) => `${num(i.quantidade)} × ${i.nome}`).join(" · ")}</div>;
}

function Entrega({ enc, aoFim }: { enc: Encomenda; aoFim: () => void }) {
  const encItens = useLoja((e) => e.encItens);
  const itens = Object.values(encItens).filter((i) => i.encomenda_id === enc.id);
  const falta = r2(Math.max(enc.valor - (enc.sinal || 0), 0));
  const [forma, setForma] = useState(enc.forma_pagamento ?? "dinheiro");
  return (
    <div>
      <p>Valor {brl(enc.valor)}{enc.sinal ? ` · sinal já recebido ${brl(enc.sinal)}` : ""} · <b>a receber {brl(enc.pago ? 0 : falta)}</b></p>
      {!enc.pago && falta > 0 && <div style={{ marginBottom: 8 }}>{FORMAS.map(([v, n]) => <button key={v} className={`chip ${forma === v ? "on" : ""}`} onClick={() => setForma(v)}>{n}</button>)}</div>}
      <button className="btn b-folha w100" data-testid="confirmar-entrega" onClick={() => {
        if (!enc.pago && falta > 0) {
          // registra a venda do que falta receber (com os itens quando não teve sinal)
          const comItens = !enc.sinal && itens.length > 0 && Math.abs(itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0) - enc.valor) < 0.01;
          enfileirar("venda", { id: novoId(), total: falta, forma, criado_em: new Date().toISOString(),
            itens: comItens ? itens.map((i, k) => ({ id: `${enc.id}-v${k + 1}`, produto_id: i.produto_id, nome: i.nome, unidade: null, quantidade: i.quantidade, preco_unit: i.preco_unit, total: r2(i.quantidade * i.preco_unit) })) : [] });
        }
        enfileirar("encomenda", { id: enc.id, status: "entregue", pago: true, forma_pagamento: enc.forma_pagamento ?? forma });
        toast(!enc.pago && falta > 0 ? `Entregue · venda de ${brl(falta)} registrada` : "Entregue"); aoFim();
      }}>{!enc.pago && falta > 0 ? `Entregar e registrar venda de ${brl(falta)}` : "Marcar como entregue"}</button>
      <button className="btn b-perigo w100" style={{ marginTop: 8 }} onClick={() => { if (confirm("Cancelar esta encomenda?")) { enfileirar("encomenda", { id: enc.id, status: "cancelada" }); aoFim(); } }}>Cancelar encomenda</button>
    </div>
  );
}

interface ItemForm { id: string; produto_id: string | null; nome: string; quantidade: string; preco_unit: string }

function EncomendaForm({ enc, admin, aoSalvar }: { enc?: Encomenda; admin: boolean; aoSalvar: () => void }) {
  const produtos = useLoja((e) => e.produtos);
  const codigos = useLoja((e) => e.codigos);
  const encItens = useLoja((e) => e.encItens);
  const [cliente, setCliente] = useState(enc?.cliente ?? "");
  const [tel, setTel] = useState(enc?.telefone ?? "");
  const [tipo, setTipo] = useState<"retirada" | "entrega">(enc?.tipo ?? "retirada");
  const [end, setEnd] = useState(enc?.endereco ?? "");
  const [data, setData] = useState(enc?.data_entrega?.slice(0, 10) ?? diaSP(new Date(Date.now() + 86400_000)));
  const [hora, setHora] = useState(enc?.data_entrega && enc.data_entrega.length > 10 ? enc.data_entrega.slice(11, 16) : "");
  const [desc, setDesc] = useState(enc?.descricao ?? "");
  const [itens, setItens] = useState<ItemForm[]>(() => Object.values(encItens).filter((i) => i.encomenda_id === enc?.id)
    .map((i) => ({ id: i.id, produto_id: i.produto_id, nome: i.nome, quantidade: String(i.quantidade).replace(".", ","), preco_unit: String(i.preco_unit).replace(".", ",") })));
  const somaItens = r2(itens.reduce((s, i) => s + (lerNumero(i.quantidade) ?? 0) * (lerNumero(i.preco_unit) ?? 0), 0));
  const [valor, setValor] = useState(enc ? String(enc.valor).replace(".", ",") : "");
  const [sinal, setSinal] = useState(enc?.sinal ? String(enc.sinal).replace(".", ",") : "");
  const [formaSinal, setFormaSinal] = useState("pix");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const achados = useMemo(() => (busca ? buscar(ativos(produtos), codigos, busca).slice(0, 6) : []), [busca, produtos, codigos]);
  const valorFinal = lerNumero(valor) ?? somaItens;
  return (
    <div data-testid="encomenda-form">
      <label className="field">Cliente<input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} autoFocus data-testid="ef-cliente" /></label>
      <label className="field">Telefone<input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
      <div className="field">Tipo<div style={{ marginTop: 4 }}>
        <button className={`chip ${tipo === "retirada" ? "on" : ""}`} onClick={() => setTipo("retirada")}>🏪 Retira na loja</button>
        <button className={`chip ${tipo === "entrega" ? "on" : ""}`} onClick={() => setTipo("entrega")}>🛵 Entrega</button></div></div>
      {tipo === "entrega" && <label className="field">Endereço<input className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>}
      <div className="g2"><label className="field">Data<input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} data-testid="ef-data" /></label>
        <label className="field">Hora (opcional)<input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label></div>
      <label className="field">O que é<input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ex.: cesta de frutas média" data-testid="ef-descricao" /></label>
      <div className="field">Itens (opcional)
        {itens.map((it, k) => (
          <div key={it.id} className="row" style={{ marginTop: 4 }}>
            <span style={{ flex: 2 }}>{it.nome}</span>
            <input className="input" style={{ flex: 1, marginTop: 0 }} inputMode="decimal" value={it.quantidade} aria-label="Quantidade" onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, quantidade: e.target.value } : x)))} />
            <input className="input" style={{ flex: 1, marginTop: 0 }} inputMode="decimal" value={it.preco_unit} aria-label="Preço" onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, preco_unit: e.target.value } : x)))} />
            <button className="btn peq b-perigo" onClick={() => setItens(itens.filter((_, j) => j !== k))}>✕</button>
          </div>))}
        <div className="busca" style={{ marginTop: 6 }}><span>🔎</span><input placeholder="Adicionar produto" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="ef-busca" /></div>
        {achados.map((p) => <button key={p.id} className="prod" data-testid="ef-produto" onClick={() => { setItens([...itens, { id: novoId(), produto_id: p.id, nome: p.nome, quantidade: "1", preco_unit: String(precoVenda(p)).replace(".", ",") }]); setBusca(""); }}>
          <div className="ic">{emoji(p.nome)}</div><div className="n"><b>{p.nome}</b></div><div className="p">{brl(precoVenda(p))}</div></button>)}
      </div>
      <div className="g2"><label className="field">Valor total {itens.length > 0 && <small className="mut">(itens: {brl(somaItens)})</small>}<input className="input" inputMode="decimal" value={valor} placeholder={itens.length ? String(somaItens).replace(".", ",") : "0,00"} onChange={(e) => setValor(e.target.value)} data-testid="ef-valor" /></label>
        <label className="field">Sinal recebido<input className="input" inputMode="decimal" value={sinal} disabled={!!enc?.sinal} onChange={(e) => setSinal(e.target.value)} data-testid="ef-sinal" /></label></div>
      {!enc?.sinal && (lerNumero(sinal) ?? 0) > 0 && <div style={{ marginBottom: 6 }}>Sinal em: {FORMAS.filter(([v]) => v !== "fiado").map(([v, n]) => <button key={v} className={`chip ${formaSinal === v ? "on" : ""}`} onClick={() => setFormaSinal(v)}>{n}</button>)}</div>}
      {erro && <div className="erro">{erro}</div>}
      <button className="btn b-folha w100" data-testid="ef-salvar" onClick={() => {
        if (!cliente.trim()) { setErro("Digite o nome do cliente."); return; }
        if (valorFinal < 0) { setErro("Valor inválido."); return; }
        const id = enc?.id ?? novoId();
        const s = lerNumero(sinal) ?? 0;
        enfileirar("encomenda", { id, cliente: cliente.trim(), telefone: tel.trim() || null, tipo, endereco: tipo === "entrega" ? end.trim() || null : null,
          data_entrega: data ? (hora ? `${data} ${hora}` : data) : null, descricao: desc.trim() || null, valor: valorFinal, sinal: enc?.sinal ?? s,
          itens: itens.map((i) => ({ id: i.id, produto_id: i.produto_id, nome: i.nome, quantidade: lerNumero(i.quantidade) ?? 1, preco_unit: lerNumero(i.preco_unit) ?? 0 })),
          ...(enc ? {} : { criado_em: new Date().toISOString() }) });
        // o sinal recebido agora entra no caixa como venda só com valor
        if (!enc?.sinal && s > 0) enfileirar("venda", { id: novoId(), total: s, forma: formaSinal, criado_em: new Date().toISOString(), itens: [] });
        toast(s > 0 && !enc?.sinal ? `Encomenda salva · sinal de ${brl(s)} registrado no caixa` : "Encomenda salva"); aoSalvar();
      }}>Salvar</button>
      {enc && admin && <button className="btn b-perigo w100" style={{ marginTop: 8 }} onClick={() => { if (confirm("Apagar esta encomenda?")) { enfileirar("encomenda", { id: enc.id, excluido: true }); aoSalvar(); } }}>Apagar</button>}
    </div>
  );
}
