import { Link } from "react-router-dom";
import { useStore } from "../store";
import { Icone } from "../components/Icone";

const LINKS = [
  { to: "/equipe", t: "Equipe", d: "Quem está online e quem registrou as vendas", icone: "admin" },
  { to: "/encomendas", t: "Encomendas", d: "Pedidos reservados, entregas e lembretes", icone: "encomenda" },
  { to: "/estoque", t: "Estoque", d: "Reabastecimento e preço sugerido", icone: "estoque" },
  { to: "/cobrancas", t: "Cobranças", d: "Registros manuais de teste", icone: "cobranca" },
  { to: "/ajustes", t: "Ajustes", d: "Loja, backup, nuvem e avisos", icone: "ajustes" },
];

export function Mais() {
  const { ehDono } = useStore();
  const itens = [
    ...LINKS,
    ...(ehDono ? [{ to: "/admin", t: "Administração", d: "Equipe, atividades e loja", icone: "admin" }] : []),
    { to: "/relatorios", t: "Relatórios", d: "Totais de cada mês, gráficos e comparação", icone: "grafico" },
  ];
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
