import { useStore } from "../store";
import { formatarDataHora } from "../lib/datas";
import { membroOnline, rotuloPapel } from "../lib/presenca";
import { EstadoVazio } from "../components/EstadoVazio";

export function Equipe() {
  const { membros, usuario, equipe, online } = useStore();
  const agora = Date.now();
  const lista = [...membros].sort((a, b) => {
    const ao = membroOnline(a, agora) || a.uid === usuario?.uid ? 0 : 1;
    const bo = membroOnline(b, agora) || b.uid === usuario?.uid ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return (
    <div>
      <div className="card">
        <h3>Quem está na loja</h3>
        <p className="muted small">
          {online ? "Quem usou o aplicativo nos últimos 2 minutos aparece como online." : "Sem internet, a lista é a última vista neste aparelho. Você aparece como online aqui."}
        </p>
        {lista.length === 0 ? (
          <EstadoVazio icone="admin" titulo="Ninguém na equipe ainda" texto="Entre com o seu nome na tela inicial. O primeiro aparelho vira Admin e os outros aparecem aqui." />
        ) : (
          <ul className="lista" data-testid="lista-equipe">
            {lista.map((m) => {
              const eu = m.uid === usuario?.uid;
              const on = eu || membroOnline(m, agora);
              const admin = m.uid === equipe?.liderUid || m.papel === "lider";
              return (
                <li key={m.uid} className="lista-item equipe-item">
                  <div className="grow">
                    <strong>{m.nome || m.uid.slice(0, 8)}{eu ? " (você)" : ""}</strong>
                    <div className="muted small">
                      {rotuloPapel(m.papel, admin)}
                      {m.bloqueado ? " · bloqueado" : ""}
                    </div>
                    <div className="muted small">
                      {on ? "Online agora" : (m.ultimoAcesso ? `Visto ${formatarDataHora(m.ultimoAcesso)}` : "Ainda não visto")}
                    </div>
                  </div>
                  <div className="estado">
                    <span className={on ? "ponto on" : "ponto"} />
                    {on ? "Online" : "Offline"}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
