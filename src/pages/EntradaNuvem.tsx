import { useEffect, useState } from "react";
import { useStore } from "../store";
import { NOME_LOJA_PADRAO } from "../lib/marca";
import { nomeValido } from "../lib/acesso";

export function EntradaNuvem() {
  const { entrarNaNuvem, recuperarLider, online, syncando, progressoSync, precisaReentrarPin, nomeReingresso } = useStore();
  const [nome, setNome] = useState(nomeReingresso);
  const [codigo, setCodigo] = useState("");
  const [mostrarRecuperacao, setMostrarRecuperacao] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (nomeReingresso && !nome) setNome(nomeReingresso);
  }, [nomeReingresso, nome]);

  async function entrar() {
    setErro(""); setAviso("");
    if (!online) {
      setErro("É preciso ter internet nesta primeira entrada. Depois o aplicativo funciona sem rede e sincroniza sozinho quando a conexão voltar.");
      return;
    }
    if (!nomeValido(nome)) { setErro("Informe um nome de 2 a 40 letras."); return; }
    setBusy(true);
    try {
      if (mostrarRecuperacao && codigo.trim()) {
        await recuperarLider(nome, codigo);
        setAviso("O papel de Admin voltou para este aparelho.");
        return;
      }
      const r = await entrarNaNuvem(nome);
      if (r.primeiraVez && r.codigoRecuperacao) {
        setAviso(`Você é o Admin desta loja. Anote o código de recuperação: ${r.codigoRecuperacao}. Ele aparece só agora neste aparelho.`);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  const ocupado = busy || syncando;

  return (
    <div className="app">
      <header className="header">
        <div className="header-marca">
          <img className="logo-cesta" src={`${import.meta.env.BASE_URL}marca-cesta.png`} alt="" />
          <div className="grow">
            <div className="sub">{NOME_LOJA_PADRAO}</div>
            <h1>Controle de Vendas</h1>
          </div>
        </div>
      </header>
      <main className="page">
        <div className="card col porta-entrada" data-testid="porta-entrada">
          <div className="splash" style={{ minHeight: 0, padding: "8px 0 16px" }}>
            <img src={`${import.meta.env.BASE_URL}marca-cesta.png`} alt="" style={{ width: 72, height: 72, borderRadius: 18 }} />
            <p className="splash-loja">{NOME_LOJA_PADRAO}</p>
          </div>
          <h2>{precisaReentrarPin ? "Entre de novo na loja" : "Entrar na loja"}</h2>
          {precisaReentrarPin && (
            <div className="banner aviso-atualizacao" data-testid="porta-reingresso">
              Este aparelho não está reconhecido na nuvem (a sessão pode ter mudado depois de reinstalação ou da limpeza dos dados). Entre de novo com o mesmo nome. As vendas deste aparelho continuam aqui.
            </div>
          )}
          <p className="muted">Todo mundo usa o mesmo banco na nuvem. Escreva o seu nome (é obrigatório). Ele aparece em cada venda que você registrar e na tela Equipe. O primeiro aparelho vira Admin; os outros entram só com o nome.</p>
          {!online && (
            <div className="banner erro" data-testid="porta-offline">
              É preciso ter internet nesta primeira entrada. Depois o aplicativo funciona sem rede e sincroniza sozinho quando a conexão voltar.
            </div>
          )}
          {aviso && <div className="banner ok">{aviso}</div>}
          {erro && <div className="banner erro" data-testid="porta-erro">{erro}</div>}
          <label className="field">Seu nome
            <input
              className="input"
              data-testid="porta-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como você aparece para a equipe"
              autoComplete="name"
              autoFocus
            />
          </label>
          <button className="btn btn-primary btn-block" data-testid="porta-entrar" disabled={ocupado || !online} onClick={() => void entrar()}>
            {ocupado ? (progressoSync ? `Sincronizando… ${progressoSync.feito}/${progressoSync.total}` : "Entrando…") : "Entrar"}
          </button>
          <button className="btn" type="button" onClick={() => setMostrarRecuperacao((v) => !v)}>Tenho um código de recuperação</button>
          {mostrarRecuperacao && (
            <>
              <label className="field">Código de recuperação
                <input className="input mono" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="8 letras ou números" autoCapitalize="characters" />
              </label>
              <button className="btn btn-block" disabled={ocupado || !online} onClick={() => void entrar()}>Recuperar liderança</button>
            </>
          )}
          <p className="muted small">Depois desta entrada, o aplicativo guarda os dados neste aparelho e sincroniza sozinho quando houver internet. Não é preciso ir em Ajustes nem tocar em sincronizar.</p>
        </div>
      </main>
    </div>
  );
}
