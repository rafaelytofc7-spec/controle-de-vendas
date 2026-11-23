import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { StoreProvider, useStore } from "./store";
import { PrimeiraExecucao } from "./pages/PrimeiraExecucao";
import { Calculadora } from "./pages/Calculadora";
import { LivroCaixa } from "./pages/LivroCaixa";
import { Relatorios, RelatorioMes } from "./pages/Relatorios";
import { Cardapio } from "./pages/Cardapio";
import { Entregas } from "./pages/Entregas";
import { Encomendas } from "./pages/Encomendas";
import { Estoque } from "./pages/Estoque";
import { Cobrancas } from "./pages/Cobrancas";
import { Ajustes } from "./pages/Ajustes";
import { Administracao } from "./pages/Administracao";
import { Mais } from "./pages/Mais";
import { Equipe } from "./pages/Equipe";
import { EntradaNuvem } from "./pages/EntradaNuvem";
import { NOME_LOJA_PADRAO } from "./lib/marca";
import { APP_VERSION, APK_RELEASE_URL, buscarVersaoRemota, temAtualizacao } from "./lib/versao";
import { useEffect, useState } from "react";
import { alternarTema, aplicarTema, lerTema, type Tema } from "./lib/tema";
import { Icone } from "./components/Icone";
import { encomendaAtrasada } from "./lib/encomendas";

const TITULOS: Record<string, { t: string; s: string }> = {
  "/": { t: "Nova venda", s: "Calculadora" },
  "/caixa": { t: "Livro caixa", s: "Faturamento" },
  "/relatorios": { t: "Relatórios", s: "Totais por mês" },
  "/cardapio": { t: "Cardápio", s: "Preços e promoções" },
  "/entregas": { t: "Entregas", s: "Saídas" },
  "/encomendas": { t: "Encomendas", s: "Pedidos reservados" },
  "/estoque": { t: "Estoque", s: "Reabastecimento" },
  "/cobrancas": { t: "Cobranças", s: "Registros manuais" },
  "/mais": { t: "Mais", s: "Outras telas" },
  "/equipe": { t: "Equipe", s: "Quem está online" },
  "/ajustes": { t: "Ajustes", s: "Loja, backup e nuvem" },
  "/admin": { t: "Administração", s: "Equipe e registro de atividades" },
};

function Shell() {
  const { pronto, temDados, config, bloqueado, equipe, statusNuvem, avisoImportados, erroSync } = useStore();
  const loc = useLocation();
  const meta = loc.pathname.startsWith("/relatorios/")
    ? { t: "Relatório do mês", s: "Totais por dia" }
    : (TITULOS[loc.pathname] ?? { t: "Controle de Vendas", s: "" });
  const [atualizacao, setAtualizacao] = useState<string>();
  const [tema, setTema] = useState<Tema>(() => lerTema());

  useEffect(() => { aplicarTema(tema); }, [tema]);

  useEffect(() => {
    const ac = new AbortController();
    void buscarVersaoRemota(ac.signal).then((info) => {
      if (info && temAtualizacao(APP_VERSION, info.version)) {
        setAtualizacao(info.version);
      }
    });
    return () => ac.abort();
  }, []);

  const entrou = Boolean(equipe?.liderUid);
  const rotuloStatus = statusNuvem === "offline" ? "Offline" : statusNuvem === "sincronizando" ? "Sincronizando…" : "Sincronizado";

  if (!pronto) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-marca">
            <img className="logo-cesta" src={`${import.meta.env.BASE_URL}marca-cesta.png`} alt="" />
            <div className="grow"><div className="sub">{NOME_LOJA_PADRAO}</div><h1>Controle de Vendas</h1></div>
          </div>
        </header>
        <main className="page">
          <div className="splash">
            <img src={`${import.meta.env.BASE_URL}marca-cesta.png`} alt="" />
            <p className="splash-loja">{NOME_LOJA_PADRAO}</p>
            <p>Controle de Vendas</p>
          </div>
        </main>
      </div>
    );
  }
  if (!entrou) return <EntradaNuvem />;
  if (!temDados) return <PrimeiraExecucao />;

  return (
    <div className="app">
      <header className="header">
        <div className="header-marca">
          <img className="logo-cesta" src={`${import.meta.env.BASE_URL}marca-cesta.png`} alt="" />
          <div className="grow">
            <div className="sub">{config.nome_loja || NOME_LOJA_PADRAO}</div>
            <h1>{meta.t}</h1>
          </div>
        </div>
        <div className="header-acoes">
          <button
            type="button"
            className="btn-tema"
            aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
            onClick={() => setTema(alternarTema())}
          >{tema === "escuro" ? "Claro" : "Escuro"}</button>
          {erroSync && <div className="small" data-testid="erro-sync" style={{ textAlign: "right", color: "var(--tomate-2)" }}>{erroSync}</div>}
          <div className="small status-nuvem" data-testid="status-nuvem" data-status={statusNuvem}>
            {rotuloStatus}
            <div>v{APP_VERSION}</div>
          </div>
        </div>
      </header>
      {bloqueado && <div className="banner erro aviso-atualizacao">Sua conta está bloqueada nesta loja. Os dados locais continuam no aparelho, mas a nuvem não aceita alterações.</div>}
      <BannerEncomendasAtrasadas />
      {avisoImportados && <div className="banner aviso-atualizacao" data-testid="aviso-importados">{avisoImportados}</div>}
      {atualizacao && (
        <div className="banner aviso-atualizacao" data-testid="aviso-nova-versao">
          Há uma versão nova ({atualizacao}).{" "}
          <a href={APK_RELEASE_URL} target="_blank" rel="noreferrer">Baixar o APK</a>
        </div>
      )}
      <main className={"page" + (loc.pathname === "/" ? " page-venda" : loc.pathname.startsWith("/encomendas") ? " page-encomendas" : "")}>
        <Routes>
          <Route path="/" element={<Calculadora />} />
          <Route path="/caixa" element={<LivroCaixa />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/relatorios/:mes" element={<RelatorioMes />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/entregas" element={<Entregas />} />
          <Route path="/encomendas" element={<Encomendas />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/cobrancas" element={<Cobrancas />} />
          <Route path="/mais" element={<Mais />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="/admin" element={<Administracao />} />
        </Routes>
      </main>
      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>
          <span className="nav-ico"><Icone nome="venda" size={20} /></span>
          Venda
        </NavLink>
        <NavLink to="/caixa" className={({ isActive }) => isActive ? "active" : ""}>
          <span className="nav-ico"><Icone nome="caixa" size={20} /></span>
          Caixa
        </NavLink>
        <NavLink to="/cardapio" className={({ isActive }) => isActive ? "active" : ""}>
          <span className="nav-ico"><Icone nome="cardapio" size={20} /></span>
          Cardápio
        </NavLink>
        <NavLink to="/entregas" className={({ isActive }) => isActive ? "active" : ""}>
          <span className="nav-ico"><Icone nome="entrega" size={20} /></span>
          Entregas
        </NavLink>
        <NavLink to="/mais" className={({ isActive }) => isActive ? "active" : ""}>
          <span className="nav-ico"><Icone nome="mais" size={20} /></span>
          Mais
        </NavLink>
      </nav>
    </div>
  );
}
export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}



function BannerEncomendasAtrasadas() {
  const { encomendas } = useStore();
  const loc = useLocation();
  if (loc.pathname === "/" || loc.pathname.startsWith("/encomendas")) return null;
  const atrasadas = encomendas.filter((e) => encomendaAtrasada(e));
  if (atrasadas.length === 0) return null;
  return (
    <div className="banner erro aviso-atualizacao" data-testid="banner-encomendas-atrasadas">
      {atrasadas.length === 1 ? "1 encomenda atrasada. " : `${atrasadas.length} encomendas atrasadas. `}
      <NavLink to="/encomendas" className="small">Ver encomendas</NavLink>
    </div>
  );
}
