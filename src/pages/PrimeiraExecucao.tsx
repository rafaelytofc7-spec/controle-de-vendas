import { useState } from "react";
import { useStore } from "../store";

export function PrimeiraExecucao() {
  const { importarArquivo } = useStore();
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | null) {
    if (!f) return;
    setBusy(true); setErro(""); setOk("");
    try {
      const raw = JSON.parse(await f.text());
      const dados = await importarArquivo(raw);
      const total = dados.vendas.reduce((a, v) => a + v.valor, 0);
      setOk(`Importado: ${dados.vendas.length.toLocaleString("pt-BR")} vendas, ${dados.produtos.length.toLocaleString("pt-BR")} produtos, ${dados.encomendas.length.toLocaleString("pt-BR")} encomendas, ${dados.cobrancas.length.toLocaleString("pt-BR")} cobranças. Total ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally { setBusy(false); }
  }

  async function comecarZero() {
    setBusy(true); setErro("");
    try {
      await importarArquivo({
        formato: "controle-de-vendas-backup",
        versao: 1,
        loja: "loja",
        configuracao: { nome_loja: "Minha loja" },
        vendas: [], produtos: [], entregas: [], encomendas: [], cobrancas: [], reabastecimentos: [],
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao iniciar.");
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="header"><div><div className="sub">Primeiro uso</div><h1>Controle de Vendas</h1></div></header>
      <main className="page">
        <div className="card">
          <h2>Começar com os seus dados</h2>
          <p className="muted">O aplicativo funciona neste aparelho, mesmo sem internet. Importe o arquivo de backup para trazer as vendas já registradas, ou comece do zero.</p>
          <label className="field" style={{ margin: "16px 0" }}>
            Arquivo de backup (.json)
            <input data-testid="import-file" className="input" type="file" accept="application/json,.json" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          </label>
          {ok && <div className="banner ok" data-testid="import-ok">{ok}</div>}
          {erro && <div className="banner erro">{erro}</div>}
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => void comecarZero()}>Começar do zero</button>
        </div>
      </main>
    </div>
  );
}
