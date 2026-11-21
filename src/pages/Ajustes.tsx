import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { useStore, exportarDados, montarBackup } from "../store";
import { configValida, iniciarFirebase } from "../lib/firebase";
import { carregarBackupDoDrive, carregarGis, obterTokenDrive, salvarBackupNoDrive } from "../lib/drive";
import type { FirebaseWebConfig } from "../lib/types";
import { GUIA_FIREBASE } from "../lib/guia";
import { ehNativo, exportarArquivo } from "../lib/plataforma";
import { APP_VERSION, APK_RELEASE_URL, buscarVersaoRemota, temAtualizacao } from "../lib/versao";

export function Ajustes() {
  const store = useStore();
  const { config, atualizarConfig, loja, firebaseCfg, salvarFirebase, usuario, online, syncando, progressoSync, erroSync, tentarSync, importarArquivo, ehDono } = store;
  const [tab, setTab] = useState<"loja" | "backup" | "nuvem" | "guia">("loja");
  const [nome, setNome] = useState(config.nome_loja);
  const [tel, setTel] = useState(config.telefone);
  const [msg, setMsg] = useState(config.mensagem_cardapio);
  const [taxa, setTaxa] = useState(String(config.taxa_entrega).replace(".", ","));
  const [obs, setObs] = useState(config.observacoes);
  const [codigo, setCodigo] = useState(loja);
  const [aviso, setAviso] = useState("");
  const [cfgTxt, setCfgTxt] = useState(firebaseCfg ? JSON.stringify(firebaseCfg, null, 2) : "");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [substituirTudo, setSubstituirTudo] = useState(false);
  const [versaoRemota, setVersaoRemota] = useState<string>();
  const nativo = ehNativo();
  const podeEditarLoja = ehDono || !usuario;

  useEffect(() => {
    const ac = new AbortController();
    void buscarVersaoRemota(ac.signal).then((info) => {
      if (info?.version) setVersaoRemota(info.version);
    });
    return () => ac.abort();
  }, []);

  async function salvarLoja() {
    if (!podeEditarLoja) { setAviso("Só a pessoa dona altera as configurações da loja."); return; }
    await atualizarConfig({
      nome_loja: nome, telefone: tel, mensagem_cardapio: msg,
      taxa_entrega: Number(taxa.replace(",", ".")) || 0, observacoes: obs, loja: codigo.trim() || loja,
    });
    setAviso("Configurações salvas neste aparelho.");
  }

  async function exportar() {
    const dados = await exportarDados();
    const json = JSON.stringify(montarBackup(dados), null, 2);
    const nomeArq = `controle-de-vendas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const como = await exportarArquivo(nomeArq, json);
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
      setAviso("Configuração do Firebase salva neste aparelho.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "JSON inválido.");
    }
  }

  async function loginEmail(criar: boolean) {
    if (!firebaseCfg || !configValida(firebaseCfg)) { setAviso("Cole a configuração do Firebase antes."); return; }
    setBusy(true);
    try {
      const { auth } = iniciarFirebase(firebaseCfg);
      if (criar) await createUserWithEmailAndPassword(auth, email, senha);
      else await signInWithEmailAndPassword(auth, email, senha);
      setAviso("Entrou com e-mail.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha no login.");
    } finally { setBusy(false); }
  }

  async function loginGoogle() {
    if (!firebaseCfg || !configValida(firebaseCfg)) { setAviso("Cole a configuração do Firebase antes."); return; }
    setBusy(true);
    try {
      const { auth } = iniciarFirebase(firebaseCfg);
      await signInWithPopup(auth, new GoogleAuthProvider());
      setAviso("Entrou com o Google.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha no login Google.");
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
        <button className={tab === "guia" ? "on" : ""} onClick={() => setTab("guia")}>Guia</button>
      </div>
      {aviso && <div className="banner" style={{ marginBottom: 12 }}>{aviso}</div>}
      {tab === "loja" && (
        <div className="card col">
          <h3>Dados da loja</h3>
          {!podeEditarLoja && <p className="muted">Só a pessoa dona altera as configurações da loja. Você continua usando o caixa, o cardápio e as entregas normalmente.</p>}
          <label className="field">Nome da loja<input className="input" value={nome} disabled={!podeEditarLoja} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="field">WhatsApp / telefone<input className="input" value={tel} disabled={!podeEditarLoja} onChange={(e) => setTel(e.target.value)} /></label>
          <label className="field">Mensagem do cardápio<textarea className="input" value={msg} disabled={!podeEditarLoja} onChange={(e) => setMsg(e.target.value)} /></label>
          <label className="field">Taxa de entrega<input className="input num" value={taxa} disabled={!podeEditarLoja} onChange={(e) => setTaxa(e.target.value)} /></label>
          <label className="field">Observações<textarea className="input" value={obs} disabled={!podeEditarLoja} onChange={(e) => setObs(e.target.value)} /></label>
          <label className="field">Código da loja (usado na nuvem)<input className="input" value={codigo} disabled={!podeEditarLoja} onChange={(e) => setCodigo(e.target.value)} /></label>
          {podeEditarLoja && <button className="btn btn-primary" onClick={() => void salvarLoja()}>Salvar</button>}
        </div>
      )}
      {tab === "backup" && (
        <div className="card col">
          <h3>Backup</h3>
          <p className="muted">Exporte um arquivo JSON com tudo que está neste aparelho. Para trazer dados novos, importe o arquivo de atualização: ele mescla pelo id e não duplica o que já estava no caixa. O histórico da loja não vem embutido no aplicativo.</p>
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
          <h3>Firebase</h3>
          <p className="muted">Cole o objeto de configuração web do Firebase. Ele fica só neste aparelho. A primeira conta que entrar vira a dona da loja. As demais pessoas entram com e-mail e senha depois de serem convidadas.</p>
          {nativo && <p className="muted small">No aplicativo Android, use e-mail e senha. O login com o Google em geral não abre a janela de conta neste WebView. No Firebase, inclua <strong>localhost</strong> em Domínios autorizados.</p>}
          <textarea className="input mono" value={cfgTxt} onChange={(e) => setCfgTxt(e.target.value)} placeholder='{ "apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "...", "googleClientId": "....apps.googleusercontent.com" }' />
          <button className="btn btn-primary" onClick={() => void salvarCfgFb()}>Salvar configuração</button>
          {configValida(firebaseCfg) && (
            <>
              <p className="muted small">Projeto: {firebaseCfg?.projectId} · {online ? "online" : "offline"} · {usuario ? `logado como ${usuario.email}` : "não logado"}</p>
              {syncando && <p className="muted">Sincronizando… {progressoSync ? `${progressoSync.fase} ${progressoSync.feito}/${progressoSync.total}` : ""}</p>}
              {erroSync && <div className="banner erro">{erroSync}</div>}
              {usuario ? (
                <div className="row wrap">
                  <button className="btn btn-primary grow" disabled={!online || syncando} onClick={() => void tentarSync()}>Sincronizar agora</button>
                  <button className="btn grow" onClick={() => firebaseCfg && signOut(iniciarFirebase(firebaseCfg).auth)}>Sair</button>
                </div>
              ) : (
                <>
                  <label className="field">E-mail<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                  <label className="field">Senha<input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
                  <div className="row">
                    <button className="btn grow" disabled={busy} onClick={() => void loginEmail(false)}>Entrar</button>
                    <button className="btn grow" disabled={busy} onClick={() => void loginEmail(true)}>Criar conta</button>
                  </div>
                  {!nativo && <button className="btn btn-lima btn-block" disabled={busy} onClick={() => void loginGoogle()}>Entrar com o Google</button>}
                  {nativo && <p className="muted small">O botão do Google não aparece no aplicativo Android porque a janela de login costuma falhar. Use e-mail e senha.</p>}
                </>
              )}
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
