import { Link } from "react-router-dom";
import { useStore } from "../store";
import { Icone } from "../components/Icone";

const LINKS = [
  { to: "/encomendas", t: "Encomendas", d: "Pedidos reservados", icone: "encomenda" },
  { to: "/estoque", t: "Estoque", d: "Reabastecimento e preço sugerido", icone: "estoque" },
  { to: "/cobrancas", t: "Cobranças", d: "Registros manuais de teste", icone: "cobranca" },
  { to: "/ajustes", t: "Ajustes", d: "Loja, backup, Firebase e guia", icone: "ajustes" },
];

export function Mais() {
  const { ehDono } = useStore();
  const itens = ehDono
    ? [...LINKS, { to: "/admin", t: "Administração", d: "Equipe, atividades, faturamento e loja", icone: "admin" }]
    : LINKS;
  return (
    <div className="stack">
      {itens.map((l) => (
        <Link key={l.to} to={l.to} className="card link-card link-mais">
          <span className="mais-ico"><Icone nome={l.icone} size={22} /></span>
          <div className="grow">
            <h3>{l.t}</h3>
            <p className="muted">{l.d}</p>
          </div>
          <span className="mais-seta" aria-hidden="true">›</span>
        </Link>
      ))}
    </div>
  );
}
