import { useMemo, useState } from "react";
import { useLoja, enfileirar } from "../lib/loja";
import { Modal, toast } from "../comum";
import { brl, novoId, diaSP } from "../lib/util";
import type { Fornecedor } from "../lib/tipos";

export function FornecedorForm({ fornecedor, aoSalvar }: { fornecedor?: Fornecedor; aoSalvar: (id: string) => void }) {
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [tipo, setTipo] = useState(fornecedor?.tipo ?? "");
  const [tel, setTel] = useState(fornecedor?.telefone ?? "");
  const [obs, setObs] = useState(fornecedor?.observacoes ?? "");
  const [erro, setErro] = useState("");
  return (
    <div data-testid="fornecedor-form">
      <label className="field">Nome<input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus data-testid="ff-nome" /></label>
      <div className="field">Tipo<div style={{ marginTop: 4 }}>{["Ceasa", "Produtor", "Distribuidor", "Mercado", "Outro"].map((t) => <button key={t} className={`chip ${tipo === t ? "on" : ""}`} onClick={() => setTipo(t)}>{t}</button>)}</div></div>
      <label className="field">Telefone<input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
      <label className="field">Observações<input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="dia de entrega, forma de pagamento…" /></label>
      {erro && <div className="erro">{erro}</div>}
      <button className="btn b-folha w100" data-testid="ff-salvar" onClick={() => {
        if (nome.trim().length < 2) { setErro("Digite o nome."); return; }
        const id = fornecedor?.id ?? novoId();
        enfileirar("fornecedor", { id, nome: nome.trim(), tipo: tipo || null, telefone: tel.trim() || null, observacoes: obs.trim() || null, ativo: true, excluido: false });
        toast("Fornecedor salvo"); aoSalvar(id);
      }}>Salvar</button>
      {fornecedor && <button className="btn b-perigo w100" style={{ marginTop: 8 }} onClick={() => {
        if (confirm(`Excluir ${fornecedor.nome}?`)) { enfileirar("fornecedor", { ...fornecedor, excluido: true }); aoSalvar(fornecedor.id); }
      }}>Excluir</button>}
    </div>
  );
}

export default function Fornecedores() {
  const fornecedores = useLoja((e) => e.fornecedores);
  const entradas = useLoja((e) => e.entradas);
  const papel = useLoja((e) => e.papel);
  const [editar, setEditar] = useState<Fornecedor | null>(null);
  const [novo, setNovo] = useState(false);
  const stats = useMemo(() => {
    const m: Record<string, { n: number; total: number; ultima: string }> = {};
    const lim = diaSP(new Date(Date.now() - 30 * 86400_000));
    for (const e of Object.values(entradas)) {
      if (e.excluido || !e.fornecedor_id || diaSP(e.data) < lim) continue;
      const s = (m[e.fornecedor_id] ??= { n: 0, total: 0, ultima: "" });
      s.n++; s.total += e.total; if (e.data > s.ultima) s.ultima = e.data;
    }
    return m;
  }, [entradas]);
  const lista = Object.values(fornecedores).filter((f) => !f.excluido).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (papel !== "admin") return <div className="vazio">Só o Admin gerencia fornecedores.</div>;
  return (
    <>
      <div className="card" style={{ padding: "4px 12px" }}>
        <table>
          <thead><tr><th>Fornecedor</th><th>Tipo</th><th>Telefone</th><th className="n">Compras 30d</th><th className="n">Total 30d</th></tr></thead>
          <tbody>{lista.map((f) => (
            <tr key={f.id} onClick={() => setEditar(f)} style={{ cursor: "pointer" }} data-testid="fornecedor">
              <td><b>{f.nome}</b></td><td>{f.tipo ?? ""}</td><td>{f.telefone ?? ""}</td><td className="n">{stats[f.id]?.n ?? 0}</td><td className="n">{brl(stats[f.id]?.total ?? 0)}</td>
            </tr>))}</tbody>
        </table>
        {!lista.length && <div className="vazio">Nenhum fornecedor ainda. Toque em “＋ Fornecedor”.</div>}
      </div>
      <div className="peq-t mut">Gráfico de preços por fornecedor e comparação diária chegam na próxima etapa; os dados já estão sendo guardados a cada entrada.</div>
      <button className="fab" onClick={() => setNovo(true)} data-testid="novo-fornecedor">＋ Fornecedor</button>
      {novo && <Modal titulo="Novo fornecedor" aoFechar={() => setNovo(false)}><FornecedorForm aoSalvar={() => setNovo(false)} /></Modal>}
      {editar && <Modal titulo={editar.nome} aoFechar={() => setEditar(null)}><FornecedorForm fornecedor={editar} aoSalvar={() => setEditar(null)} /></Modal>}
    </>
  );
}
