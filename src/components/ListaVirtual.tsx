import { useState, type ReactNode } from "react";

export function ListaVirtual<T>({
  itens,
  chave,
  render,
  vazio,
  altura = 320,
  alturaLinha = 76,
  testid,
  className = "lista",
}: {
  itens: T[];
  chave: (item: T, i: number) => string;
  render: (item: T, i: number) => ReactNode;
  vazio?: ReactNode;
  altura?: number;
  alturaLinha?: number;
  testid?: string;
  className?: string;
}) {
  const [scroll, setScroll] = useState(0);
  if (itens.length === 0) return <>{vazio ?? null}</>;
  if (itens.length <= 16) {
    return (
      <div className={className} data-testid={testid}>
        {itens.map((it, i) => (
          <div key={chave(it, i)}>{render(it, i)}</div>
        ))}
      </div>
    );
  }
  const inicio = Math.max(0, Math.floor(scroll / alturaLinha) - 3);
  const qtd = Math.ceil(altura / alturaLinha) + 6;
  const fatia = itens.slice(inicio, inicio + qtd);
  return (
    <div
      className="lista-virtual"
      data-testid={testid}
      style={{ height: altura, overflowY: "auto" }}
      onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
    >
      <div style={{ height: itens.length * alturaLinha, position: "relative" }}>
        {fatia.map((it, j) => {
          const i = inicio + j;
          return (
            <div
              key={chave(it, i)}
              style={{ position: "absolute", top: i * alturaLinha, left: 0, right: 0, height: alturaLinha, padding: "0 0 8px" }}
            >
              {render(it, i)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
