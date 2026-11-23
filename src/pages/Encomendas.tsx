import { useMemo, useState } from "react";
import { useStore } from "../store";
import { formatarReais } from "../lib/dinheiro";
import { formatarDataHora, horarioLocalParaIso, isoParaDiaHora, hojeChave } from "../lib/datas";
import { useConfirmar } from "../components/Dialogo";
import { EstadoVazio } from "../components/EstadoVazio";
import {
  FORMAS_PAGAMENTO,
  encomendaAPagar,
  encomendaAtrasada,
  enderecoVazio,
  linkMapa,
  rotuloFormaPagamento,
  statusDeEncomenda,
  textoEndereco,
  tipoDeEncomenda,
  validarEncomenda,
} from "../lib/encomendas";
import { linkWhatsapp } from "../lib/whatsapp";
import type { Encomenda, EnderecoEncomenda, FormaPagamentoEncomenda, TipoEncomenda } from "../lib/types";

type Filtro = "todas" | "a_pagar" | "pendentes" | "atrasadas" | "entregues";

export function Encomendas() {
  const {
    encomendas, salvarEncomenda, confirmarEncomenda, cancelarEncomenda, concluirEncomenda,
    marcarPagamentoEncomenda, excluirEncomenda, config,
  } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [edit, setEdit] = useState(false);
  const [erro, setErro] = useState("");
  const [id, setId] = useState<string | undefined>();
  const [cliente, setCliente] = useState("");
  const [produto, setProduto] = useState("");
  const [valor, setValor] = useState("");
  const [pago, setPago] = useState(false);
  const [forma, setForma] = useState<FormaPagamentoEncomenda | "">("");
  const [valorPago, setValorPago] = useState("");
  const [tipo, setTipo] = useState<TipoEncomenda>("retirada");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [referencia, setReferencia] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dia, setDia] = useState(hojeChave());
  const [horaEntrega, setHoraEntrega] = useState("12:00");
  const [horaLembrete, setHoraLembrete] = useState(config.hora_lembrete_padrao || "12:00");

  const lista = useMemo(() => {
    return encomendas.filter((e) => {
      const st = statusDeEncomenda(e);
      if (filtro === "a_pagar") return encomendaAPagar(e);
      if (filtro === "pendentes") return st === "pendente";
      if (filtro === "atrasadas") return encomendaAtrasada(e);
      if (filtro === "entregues") return st === "entregue";
      return true;
    });
  }, [encomendas, filtro]);

  function enderecoAtual(): EnderecoEncomenda {
    return { rua, numero, bairro, referencia };
  }

  function abrir(e?: Encomenda) {
    setErro(""); setEdit(true); setId(e?.id);
    setCliente(e?.cliente ?? ""); setProduto(e?.produto ?? "");
    setValor(e ? String(e.valor).replace(".", ",") : "");
    setPago(e?.pago ?? false);
    setForma(e?.forma_pagamento ?? "");
    setValorPago(e?.valor_pago != null ? String(e.valor_pago).replace(".", ",") : "");
    const tp = e ? tipoDeEncomenda(e) : "retirada";
    setTipo(tp);
    const det = e?.endereco_detalhe;
    setRua(det?.rua ?? (tp === "entrega" ? (e?.endereco ?? "") : ""));
    setNumero(det?.numero ?? "");
    setBairro(det?.bairro ?? "");
    setReferencia(det?.referencia ?? "");
    setTelefone(e?.telefone ?? "");
    if (e?.data_entrega) {
      const dh = isoParaDiaHora(e.data_entrega);
      setDia(dh.dia); setHoraEntrega(dh.hora);
    } else {
      setDia(hojeChave()); setHoraEntrega("12:00");
    }
    if (e?.prazo_lembrete) setHoraLembrete(isoParaDiaHora(e.prazo_lembrete).hora);
    else setHoraLembrete(config.hora_lembrete_padrao || "12:00");
  }

  async function salvar() {
    const data = horarioLocalParaIso(dia, horaEntrega);
    const prazo = horarioLocalParaIso(dia, horaLembrete || config.hora_lembrete_padrao || "12:00");
    const end = tipo === "entrega" ? enderecoAtual() : enderecoVazio();
    const msg = validarEncomenda({ cliente, produto, telefone, tipo, endereco: tipo === "entrega" ? end : null, data_entrega: data });
    if (msg) { setErro(msg); return; }
    try {
      await salvarEncomenda({
        id, cliente, produto, valor: Number(valor.replace(",", ".")) || 0,
        pago, forma_pagamento: forma || null,
        valor_pago: pago && valorPago ? Number(valorPago.replace(",", ".")) || null : (pago ? Number(valor.replace(",", ".")) || 0 : null),
        telefone, tipo, para_entrega: tipo === "entrega",
        endereco_detalhe: tipo === "entrega" ? end : null,
        data_entrega: data, prazo_lembrete: prazo,
      });
      setEdit(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  function badgePagamento(e: Encomenda) {
    if (e.pago) {
      const formaTxt = rotuloFormaPagamento(e.forma_pagamento);
      return <span className="tag ok">paga{formaTxt ? ` · ${formaTxt}` : ""}</span>;
    }
    const formaTxt = rotuloFormaPagamento(e.forma_pagamento);
    return <span className="tag warn">a pagar{formaTxt ? ` · ${formaTxt}` : ""}</span>;
  }

  function badgeStatus(e: Encomenda) {
    const st = statusDeEncomenda(e);
    if (st === "entregue") return <span className="tag ok">entregue</span>;
    if (st === "cancelada") return <span className="tag">cancelada</span>;
    if (encomendaAtrasada(e)) return <span className="tag warn">atrasada</span>;
    return <span className="tag">pendente</span>;
  }

  return (
    <div className="pagina-encomendas">
      {dialogo}
      <button className="btn btn-primary btn-block btn-nova-encomenda" onClick={() => abrir()}>Nova encomenda</button>
      <div className="filtros-encomenda" role="tablist" aria-label="Filtrar encomendas">
        {([
          ["todas", "Todas"],
          ["a_pagar", "A pagar"],
          ["pendentes", "Pendentes"],
          ["atrasadas", "Atrasadas"],
          ["entregues", "Entregues"],
        ] as const).map(([k, rotulo]) => (
          <button key={k} className={filtro === k ? "btn btn-sm btn-primary" : "btn btn-sm"} onClick={() => setFiltro(k)}>{rotulo}</button>
        ))}
      </div>
      <div className="lista lista-encomendas" data-testid="lista-encomendas">
        {lista.length === 0 && <EstadoVazio icone="encomenda" titulo={encomendas.length === 0 ? "Nenhuma encomenda" : "Nenhuma nesta lista"} texto="Reserve um pedido com cliente, telefone, data e forma de pagamento. Se for entrega, preencha o endereço." />}
        {lista.map((e) => {
          const st = statusDeEncomenda(e);
          const tipo = tipoDeEncomenda(e);
          const end = textoEndereco(e.endereco_detalhe, e.endereco);
          const mapa = tipo === "entrega" ? linkMapa(e.endereco_detalhe, e.endereco) : null;
          return (
            <article className="item card-encomenda" key={e.id}>
              <div className="card-encomenda-topo">
                <div className="grow">
                  <h3 className="titulo">{e.cliente}</h3>
                  <p className="card-encomenda-produto">{e.produto}</p>
                </div>
                <strong className="card-encomenda-valor">{formatarReais(e.valor)}</strong>
              </div>
              <div className="card-encomenda-selos">
                {badgePagamento(e)}
                {badgeStatus(e)}
                <span className="tag">{tipo === "entrega" ? "entrega" : "retirada"}</span>
              </div>
              <div className="muted small card-encomenda-meta">
                {e.data_entrega ? `Para ${formatarDataHora(e.data_entrega)}` : formatarDataHora(e.criado_em)}
                {e.prazo_lembrete ? ` · lembrete ${formatarDataHora(e.prazo_lembrete)}` : ""}
                {st === "entregue" && e.concluido_em ? ` · entregue ${formatarDataHora(e.concluido_em)}${e.entregue_por_nome ? ` por ${e.entregue_por_nome}` : ""}` : ""}
                {e.pago && e.pago_por_nome ? ` · marcado pago por ${e.pago_por_nome}` : ""}
              </div>
              {e.telefone && (
                <div className="muted small">
                  Tel. {e.telefone}{" "}
                  <a href={linkWhatsapp(e.telefone, `Olá ${e.cliente}, sobre a encomenda de ${e.produto}.`)} target="_blank" rel="noreferrer">WhatsApp</a>
                </div>
              )}
              {tipo === "entrega" && end && (
                <div className="muted small">
                  {end}{" "}
                  {mapa && <a href={mapa} target="_blank" rel="noreferrer">Abrir no mapa</a>}
                </div>
              )}
              <div className="acoes-encomenda">
                {st === "pendente" && (
                  <button className="btn btn-sm btn-primary" onClick={() => void confirmarEncomenda(e.id)}>Confirmar entrega</button>
                )}
                {st === "entregue" && (
                  <button className="btn btn-sm" onClick={() => void concluirEncomenda(e.id, false)}>Reabrir</button>
                )}
                {st !== "cancelada" && st === "pendente" && (
                  <button className="btn btn-sm" onClick={() => void cancelarEncomenda(e.id)}>Cancelar</button>
                )}
                {!e.pago && st !== "cancelada" && (
                  <button className="btn btn-sm" onClick={() => void marcarPagamentoEncomenda(e.id, true)}>Marcar paga</button>
                )}
                {e.pago && st !== "cancelada" && (
                  <button className="btn btn-sm" onClick={() => void marcarPagamentoEncomenda(e.id, false)}>A pagar</button>
                )}
                <button className="btn btn-sm" onClick={() => abrir(e)}>Editar</button>
                <button className="btn btn-sm btn-danger" onClick={async () => {
                  const ok = await confirmar({ titulo: "Apagar encomenda?", descricao: `${e.cliente} · ${e.produto}`, confirmar: "Apagar", destrutivo: true });
                  if (ok) await excluirEncomenda(e.id);
                }}>Apagar</button>
              </div>
            </article>
          );
        })}
      </div>
      {edit && (
        <div className="dialog-bg dialog-bg-encomenda" onClick={() => setEdit(false)}>
          <div className="dialog dialog-encomenda" onClick={(e) => e.stopPropagation()}>
            <h3>{id ? "Editar encomenda" : "Nova encomenda"}</h3>
            {erro && <div className="banner erro" style={{ marginTop: 8 }}>{erro}</div>}
            <div className="form-encomenda">
              <div className="grade-form">
                <label className="field">Cliente<input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></label>
                <label className="field">Produto<input className="input" value={produto} onChange={(e) => setProduto(e.target.value)} /></label>
              </div>
              <div className="grade-form">
                <label className="field">Valor<input className="input num" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
                <label className="field">Telefone / WhatsApp do cliente<input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="Obrigatório" /></label>
              </div>
              <label className="field">Tipo
                <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEncomenda)}>
                  <option value="retirada">Retirada</option>
                  <option value="entrega">Entrega</option>
                </select>
              </label>
              {tipo === "entrega" && (
                <fieldset className="bloco-endereco">
                  <legend>Endereço de entrega</legend>
                  <div className="grade-form grade-rua">
                    <label className="field field-rua">Rua<input className="input" value={rua} onChange={(e) => setRua(e.target.value)} /></label>
                    <label className="field field-num">Número<input className="input" value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
                  </div>
                  <label className="field">Bairro<input className="input" value={bairro} onChange={(e) => setBairro(e.target.value)} /></label>
                  <label className="field">Ponto de referência<input className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
                </fieldset>
              )}
              <div className="grade-form">
                <label className="field">Data<input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
                <label className="field">Horário<input className="input" type="time" value={horaEntrega} onChange={(e) => setHoraEntrega(e.target.value)} /></label>
              </div>
              <label className="field">Lembrete (se ninguém confirmar a entrega)
                <input className="input" type="time" value={horaLembrete} onChange={(e) => setHoraLembrete(e.target.value)} />
              </label>
              <p className="muted small">O aviso vai para todos os aparelhos depois que sincronizarem. O padrão é {config.hora_lembrete_padrao || "12:00"}.</p>
              <label className="field">Forma de pagamento
                <select className="input" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamentoEncomenda | "")}>
                  <option value="">Não informado</option>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já paga (registro manual, sem cobrança real)</label>
              {pago && (
                <label className="field">Valor pago (opcional)<input className="input num" value={valorPago} onChange={(e) => setValorPago(e.target.value)} /></label>
              )}
              <div className="row acoes-form">
                <button className="btn grow" onClick={() => setEdit(false)}>Cancelar</button>
                <button className="btn btn-primary grow" onClick={() => void salvar()}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
