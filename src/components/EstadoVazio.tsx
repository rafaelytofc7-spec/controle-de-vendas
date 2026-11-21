import type { ReactNode } from "react";
import { Icone } from "./Icone";

export function EstadoVazio({
  icone, titulo, texto, acao,
}: { icone: string; titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <div className="vazio-ico"><Icone nome={icone} size={32} /></div>
      <h3>{titulo}</h3>
      <p className="muted">{texto}</p>
      {acao}
    </div>
  );
}
