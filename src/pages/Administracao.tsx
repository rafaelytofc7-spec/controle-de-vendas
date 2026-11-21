import { useMemo, useState } from "react";
import { useStore } from "../store";
import { bloquearMembro, convidarMembro, removerMembro } from "../lib/sync";
import { formatarDataHora } from "../lib/datas";
import { formatarReais } from "../lib/dinheiro";
import { rotuloAutor } from "../lib/autoria";
import { AUTOR_IMPORTADO } from "../lib/types";

type Aba = "equipe" | "atividades" | "faturamento" | "loja";

export function Administracao() {
  const {
    ehDono, usuario, loja, online, membros, atividades, vendas, equipe,
    config, atualizarConfig, recarregar,
  } = useStore();
  const [aba, setAba] = useState<Aba>("equipe");
  const [email, setEmail] = useState("");
  const [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false);
  const [nome, setNome] = useState(config.nome_loja);
  const [tel, setTel] = useState(config.telefone);
  const [msg, setMsg] = useState(config.mensagem_cardapio);
  const [taxa, setTaxa] = useState(String(config.taxa_entrega).replace(".", ","));
  const [obs, setObs] = useState(config.observacoes);
  const [codigo, setCodigo] = useState(loja);

  const convites = (equipe?.membrosEmails ?? []).filter(
    (e) => e && !membros.some((m) => m.email === e),
  );

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
        <p className="muted">Só a pessoa dona da loja vê este painel. Entre com a conta dona e sincronize.</p>
      </div>
    );
  }

  async function convidar() {
    setBusy(true); setAviso("");
    try {
      await convidarMembro(loja, email);
      setEmail("");
      setAviso("Convite registrado. Peça à pessoa para entrar com esse e-mail e a mesma configuração do Firebase.");
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível convidar.");
    } finally { setBusy(false); }
  }

  async function bloquear(uid: string, valor: boolean) {
    setBusy(true); setAviso("");
    try {
      await bloquearMembro(loja, uid, valor);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao atualizar o membro.");
    } finally { setBusy(false); }
  }

  async function remover(uid: string, mail: string) {
    if (!confirm(`Remover ${mail || uid} da loja?`)) return;
    setBusy(true); setAviso("");
    try {
      await removerMembro(loja, uid, mail);
      await recarregar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao remover.");
    } finally { setBusy(false); }
  }

  async function salvarLoja() {
    await atualizarConfig({
      nome_loja: nome, telefone: tel, mensagem_cardapio: msg,
      taxa_entrega: Number(taxa.replace(",", ".")) || 0, observacoes: obs, loja: codigo.trim() || loja,
    });
    setAviso("Configurações da loja salvas. Sincronize para enviar à nuvem.");
  }

  return (
    <div>
      <div className="tabs tabs-admin">
        <button className={aba === "equipe" ? "on" : ""} onClick={() => setAba("equipe")}>Equipe</button>
        <button className={aba === "atividades" ? "on" : ""} onClick={() => setAba("atividades")}>Atividades</button>
        <button className={aba === "faturamento" ? "on" : ""} onClick={() => setAba("faturamento")}>Por pessoa</button>
        <button className={aba === "loja" ? "on" : ""} onClick={() => setAba("loja")}>Loja</button>
      </div>
      {aviso && <div className="banner">{aviso}</div>}
      {!online && <p className="muted small">Conecte-se à internet para convidar, bloquear ou remover alguém.</p>}

      {aba === "equipe" && (
        <div className="card">
          <h3>Pessoas da loja</h3>
          <p className="muted small">Quem você adicionar usa o aplicativo normalmente. Só você gerencia a equipe e as configurações.</p>
          <label className="field">E-mail da pessoa
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !online || !usuario} onClick={() => void convidar()}>Adicionar por e-mail</button>
          <ul className="lista">
            {membros.map((m) => (
              <li key={m.uid} className="lista-item">
                <div className="grow">
                  <strong>{m.email || m.uid.slice(0, 8)}</strong>
                  <div className="muted small">
                    {m.uid === equipe?.ownerUid ? "Dona da loja · " : ""}
                    {m.bloqueado ? "Bloqueada · " : ""}
                    Último acesso: {m.ultimoAcesso ? formatarDataHora(m.ultimoAcesso) : "ainda não entrou"}
                  </div>
                </div>
                {m.uid !== equipe?.ownerUid && (
                  <div className="row wrap">
                    <button className="btn" disabled={busy || !online} onClick={() => void bloquear(m.uid, !m.bloqueado)}>
                      {m.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                    <button className="btn" disabled={busy || !online} onClick={() => void remover(m.uid, m.email)}>Remover</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {convites.length > 0 && (
            <>
              <h4>Convites pendentes</h4>
              <ul className="lista">
                {convites.map((e) => <li key={e} className="lista-item"><span>{e}</span><span className="muted small">Aguardando entrar</span></li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {aba === "atividades" && (
        <div className="card">
          <h3>Registro de atividades</h3>
          {atividades.length === 0 ? <p className="muted">Nenhuma atividade registrada ainda.</p> : (
            <ul className="lista">
              {atividades.map((a) => (
                <li key={a.id} className="lista-item">
                  <div className="grow">
                    <strong>{a.resumo}</strong>
                    <div className="muted small">{rotuloAutor(a.uid, a.email)} · {a.acao} · {a.colecao} · {formatarDataHora(a.em)}</div>
                  </div>
                </li>
              ))}
            </ul>
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

      {aba === "loja" && (
        <div className="card">
          <h3>Configurações da loja</h3>
          <label className="field">Nome da loja<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="field">Código da loja<input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label>
          <label className="field">Telefone<input className="input" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
          <label className="field">Mensagem do cardápio<textarea className="input" value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
          <label className="field">Taxa de entrega<input className="input" value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" /></label>
          <label className="field">Observações<textarea className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></label>
          <button className="btn btn-primary" onClick={() => void salvarLoja()}>Salvar</button>
        </div>
      )}
    </div>
  );
}
