import { Link } from "react-router-dom";
import { useStore } from "../store";

const LINKS = [
  { to: "/encomendas", t: "Encomendas", d: "Pedidos reservados" },
  { to: "/estoque", t: "Estoque", d: "Reabastecimento e preço sugerido" },
  { to: "/cobrancas", t: "Cobranças", d: "Registros manuais de teste" },
  { to: "/ajustes", t: "Ajustes", d: "Loja, backup, Firebase e guia" },
];

export function Mais() {
  const { ehDono } = useStore();
  const itens = ehDono
    ? [...LINKS, { to: "/admin", t: "Administração", d: "Equipe, atividades, faturamento e loja" }]
    : LINKS;
  return (
    <div className="stack">
      {itens.map((l) => (
        <Link key={l.to} to={l.to} className="card link-card">
          <h3>{l.t}</h3>
          <p className="muted">{l.d}</p>
        </Link>
      ))}
    </div>
  );
}
