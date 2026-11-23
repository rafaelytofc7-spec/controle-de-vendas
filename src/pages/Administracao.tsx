import { useEffect, useMemo, useState } from "react";
import { ListaVirtual } from "../components/ListaVirtual";
import { useStore } from "../store";
import { bloquearMembro, removerMembro } from "../lib/sync";
import { alterarNomeMembro, alterarPin, transferirLideranca } from "../lib/acesso";
import { LOJA_NUVEM_ID } from "../lib/firebasePadrao";
import { formatarDataHora } from "../lib/datas";
import { formatarReais } from "../lib/dinheiro";
import { rotuloAutor } from "../lib/autoria";
import { gruposDuplicatasSuspeitas } from "../lib/duplicatas";
import { listarLogLeitor, limparLogLeitor, type EventoLeitor } from "../lib/diagnosticoLeitor";
import { useConfirmar } from "../components/Dialogo";
import { AUTOR_IMPORTADO } from "../lib/types";

type Aba = "equipe" | "acesso" | "atividades" | "faturamento" | "loja";

export function Administracao() {
  const {
    ehDono, usuario, loja, online, membros, atividades, vendas, equipe,
    config, atualizarConfig, recarregar, codigoRecuperacao, excluirVenda,
  } = useStore();
  const { confirmar, dialogo } = useConfirmar();
  const [aba, setAba] = useState<Aba>("equipe");
  const [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false);
  const [nome, setNome] = useState(config.nome_loja);
  const [tel, setTel] = useState(config.telefone);
  const [msg, setMsg] = useState(config.mensagem_cardapio);
  const [taxa, setTaxa] = useState(String(config.taxa_entrega).replace(".", ","));
  const [obs, setObs] = useState(config.observacoes);
  const [codigo, setCodigo] = useState(loja);
  const [pinNovo, setPinNovo] = useState("");
  const [pinConfirma, setPinConfirma] = useState("");
  const [novoCodigo, setNovoCodigo] = useState<string>();
  const [alvoLider, setAlvoLider] = useState("");
  const [nomeEdit, setNomeEdit] = useState<Record<string, string>>({});
  const [horaLembrete, setHoraLembrete] = useState(config.hora_lembrete_padrao || "12:00");
  const [logLeitor, setLogLeitor] = useState<EventoLeitor[]>([]);

  useEffect(() => { setLogLeitor(listarLogLeitor()); }, [aba]);

  const duplicatas = useMemo(() => gruposDuplicatasSuspeitas(vendas), [vendas]);

  const porPessoa = useMemo(() => {
    const map = new Map<string, { rotulo: string; quantidade: number; total: number }>();
    for (const v of vendas) {
      const chave = v.criadoPorEmail || v.criadoPor || AUTOR_IMPORTADO;
      const atual = map.get(chave) ?? { rotulo: rotuloAutor(v.criadoPor, v.criadoPorEmail), quantidade: 0, total: 0 };
      atual.quantidade += 1;
      atual.total += v.valor;
      map.set(chave, atual);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [vendas]);

  if (!ehDono) {
    return (
      <div className="card">
        <h3>Administração</h3>
        <p className="muted">Só o Admin da loja vê este painel. Entre com o PIN no aparelho do Admin e sincronize.</p>
      </div>
    );
  }

  async function bloquear(uid: string, valor: boolean) {
    setBusy(true); setAviso("");
    try {
      await bloquearMembro(LOJA_NUVEM_ID, uid, valor);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao atualizar o membro.");
    } finally { setBusy(false); }
  }

  async function remover(uid: string, rotulo: string) {
    if (!confirm(`Remover ${rotulo} da loja?`)) return;
    setBusy(true); setAviso("");
    try {
      await removerMembro(LOJA_NUVEM_ID, uid);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao remover.");
    } finally { setBusy(false); }
  }

  async function editarNome(uid: string) {
    const n = (nomeEdit[uid] ?? membros.find((m) => m.uid === uid)?.nome ?? "").trim();
    setBusy(true); setAviso("");
    try {
      await alterarNomeMembro(uid, n);
      setAviso("Nome atualizado.");
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível alterar o nome.");
    } finally { setBusy(false); }
  }

  async function salvarLoja() {
    await atualizarConfig({
      nome_loja: nome, telefone: tel, mensagem_cardapio: msg,
      taxa_entrega: Number(taxa.replace(",", ".")) || 0, observacoes: obs, loja: codigo.trim() || loja,
      hora_lembrete_padrao: horaLembrete || "12:00",
    });
    setAviso("Configurações da loja salvas. Sincronize para enviar à nuvem.");
  }

  async function trocarPin() {
    if (pinNovo !== pinConfirma) { setAviso("Os dois campos do novo PIN precisam ser iguais."); return; }
    setBusy(true); setAviso("");
    try {
      const codigoNovo = await alterarPin(pinNovo, codigoRecuperacao);
      setPinNovo(""); setPinConfirma("");
      setNovoCodigo(codigoNovo);
      setAviso(`PIN atualizado. O código de recuperação também mudou: ${codigoNovo}. Anote-o fora do telefone.`);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível alterar o PIN.");
    } finally { setBusy(false); }
  }

  async function passarLideranca() {
    if (!alvoLider) return;
    const alvo = membros.find((m) => m.uid === alvoLider);
    if (!confirm(`Passar o papel de Admin para ${alvo?.nome || alvoLider}? Você deixa de ser o Admin neste aparelho.`)) return;
    setBusy(true); setAviso("");
    try {
      await transferirLideranca(alvoLider);
      setAviso("Papel de Admin transferido. Peça à pessoa para sincronizar neste e no outro aparelho.");
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível transferir o papel de Admin.");
    } finally { setBusy(false); }
  }

  const codigoMostrado = novoCodigo || codigoRecuperacao;
  const meuUid = usuario?.uid;

  return (
    <div>
      {dialogo}
      <div className="tabs tabs-admin">
        <button className={aba === "equipe" ? "on" : ""} onClick={() => setAba("equipe")}>Equipe</button>
        <button className={aba === "acesso" ? "on" : ""} onClick={() => setAba("acesso")}>Acesso</button>
        <button className={aba === "atividades" ? "on" : ""} onClick={() => setAba("atividades")}>Atividades</button>
        <button className={aba === "faturamento" ? "on" : ""} onClick={() => setAba("faturamento")}>Por pessoa</button>
        <button className={aba === "loja" ? "on" : ""} onClick={() => setAba("loja")}>Loja</button>
      </div>
      {aviso && <div className="banner">{aviso}</div>}
      {!online && <p className="muted small">Conecte-se à internet para gerenciar a equipe, o PIN ou o papel de Admin.</p>}

      {aba === "equipe" && (
        <div className="card">
          <h3>Pessoas da loja</h3>
          <p className="muted small">Quem entra com o PIN da loja aparece aqui, com o nome que escolheu. Você pode bloquear ou remover um aparelho. Não dá para convidar por e-mail: o acesso é o PIN compartilhado.</p>
          <ul className="lista">
            {membros.map((m) => (
              <li key={m.uid} className="lista-item">
                <div className="grow">
                  <strong>{m.nome || m.uid.slice(0, 8)}</strong>
                  <div className="muted small">
                    {m.uid === equipe?.liderUid || m.papel === "lider" ? "Admin · " : ""}
                    {m.bloqueado ? "Bloqueado · " : ""}
                    Último acesso: {m.ultimoAcesso ? formatarDataHora(m.ultimoAcesso) : "ainda não entrou"}
                  </div>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <input className="input grow" value={nomeEdit[m.uid] ?? m.nome ?? ""} onChange={(e) => setNomeEdit((s) => ({ ...s, [m.uid]: e.target.value }))} aria-label={`Nome de ${m.nome || "membro"}`} />
                    <button className="btn btn-sm" disabled={busy || !online} onClick={() => void editarNome(m.uid)}>Salvar nome</button>
                  </div>
                </div>
                {m.uid !== meuUid && m.uid !== equipe?.liderUid && (
                  <div className="row wrap">
                    <button className="btn" disabled={busy || !online} onClick={() => void bloquear(m.uid, !m.bloqueado)}>
                      {m.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                    <button className="btn" disabled={busy || !online} onClick={() => void remover(m.uid, m.nome || m.uid)}>Remover</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aba === "acesso" && (
        <div className="card col">
          <h3>PIN e recuperação</h3>
          <p className="muted small">O PIN não fica gravado no aplicativo publicado. Só o Admin altera. Ao trocar o PIN, um código de recuperação novo é gerado.</p>
          {codigoMostrado ? (
            <p>Código de recuperação: <strong className="mono">{codigoMostrado}</strong></p>
          ) : (
            <p className="muted">Nenhum código de recuperação neste aparelho. Se você ainda é o Admin original, o código foi mostrado na primeira entrada. Se perdeu, altere o PIN para gerar um novo.</p>
          )}
          <label className="field">Novo PIN
            <input className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pinNovo} onChange={(e) => setPinNovo(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="4 a 8 números" />
          </label>
          <label className="field">Confirme o novo PIN
            <input className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pinConfirma} onChange={(e) => setPinConfirma(e.target.value.replace(/\D/g, "").slice(0, 8))} />
          </label>
          <button className="btn btn-primary" disabled={busy || !online || !pinNovo} onClick={() => void trocarPin()}>Alterar PIN</button>

          <h3 style={{ marginTop: 24 }}>Passar o papel de Admin</h3>
          <p className="muted small">Escolha outra pessoa já na equipe. Depois da transferência, só ela gerencia membros e o PIN.</p>
          <label className="field">Novo Admin
            <select className="input" value={alvoLider} onChange={(e) => setAlvoLider(e.target.value)}>
              <option value="">Selecione</option>
              {membros.filter((m) => m.uid !== meuUid && !m.bloqueado).map((m) => (
                <option key={m.uid} value={m.uid}>{m.nome || m.uid.slice(0, 8)}</option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy || !online || !alvoLider} onClick={() => void passarLideranca()}>Transferir liderança</button>
        </div>
      )}

      {aba === "atividades" && (
        <div className="card">
          <h3>Registro de atividades</h3>
          {atividades.length === 0 ? <p className="muted">Nenhuma atividade registrada ainda.</p> : (
            <ListaVirtual
              itens={atividades}
              chave={(a) => a.id}
              altura={420}
              alturaLinha={76}
              render={(a) => (
                <div className="lista-item">
                  <div className="grow">
                    <strong>{a.resumo}</strong>
                    <div className="muted small">{rotuloAutor(a.uid, a.email)} · {a.acao} · {a.colecao} · {formatarDataHora(a.em)}</div>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      )}

      {aba === "faturamento" && (
        <div className="card">
          <h3>Faturamento por pessoa</h3>
          <p className="muted small">Vendas agrupadas por quem registrou. Dados importados aparecem como “Importado”.</p>
          {porPessoa.length === 0 ? <p className="muted">Ainda não há vendas.</p> : (
            <ul className="lista">
              {porPessoa.map((p) => (
                <li key={p.rotulo} className="lista-item">
                  <div className="grow">
                    <strong>{p.rotulo}</strong>
                    <div className="muted small">{p.quantidade} venda{p.quantidade === 1 ? "" : "s"}</div>
                  </div>
                  <strong>{formatarReais(p.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aba === "faturamento" && (
        <div className="card col" data-testid="possiveis-duplicadas">
          <h3>Possíveis vendas duplicadas</h3>
          <p className="muted small">Mesmo valor e mesmo autor, registradas com até 5 segundos de intervalo. Nada é apagado sozinho: confira e remova só se tiver certeza.</p>
          {duplicatas.length === 0 ? <p className="muted">Nenhum grupo suspeito no momento.</p> : duplicatas.map((g, i) => (
            <div key={`${g.autor}-${g.valor}-${i}`} className="lista" style={{ marginBottom: 12 }}>
              <p><strong>{formatarReais(g.valor)}</strong> · {g.vendas.length} registros · {rotuloAutor(g.vendas[0].criadoPor, g.vendas[0].criadoPorEmail)}</p>
              {g.vendas.map((v) => (
                <div key={v.id} className="item">
                  <div className="grow">
                    <div className="muted small">{formatarDataHora(v.criado_em)} · {v.id.slice(0, 8)}</div>
                  </div>
                  <button className="btn btn-sm" data-testid={`apagar-duplicata-${v.id}`} onClick={() => void (async () => {
                    const ok = await confirmar({
                      titulo: "Apagar esta venda?",
                      descricao: `A venda de ${formatarReais(v.valor)} será removida do livro caixa. Isso não se desfaz.`,
                      confirmar: "Apagar",
                      destrutivo: true,
                    });
                    if (!ok) return;
                    await excluirVenda(v.id);
                  })()}>Apagar</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {aba === "loja" && (
        <div className="card">
          <h3>Configurações da loja</h3>
          <label className="field">Nome da loja<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="field">Código da loja<input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
          <p className="muted small">O código acima é só local. Na nuvem, todos os aparelhos que entram com o PIN compartilham o mesmo banco.</p>
          <label className="field">Telefone<input className="input" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
          <label className="field">Mensagem do cardápio<textarea className="input" value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
          <label className="field">Taxa de entrega<input className="input" value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" /></label>
          <label className="field">Observações<textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></label>
          <label className="field">Horário padrão do lembrete das encomendas
            <input className="input" type="time" value={horaLembrete} onChange={(e) => setHoraLembrete(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={() => void salvarLoja()}>Salvar</button>
        </div>
      )}

      <div className="card col" data-testid="diagnostico-leitor" style={{ marginTop: 16 }}>
        <h3>Diagnóstico do leitor</h3>
        <p className="muted small">Registro deste aparelho sobre a câmera e o leitor de código. Útil se o código de barras não abrir.</p>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => setLogLeitor(listarLogLeitor())}>Atualizar</button>
          <button type="button" className="btn" onClick={() => { limparLogLeitor(); setLogLeitor([]); }}>Limpar log</button>
        </div>
        {logLeitor.length === 0 ? <p className="muted">Ainda não há eventos.</p> : (
          <ul className="log-leitor">
            {logLeitor.map((ev, i) => (
              <li key={ev.em + String(i)} className={ev.nivel === "erro" ? "erro" : undefined}>
                {formatarDataHora(ev.em)} · {ev.msg}{ev.detalhe ? ` — ${ev.detalhe}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
