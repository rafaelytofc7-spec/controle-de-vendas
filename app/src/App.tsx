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
import Encomendas from "./telas/Encomendas";
import Promocoes from "./telas/Promocoes";
import PrecosFornecedor from "./telas/PrecosFornecedor";
import Relatorios from "./telas/Relatorios";
import Painel from "./telas/Painel";
import { AparelhoBloqueado, LigarAparelho, NovaVersao } from "./telas/Portas";

type Tela = "painel" | "caixa" | "produtos" | "chegou" | "encomendas" | "promocoes" | "precos" | "relatorios" | "fornecedores" | "contagem" | "ajustes" | "mais";
const TITULOS: Record<Tela, string> = { painel: "Painel", caixa: "Caixa", produtos: "Produtos", chegou: "Chegou mercadoria", encomendas: "Encomendas", promocoes: "Promoções",
  precos: "Preços por fornecedor", relatorios: "Relatórios diários", fornecedores: "Fornecedores", contagem: "Contagem de estoque", ajustes: "Aparelho e ajustes", mais: "Mais" };
const ICONES: Record<Tela, string> = { painel: "📊", caixa: "🧾", produtos: "🥬", chegou: "📦", encomendas: "📝", promocoes: "🏷️", precos: "📈", relatorios: "🗓️", fornecedores: "🚚", contagem: "🔢", ajustes: "⚙️", mais: "⋯" };
const SO_ADMIN: Tela[] = ["fornecedores", "contagem", "promocoes", "precos"];

function lerTela(): Tela | null { const h = location.hash.replace("#", "") as Tela; return h in TITULOS ? h : null; }

export default function App() {
  const fase = useLoja((e) => e.fase);
  const papel = useLoja((e) => e.papel);
  const largo = useLargo();
  const [telaHash, setTelaS] = useState<Tela | null>(lerTela);
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
  const tela: Tela = telaHash ?? (largo && admin ? "painel" : "caixa");
  const telaOk: Tela = SO_ADMIN.includes(tela) && !admin ? "caixa" : tela === "mais" && largo ? "ajustes" : tela;
  const conteudo = (
    <>
      {telaOk === "painel" && <Painel ir={(t) => setTela(t as Tela)} />}
      {telaOk === "caixa" && <Caixa />}
      {telaOk === "encomendas" && <Encomendas />}
      {telaOk === "promocoes" && <Promocoes />}
      {telaOk === "precos" && <PrecosFornecedor />}
      {telaOk === "relatorios" && <Relatorios />}
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
    const menu: Tela[] = admin ? ["painel", "caixa", "produtos", "chegou", "encomendas", "promocoes", "precos", "relatorios", "fornecedores", "contagem", "ajustes"]
      : ["painel", "caixa", "produtos", "chegou", "encomendas", "relatorios", "ajustes"];
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
            <div className="corpo" style={{ maxWidth: telaOk === "caixa" ? 560 : telaOk === "chegou" || telaOk === "encomendas" ? 760 : 1200 }}>{conteudo}</div>
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
          <button key={t} className={telaOk === t || (t === "mais" && !["caixa", "produtos", "chegou"].includes(telaOk)) ? "on" : ""} onClick={() => setTela(t)} data-testid={`nav-${t}`}>
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
  const itens: Tela[] = admin ? ["painel", "encomendas", "promocoes", "precos", "relatorios", "fornecedores", "contagem", "ajustes"] : ["painel", "encomendas", "relatorios", "ajustes"];
  return (
    <>
      <div className="card" style={{ padding: "0 12px" }}>
        {itens.map((t) => (
          <button key={t} className="prod" onClick={() => setTela(t)} data-testid={`mais-${t}`}>
            <div className="ic">{ICONES[t]}</div><div className="n"><b>{TITULOS[t]}</b></div><div className="p">›</div>
          </button>
        ))}
      </div>
    </>
  );
}

function trocarOperador() { window.dispatchEvent(new Event("cv3-trocar-operador")); }
