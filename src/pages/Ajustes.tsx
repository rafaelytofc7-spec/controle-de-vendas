import { useEffect, useState } from "react";
import { useStore, exportarDados, montarBackup, marcarBackupFeito } from "../store";
import { configValida } from "../lib/firebase";
import { carregarBackupDoDrive, carregarGis, obterTokenDrive, salvarBackupNoDrive } from "../lib/drive";
import type { FirebaseWebConfig, PrefsNotificacao } from "../lib/types";
import { pedirPermissaoNotificacoes, tocarSomInApp } from "../lib/notificacoes";
import { GUIA_FIREBASE } from "../lib/guia";
import { ehNativo, exportarArquivo } from "../lib/plataforma";
import { APP_VERSION, APK_RELEASE_URL, buscarVersaoRemota, temAtualizacao } from "../lib/versao";
import { formatarDataHora } from "../lib/datas";

export function Ajustes() {
  const store = useStore();
  const { config, atualizarConfig, loja, firebaseCfg, salvarFirebase, limparFirebase, firebaseOverride, usuario, online, syncando, progressoSync, erroSync, pendentesCount, ultimoSync, tentarSync, importarArquivo, ehDono, entrarNaNuvem, recuperarLider, sairDaNuvem, equipe, codigoRecuperacao, prefsNotificacao, salvarPrefs, statusNuvem } = store;
  const [tab, setTab] = useState<"loja" | "backup" | "nuvem" | "avisos" | "guia">("loja");
  const [nome, setNome] = useState(config.nome_loja);
  const [tel, setTel] = useState(config.telefone);
  const [msg, setMsg] = useState(config.mensagem_cardapio);
  const [taxa, setTaxa] = useState(String(config.taxa_entrega).replace(".", ","));
  const [obs, setObs] = useState(config.observacoes);
  const [horaLembrete, setHoraLembrete] = useState(config.hora_lembrete_padrao || "12:00");
  const [codigo, setCodigo] = useState(loja);
  const [aviso, setAviso] = useState("");
  const [cfgTxt, setCfgTxt] = useState(firebaseCfg ? JSON.stringify(firebaseCfg, null, 2) : "");
  const [nomePessoa, setNomePessoa] = useState(equipe?.meuNome ?? "");
  const [pin, setPin] = useState("");
  const [codigoRec, setCodigoRec] = useState("");
  const [mostrarRecuperacao, setMostrarRecuperacao] = useState(false);
  const [busy, setBusy] = useState(false);
  const [substituirTudo, setSubstituirTudo] = useState(false);
  const [versaoRemota, setVersaoRemota] = useState<string>();
  const nativo = ehNativo();

  useEffect(() => {
    setCfgTxt(firebaseOverride && firebaseCfg ? JSON.stringify(firebaseCfg, null, 2) : "");
  }, [firebaseOverride, firebaseCfg]);
  const podeEditarLoja = ehDono || !usuario;

  useEffect(() => {
    const ac = new AbortController();
    void buscarVersaoRemota(ac.signal).then((info) => {
      if (info?.version) setVersaoRemota(info.version);
    });
    return () => ac.abort();
  }, []);

  async function salvarLoja() {
    if (!podeEditarLoja) { setAviso("Só o Admin altera as configurações da loja."); return; }
    await atualizarConfig({
      nome_loja: nome, telefone: tel, mensagem_cardapio: msg,
      taxa_entrega: Number(taxa.replace(",", ".")) || 0, observacoes: obs, loja: codigo.trim() || loja,
      hora_lembrete_padrao: horaLembrete || "12:00",
    });
    setAviso("Configurações salvas neste aparelho.");
  }

  async function exportar() {
    const dados = await exportarDados();
    const json = JSON.stringify(montarBackup(dados), null, 2);
    const nomeArq = `controle-de-vendas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const como = await exportarArquivo(nomeArq, json);
    await marcarBackupFeito();
    setAviso(como === "share"
      ? "Escolha onde guardar ou compartilhar o arquivo."
      : "Arquivo baixado. Guarde em um lugar seguro.");
  }

  async function importar(f: File | null) {
    if (!f) return;
    setBusy(true); setAviso("");
    try {
      const dados = await importarArquivo(JSON.parse(await f.text()), substituirTudo);
      const total = dados.vendas.reduce((a, v) => a + v.valor, 0);
      const modo = substituirTudo ? "Substituído" : "Mesclado pelo id";
      setAviso(`${modo}: ${dados.vendas.length.toLocaleString("pt-BR")} vendas no arquivo, total ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Registros já existentes não são duplicados.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha na importação.");
    } finally { setBusy(false); }
  }

  async function salvarCfgFb() {
    try {
      const parsed = JSON.parse(cfgTxt) as FirebaseWebConfig;
      if (!configValida(parsed)) throw new Error("Faltam apiKey, authDomain, projectId ou appId.");
      await salvarFirebase(parsed);
      setAviso("Configuração alternativa salva neste aparelho. Ela substitui a nuvem padrão.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "JSON inválido.");
    }
  }

  async function entrarPin() {
    setBusy(true); setAviso("");
    try {
      const r = await entrarNaNuvem(nomePessoa, pin);
      setPin("");
      if (r.primeiraVez && r.codigoRecuperacao) {
        setAviso(`Você é o Admin desta loja. Anote o código de recuperação: ${r.codigoRecuperacao}. Ele aparece só agora neste aparelho. Sem ele, se este aparelho for perdido, não dá para retomar o papel de Admin.`);
      } else if (r.codigoRecuperacao) {
        setAviso("Entrou na loja compartilhada. A sincronização começa sozinha.");
      } else {
        setAviso("Entrou na loja compartilhada. A sincronização começa sozinha.");
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally { setBusy(false); }
  }

  async function recuperar() {
    setBusy(true); setAviso("");
    try {
      await recuperarLider(nomePessoa, pin, codigoRec);
      setPin(""); setCodigoRec("");
      setAviso("O papel de Admin voltou para este aparelho. Anote de novo o código de recuperação guardado na Administração.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível recuperar o papel de Admin.");
    } finally { setBusy(false); }
  }

  async function driveSalvar() {
    const clientId = firebaseCfg?.googleClientId;
    if (!clientId) { setAviso("Informe o Client ID do Google na configuração (campo googleClientId). Sem isso, use o download do arquivo."); return; }
    setBusy(true);
    try {
      await carregarGis();
      const token = await obterTokenDrive(clientId);
      const dados = await exportarDados();
      await salvarBackupNoDrive(token, JSON.stringify(montarBackup(dados), null, 2));
      setAviso("Backup salvo no Google Drive (pasta oculta do aplicativo).");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha no Drive.");
    } finally { setBusy(false); }
  }

  async function driveCarregar() {
    const clientId = firebaseCfg?.googleClientId;
    if (!clientId) { setAviso("Informe o googleClientId ou use o arquivo local."); return; }
    setBusy(true);
    try {
      await carregarGis();
      const token = await obterTokenDrive(clientId, "");
      const texto = await carregarBackupDoDrive(token);
      const dados = await importarArquivo(JSON.parse(texto));
      setAviso(`Backup do Drive importado: ${dados.vendas.length} vendas.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha no Drive.");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="tabs">
        <button className={tab === "loja" ? "on" : ""} onClick={() => setTab("loja")}>Loja</button>
        <button className={tab === "backup" ? "on" : ""} onClick={() => setTab("backup")}>Backup</button>
        <button className={tab === "nuvem" ? "on" : ""} onClick={() => setTab("nuvem")}>Nuvem</button>
        <button className={tab === "avisos" ? "on" : ""} onClick={() => setTab("avisos")}>Avisos</button>
        <button className={tab === "guia" ? "on" : ""} onClick={() => setTab("guia")}>Guia</button>
      </div>
      {aviso && <div className="banner" style={{ marginBottom: 12 }}>{aviso}</div>}
      {tab === "loja" && (
        <div className="card col">
          <h3>Dados da loja</h3>
          {!podeEditarLoja && <p className="muted">Só o Admin altera as configurações da loja. Você continua usando o caixa, o cardápio e as entregas normalmente.</p>}
          <label className="field">Nome da loja
            <input className="input" value={nome} disabled={!podeEditarLoja} onChange={(e) => setNome(e.target.value)} />
          </label>
          <p className="muted small">Este nome aparece no topo do aplicativo, na tela inicial e no ícone de abertura. Qualquer Admin pode alterar.</p>
          <label className="field">WhatsApp / telefone<input className="input" value={tel} disabled={!podeEditarLoja} onChange={(e) => setTel(e.target.value)} /></label>
          <label className="field">Mensagem do cardápio<textarea className="input" value={msg} disabled={!podeEditarLoja} onChange={(e) => setMsg(e.target.value)} /></label>
          <label className="field">Taxa de entrega<input className="input num" value={taxa} disabled={!podeEditarLoja} onChange={(e) => setTaxa(e.target.value)} /></label>
          <label className="field">Observações<textarea className="input" value={obs} disabled={!podeEditarLoja} onChange={(e) => setObs(e.target.value)} /></label>
          <label className="field">Código da loja (local)<input className="input" value={codigo} disabled={!podeEditarLoja} onChange={(e) => setCodigo(e.target.value)} /></label>
          <p className="muted small">Na nuvem, todos que entram com o PIN compartilham o mesmo banco. Este código é só local.</p>
          <label className="field">Horário padrão do lembrete das encomendas
            <input className="input" type="time" value={horaLembrete} disabled={!podeEditarLoja} onChange={(e) => setHoraLembrete(e.target.value)} />
          </label>
          {podeEditarLoja && <button className="btn btn-primary" onClick={() => void salvarLoja()}>Salvar</button>}
        </div>
      )}
      {tab === "backup" && (
        <div className="card col">
          <h3>Backup</h3>
          <p className="muted">Exporte um arquivo JSON com tudo que está neste aparelho. Para trazer as vendas novas, importe o arquivo de atualização mais recente (caixa-importacao-2026-11-22-2049.json) em Backup: ele mescla pelo id e não duplica o que já estava no caixa. O histórico da loja não vem embutido no aplicativo.</p>
          <button className="btn btn-primary" onClick={() => void exportar()}>{nativo ? "Exportar / compartilhar backup" : "Baixar arquivo de backup"}</button>
          <label className="field">Importar arquivo do aparelho (mescla pelo id)
            <input className="input" type="file" accept="application/json,.json" disabled={busy} onChange={(e) => void importar(e.target.files?.[0] ?? null)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={substituirTudo} onChange={(e) => setSubstituirTudo(e.target.checked)} />
            Substituir tudo (apaga o que só existe neste aparelho)
          </label>
          <hr style={{ border: 0, borderTop: "1px solid var(--linha)", margin: "8px 0" }} />
          <h3>Google Drive</h3>
          <p className="muted small">O botão salva na pasta oculta do aplicativo (appDataFolder). É preciso colar também o Client ID OAuth do Google na aba Nuvem.</p>
          <button className="btn" disabled={busy} onClick={() => void driveSalvar()}>Salvar no Google Drive</button>
          <button className="btn" disabled={busy} onClick={() => void driveCarregar()}>Restaurar do Google Drive</button>
        </div>
      )}
      {tab === "nuvem" && (
        <div className="card col">
          <h3>Nuvem compartilhada</h3>
          <p className="muted">A nuvem já vem configurada. Na primeira abertura o aplicativo pede o nome e o PIN e já entra no mesmo banco. O primeiro aparelho vira Admin. A sincronização é automática: não é preciso tocar em “Sincronizar agora”, salvo se quiser forçar uma nova tentativa.</p>
          <p className="muted small">Só cole um JSON abaixo se quiser usar outro projeto Firebase. A configuração alternativa fica só neste aparelho.</p>
          <textarea className="input mono" value={cfgTxt} onChange={(e) => setCfgTxt(e.target.value)} placeholder='Substituição opcional: { "apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..." }' />
          <div className="row wrap">
            <button className="btn" onClick={() => void salvarCfgFb()}>Salvar substituição</button>
            {firebaseOverride && <button className="btn" onClick={() => void limparFirebase().then(() => setAviso("Voltou à nuvem padrão do aplicativo."))}>Usar nuvem padrão</button>}
          </div>
          {configValida(firebaseCfg) && (
            <>
              <p className="muted small">Projeto: {firebaseCfg?.projectId} · {online ? "online" : "offline"} · {usuario ? (equipe?.ehLider || ehDono ? `Admin: ${equipe?.meuNome || usuario.displayName || "você"}` : `conectado: ${equipe?.meuNome || usuario.displayName || "aparelho"}`) : "não conectado"} · {statusNuvem}</p>
              <div className="status-sync-detalhe" data-testid="status-sync-detalhe">
                <div data-testid="pendentes-sync">{pendentesCount === 0 ? "Nada pendente de envio." : pendentesCount === 1 ? "1 alteração pendente de envio." : `${pendentesCount} alterações pendentes de envio.`}</div>
                <div data-testid="ultimo-sync">{ultimoSync ? `Último sync: ${formatarDataHora(ultimoSync)}` : "Ainda não sincronizou neste aparelho."}</div>
              </div>
              {syncando && <p className="muted">Sincronizando… {progressoSync ? `${progressoSync.fase} ${progressoSync.feito}/${progressoSync.total}` : ""}</p>}
              {erroSync && <div className="banner erro" data-testid="erro-sync-motivo">{erroSync}</div>}
              {usuario && equipe ? (
                <>
                  <div className="row wrap">
                    <button className="btn grow" data-testid="sincronizar-agora" disabled={!online || syncando} onClick={() => void tentarSync()}>Sincronizar agora</button>
                    <button className="btn grow" onClick={() => {
                      if (!confirm("Sair deste aparelho cria uma nova identidade na próxima entrada. O Admin deve guardar o código de recuperação antes. Continuar?")) return;
                      void sairDaNuvem();
                    }}>Sair deste aparelho</button>
                  </div>
                  {codigoRecuperacao && (equipe.ehLider || ehDono) && (
                    <p className="muted small">Código de recuperação neste aparelho: <strong>{codigoRecuperacao}</strong>. Guarde-o fora do telefone.</p>
                  )}
                </>
              ) : (
                <>
                  <label className="field">Seu nome
                    <input className="input" value={nomePessoa} onChange={(e) => setNomePessoa(e.target.value)} placeholder="Como você aparece para a equipe" autoComplete="name" />
                  </label>
                  <label className="field">PIN da loja
                    <input className="input" type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="4 a 8 números" />
                  </label>
                  <button className="btn btn-primary btn-block" disabled={busy || !online} onClick={() => void entrarPin()}>Entrar com o PIN</button>
                  <button className="btn" type="button" onClick={() => setMostrarRecuperacao((v) => !v)}>Tenho um código de recuperação</button>
                  {mostrarRecuperacao && (
                    <>
                      <label className="field">Código de recuperação
                        <input className="input mono" value={codigoRec} onChange={(e) => setCodigoRec(e.target.value.toUpperCase())} placeholder="8 letras ou números" autoCapitalize="characters" />
                      </label>
                      <button className="btn btn-block" disabled={busy || !online} onClick={() => void recuperar()}>Recuperar liderança</button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === "avisos" && (
        <div className="card col">
          <h3>Avisos e som</h3>
          <p className="muted small">Os avisos são deste aparelho. No Android eles tocam com som no canal de notificações, inclusive com o aplicativo fechado, depois que este aparelho sincronizou. Aberto, também toca um som no aplicativo. Sem um servidor de push (FCM), o outro celular só agenda o aviso depois de sincronizar.</p>
          <button className="btn" onClick={() => void pedirPermissaoNotificacoes().then((ok) => setAviso(ok ? "Permissão de notificações ok. Testando o som…" : "Permissão negada. Ative as notificações nas configurações do Android.")).then(() => tocarSomInApp(prefsNotificacao))}>Testar som e permissão</button>
          <label className="check"><input type="checkbox" checked={prefsNotificacao.som} onChange={(e) => void salvarPrefs({ ...prefsNotificacao, som: e.target.checked })} /> Tocar som</label>
          {([
            ["encomendaNova", "Nova encomenda (todos os aparelhos)"],
            ["encomendaAtrasada", "Encomenda atrasada e lembrete do horário"],
            ["novoMembro", "Alguém novo entrou (só o Admin)"],
            ["alteracaoOutro", "Venda ou edição feita por outra pessoa"],
            ["erroSync", "Falha na sincronização"],
            ["lembreteBackup", "Lembrete de backup (a cada 7 dias)"],
          ] as const).map(([k, rotulo]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={prefsNotificacao[k]} onChange={(ev) => void salvarPrefs({ ...prefsNotificacao, [k]: ev.target.checked })} /> {rotulo}
            </label>
          ))}
          {ehDono && (
            <>
              <hr style={{ border: 0, borderTop: "1px solid var(--linha)", margin: "8px 0" }} />
              <p className="muted small">Como Admin, você define o padrão para aparelhos novos. Cada pessoa ainda pode ligar ou desligar no próprio celular.</p>
              <button className="btn" onClick={() => void atualizarConfig({ notificacoes_padrao: prefsNotificacao }).then(() => setAviso("Padrão de avisos salvo na loja."))}>Usar estes avisos como padrão da loja</button>
            </>
          )}
        </div>
      )}
      {tab === "guia" && (
        <div className="card">
          <h3>Como ligar o Firebase</h3>
          <pre className="guia">{GUIA_FIREBASE}</pre>
        </div>
      )}
      <p className="muted small" style={{ marginTop: 16 }}>
        Versão {APP_VERSION}
        {versaoRemota ? (temAtualizacao(APP_VERSION, versaoRemota)
          ? ` · Há uma versão nova (${versaoRemota}). `
          : " · Você está na versão mais recente. ")
          : " · "}
        <a href={APK_RELEASE_URL} target="_blank" rel="noreferrer">Baixar APK</a>
      </p>
    </div>
  );
}
