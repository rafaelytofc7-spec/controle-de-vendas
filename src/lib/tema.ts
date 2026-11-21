export type Tema = "claro" | "escuro";
const CHAVE = "tema-controle-vendas";

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === "escuro" ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "escuro") raiz.setAttribute("data-tema", "escuro");
  else raiz.removeAttribute("data-tema");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "escuro" ? "#0F1A14" : "#1F7A4D");
  try { localStorage.setItem(CHAVE, tema); } catch { /* ignore */ }
}

export function alternarTema(): Tema {
  const proximo: Tema = lerTema() === "escuro" ? "claro" : "escuro";
  aplicarTema(proximo);
  return proximo;
}
