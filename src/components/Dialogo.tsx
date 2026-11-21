import { useEffect, useState } from "react";

export function useConfirmar() {
  const [pedido, setPedido] = useState<{
    titulo: string; descricao: string; confirmar: string; destrutivo?: boolean; resolve: (ok: boolean) => void;
  } | null>(null);

  function confirmar(opts: { titulo: string; descricao: string; confirmar?: string; destrutivo?: boolean }) {
    return new Promise<boolean>((resolve) => {
      setPedido({ titulo: opts.titulo, descricao: opts.descricao, confirmar: opts.confirmar ?? "Confirmar", destrutivo: opts.destrutivo, resolve });
    });
  }

  function fechar(ok: boolean) {
    pedido?.resolve(ok);
    setPedido(null);
  }

  const dialogo = pedido ? (
    <div className="dialog-bg" onClick={() => fechar(false)} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={pedido.titulo} onClick={(e) => e.stopPropagation()}>
        <h3>{pedido.titulo}</h3>
        <p className="muted">{pedido.descricao}</p>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn grow" onClick={() => fechar(false)}>Cancelar</button>
          <button className={`btn grow ${pedido.destrutivo ? "btn-danger solid" : "btn-primary"}`} onClick={() => fechar(true)}>{pedido.confirmar}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmar, dialogo };
}

export function useEsc(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}
