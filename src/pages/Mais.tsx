import { Link } from "react-router-dom";

const ITENS = [
  { to: "/encomendas", t: "Encomendas", d: "Pedidos reservados para o cliente" },
  { to: "/estoque", t: "Reabastecimento", d: "Custo e preço sugerido" },
  { to: "/cobrancas", t: "Cobranças", d: "Registros manuais de teste" },
  { to: "/ajustes", t: "Ajustes", d: "Loja, backup, Firebase e guia" },
];

export function Mais() {
  return (
    <div className="col">
      {ITENS.map((i) => (
        <Link key={i.to} to={i.to} className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>{i.t}</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>{i.d}</p>
        </Link>
      ))}
    </div>
  );
}
