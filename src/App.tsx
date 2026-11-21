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
import { Mais } from "./pages/Mais";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

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
};

function Shell() {
  const { pronto, temDados, config, online, syncando, usuario } = useStore();
  const loc = useLocation();
  const meta = TITULOS[loc.pathname] ?? { t: "Controle de Vendas", s: "" };

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
        <div className="small" style={{ textAlign: "right", opacity: 0.9 }}>
          {!online ? "Offline" : syncando ? "Sincronizando…" : usuario ? "Nuvem ligada" : "Local"}
        </div>
      </header>
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
        </Routes>
      </main>
      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>
          <Icon d="M3 3v18h18M7 14l4-4 4 4 6-6" />
          Venda
        </NavLink>
        <NavLink to="/caixa" className={({ isActive }) => isActive ? "active" : ""}>
          <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          Caixa
        </NavLink>
        <NavLink to="/cardapio" className={({ isActive }) => isActive ? "active" : ""}>
          <Icon d="M4 7h16M4 12h16M4 17h10" />
          Cardápio
        </NavLink>
        <NavLink to="/entregas" className={({ isActive }) => isActive ? "active" : ""}>
          <Icon d="M3 7h13l5 5v7H3zM16 7v5h5" />
          Entregas
        </NavLink>
        <NavLink to="/mais" className={({ isActive }) => isActive ? "active" : ""}>
          <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 3.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 5.9 3.2l.1.1a1.7 1.7 0 0 0 1.8.3H8a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 20.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.2H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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

