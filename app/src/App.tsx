import { useEffect, useState } from "react";
import { useLoja, iniciar } from "./lib/loja";
import { AlertaSync, PerguntaOperador, StatusSync, Toaster, useLargo } from "./comum";
import { EH_TESTE, LOJA, NOME_LOJA, VERSAO_NOME } from "./lib/config";
import { brl } from "./lib/util";
import Caixa, { useResumoDia } from "./telas/Caixa";
import Produtos from "./telas/Produtos";
import Chegou from "./telas/Chegou";
import Fornecedores from "./telas/Fornecedores";
import Contagem from "./telas/Contagem";
import Aparelho from "./telas/Aparelho";
import { AparelhoBloqueado, LigarAparelho, NovaVersao } from "./telas/Portas";

type Tela = "caixa" | "produtos" | "chegou" | "fornecedores" | "contagem" | "ajustes" | "mais";
const TITULOS: Record<Tela, string> = { caixa: "Caixa", produtos: "Produtos", chegou: "Chegou mercadoria", fornecedores: "Fornecedores", contagem: "Contagem de estoque", ajustes: "Aparelho e ajustes", mais: "Mais" };
const ICONES: Record<Tela, string> = { caixa: "🧾", produtos: "🥬", chegou: "📦", fornecedores: "🚚", contagem: "🔢", ajustes: "⚙️", mais: "⋯" };

function lerTela(): Tela { const h = location.hash.replace("#", "") as Tela; return h in TITULOS ? h : "caixa"; }

export default function App() {
  const fase = useLoja((e) => e.fase);
  const papel = useLoja((e) => e.papel);
  const largo = useLargo();
  const [tela, setTelaS] = useState<Tela>(lerTela);
  const operador = useLoja((e) => e.operador);
  const [perguntar, setPerguntar] = useState(false);
  const [jaPerguntou, setJaPerguntou] = useState(false);
  useEffect(() => { const f = () => setPerguntar(true); window.addEventListener("cv3-trocar-operador", f); return () => window.removeEventListener("cv3-trocar-operador", f); }, []);
  useEffect(() => { void iniciar(); }, []);
  useEffect(() => { const f = () => setTelaS(lerTela()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const setTela = (t: Tela) => { location.hash = t; setTelaS(t); };

  if (fase === "bloqueado_versao") return <NovaVersao />;
  if (fase === "precisa_codigo") return <LigarAparelho />;
  if (fase === "aparelho_bloqueado") return <AparelhoBloqueado />;
  if (fase === "iniciando") return <div className="tela-cheia"><div style={{ fontSize: 48 }}>🥬</div><p>Abrindo…</p></div>;

  const admin = papel === "admin";
  const modalOperador = (perguntar || (!operador && !jaPerguntou)) ? <PerguntaOperador aoFechar={() => { setPerguntar(false); setJaPerguntou(true); }} /> : null;
  const telaOk: Tela = (tela === "fornecedores" || tela === "contagem") && !admin ? "caixa" : tela === "mais" && largo ? "ajustes" : tela;
  const conteudo = (
    <>
      {telaOk === "caixa" && <Caixa />}
      {telaOk === "produtos" && <Produtos />}
      {telaOk === "chegou" && <Chegou />}
      {telaOk === "fornecedores" && <Fornecedores />}
      {telaOk === "contagem" && <Contagem />}
      {telaOk === "ajustes" && <Aparelho />}
      {telaOk === "mais" && <Mais setTela={setTela} admin={admin} />}
    </>
  );
  const faixa = EH_TESTE ? <div className="teste-faixa" data-testid="faixa-teste">VERSÃO DE TESTE · loja “{LOJA}” · as vendas daqui não contam</div> : null;

  if (largo) {
    const menu: Tela[] = admin ? ["caixa", "produtos", "chegou", "fornecedores", "contagem", "ajustes"] : ["caixa", "produtos", "chegou", "ajustes"];
    return (
      <div className="app">
        {faixa}
        <div className="pc" style={{ flex: 1, minHeight: 0 }}>
          <nav className="side">
            <div className="marca">{NOME_LOJA}<small>Controle de Vendas · {admin ? "Admin" : "Caixa"}</small></div>
            {menu.map((t) => <button key={t} className={telaOk === t ? "on" : ""} onClick={() => setTela(t)} data-testid={`menu-${t}`}>{ICONES[t]} {TITULOS[t]}</button>)}
            <RodapePC />
          </nav>
          <main className="main">
            <div className="cab-pc"><h1>{TITULOS[telaOk]}</h1><StatusSync /></div>
            <AlertaSync />
            <div className="corpo" style={{ maxWidth: telaOk === "caixa" ? 560 : telaOk === "chegou" ? 720 : 1100 }}>{conteudo}</div>
          </main>
        </div>
        {modalOperador}
        <Toaster />
      </div>
    );
  }

  const nav: Tela[] = ["caixa", "produtos", "chegou", "mais"];
  return (
    <div className="app">
      {faixa}
      <header className="topo">
        <div className="l1"><h1>{TITULOS[telaOk]}</h1><StatusSync /></div>
        <SubTitulo />
      </header>
      <AlertaSync />
      <div className="corpo">{conteudo}</div>
      <nav className="nav">
        {nav.map((t) => (
          <button key={t} className={telaOk === t || (t === "mais" && ["ajustes", "fornecedores", "contagem"].includes(telaOk)) ? "on" : ""} onClick={() => setTela(t)} data-testid={`nav-${t}`}>
            <i>{ICONES[t]}</i>{t === "chegou" ? "Chegou" : TITULOS[t]}
          </button>
        ))}
      </nav>
      {modalOperador}
      <Toaster />
    </div>
  );
}

function SubTitulo() {
  const operador = useLoja((e) => e.operador);
  const r = useResumoDia();
  return <div className="sub">{NOME_LOJA} · <button className="op-btn" onClick={trocarOperador} data-testid="operador">👤 {operador || "sem nome"}</button> · hoje {r.n} vendas · {brl(r.total)}</div>;
}

function RodapePC() {
  const meuNome = useLoja((e) => e.meuNome);
  const operador = useLoja((e) => e.operador);
  const aparelhos = useLoja((e) => e.aparelhos);
  const r = useResumoDia();
  const ativos = Object.values(aparelhos).filter((a) => a.ultimo_acesso && Date.now() - new Date(a.ultimo_acesso).getTime() < 86400_000).length;
  return (
    <div className="rod">
      💻 {meuNome}<br /><button className="op-btn" onClick={trocarOperador} data-testid="operador">👤 {operador || "sem nome"} (trocar)</button><br />Hoje: {r.n} vendas · {brl(r.total)}<br />lucro {r.estimado ? "≈ " : ""}{brl(r.lucro)}<br />{ativos} aparelho(s) usados nas últimas 24 h<br /><span style={{ opacity: 0.6 }}>v{VERSAO_NOME}</span>
    </div>
  );
}

function Mais({ setTela, admin }: { setTela: (t: Tela) => void; admin: boolean }) {
  const itens: Tela[] = admin ? ["fornecedores", "contagem", "ajustes"] : ["ajustes"];
  return (
    <>
      <div className="card" style={{ padding: "0 12px" }}>
        {itens.map((t) => (
          <button key={t} className="prod" onClick={() => setTela(t)} data-testid={`mais-${t}`}>
            <div className="ic">{ICONES[t]}</div><div className="n"><b>{TITULOS[t]}</b></div><div className="p">›</div>
          </button>
        ))}
      </div>
      <div className="card"><h3>Chegando nas próximas versões</h3>
        <p className="peq-t mut" style={{ margin: 0 }}>Encomendas · Sugestões de promoção · Relatório diário automático · Gráfico de preços por fornecedor · Painel do PC</p></div>
    </>
  );
}

function trocarOperador() { window.dispatchEvent(new Event("cv3-trocar-operador")); }
