import { useState } from "react";
import { useStore } from "../store";
import { NOME_LOJA_PADRAO } from "../lib/marca";

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
        configuracao: { nome_loja: NOME_LOJA_PADRAO },
        vendas: [], produtos: [], entregas: [], encomendas: [], cobrancas: [], reabastecimentos: [],
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao iniciar.");
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-marca">
          <img className="logo-cesta" src={`${import.meta.env.BASE_URL}marca-cesta.png`} alt="" />
          <div className="grow"><div className="sub">{NOME_LOJA_PADRAO}</div><h1>Controle de Vendas</h1></div>
        </div>
      </header>
      <main className="page">
        <div className="card">
          <h2>Começar com os seus dados</h2>
          <p className="muted">O aplicativo funciona neste aparelho, mesmo sem internet. Importe o arquivo de atualização mais recente (caixa-importacao-2026-11-22-2049.json) para trazer as vendas. Se você já importou um arquivo anterior, este mescla pelo id e não duplica. Ou comece do zero.</p>
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
