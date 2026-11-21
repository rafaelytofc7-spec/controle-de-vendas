import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { StoreProvider, useStore } from "./store";
import { PrimeiraExecucao } from "./pages/PrimeiraExecucao";
import { Calculadora } from "./pages/Calculadora";
import { LivroCaixa } from "./pages/LivroCaixa";
import { Cardapio } from "./pages/Cardapio";
import { Entregas } from "./pages/Entregas";
import { Encomendas } from "./pages/Encomendas";
import { Estoque } from "./pages/Estoque";
import { Cobrancas } from "./pages/Cobrancas";
import { Ajustes } from "./pages/Ajustes";
import { Administracao } from "./pages/Administracao";
import { Mais } from "./pages/Mais";
import { APP_VERSION, buscarVersaoRemota, temAtualizacao } from "./lib/versao";
import { useEffect, useState } from "react";
import { alternarTema, aplicarTema, lerTema, type Tema } from "./lib/tema";
import { Icone } from "./components/Icone";

const TITULOS: Record<string, { t: string; s: string }> = {
  "/": { t: "Nova venda", s: "Calculadora" },
  "/caixa": { t: "Livro caixa", s: "Faturamento" },
  "/cardapio": { t: "Cardápio", s: "Preços e promoções" },
  "/entregas": { t: "Entregas", s: "Saídas" },
  "/encomendas": { t: "Encomendas", s: "Pedidos reservados" },
  "/estoque": { t: "Estoque", s: "Reabastecimento" },
  "/cobrancas": { t: "Cobranças", s: "Registros manuais" },
  "/mais": { t: "Mais", s: "Outras telas" },
  "/ajustes": { t: "Ajustes", s: "Loja, backup e nuvem" },
  "/admin": { t: "Administração", s: "Equipe e registro de atividades" },
};

function Shell() {
  const { pronto, temDados, config, online, syncando, usuario, ehDono, bloqueado } = useStore();
  const loc = useLocation();
  const meta = TITULOS[loc.pathname] ?? { t: "Controle de Vendas", s: "" };
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

  if (!pronto) {
    return (
      <div className="app">
        <header className="header"><h1>Controle de Vendas</h1></header>
        <main className="page"><p className="muted">Carregando…</p></main>
      </div>
    );
  }
  if (!temDados) return <PrimeiraExecucao />;

  return (
    <div className="app">
      <header className="header">
        <div className="grow">
          <div className="sub">{config.nome_loja || meta.s}</div>
          <h1>{meta.t}</h1>
        </div>
        <button
          type="button"
          className="btn-tema"
          aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
          onClick={() => setTema(alternarTema())}
        >{tema === "escuro" ? "Claro" : "Escuro"}</button>
        <div className="small status-nuvem" style={{ textAlign: "right", opacity: 0.9 }}>
          {!online ? "Offline" : syncando ? "Sincronizando…" : usuario ? "Nuvem ligada" : "Local"}
          <div>v{APP_VERSION}</div>
        </div>
      </header>
      {bloqueado && <div className="banner erro aviso-atualizacao">Sua conta está bloqueada nesta loja. Os dados locais continuam no aparelho, mas a nuvem não aceita alterações.</div>}
      {atualizacao && (
        <div className="banner aviso-atualizacao">
          Há uma versão nova ({atualizacao}). Atualize o site ou baixe o APK em Mais → Ajustes.
        </div>
      )}
      <main className="page">
        <Routes>
          <Route path="/" element={<Calculadora />} />
          <Route path="/caixa" element={<LivroCaixa />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/entregas" element={<Entregas />} />
          <Route path="/encomendas" element={<Encomendas />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/cobrancas" element={<Cobrancas />} />
          <Route path="/mais" element={<Mais />} />
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

