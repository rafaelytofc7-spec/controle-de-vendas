import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const LOJA = "loja-teste";
const REGRAS = readFileSync(resolve(import.meta.dirname, "../../rules/firestore.rules"), "utf8");

let env: RulesTestEnvironment;

function ctx(uid: string, email: string) {
  return env.authenticatedContext(uid, { email }).firestore();
}

describe("regras do Firestore (dono e membros, sem cargos)", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-controle-vendas",
      firestore: { rules: REGRAS, host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctxn) => {
      const db = ctxn.firestore();
      await setDoc(doc(db, "lojas", LOJA), {
        ownerUid: "dono",
        ownerEmail: "dono@loja.com",
        membrosEmails: ["dono@loja.com", "membro@loja.com"],
        criado_em: "2026-01-01T00:00:00.000Z",
      });
      await setDoc(doc(db, "lojas", LOJA, "membros", "dono"), {
        uid: "dono",
        email: "dono@loja.com",
        bloqueado: false,
        ultimoAcesso: "2026-01-01T00:00:00.000Z",
        criado_em: "2026-01-01T00:00:00.000Z",
      });
      await setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
        uid: "membro",
        email: "membro@loja.com",
        bloqueado: false,
        ultimoAcesso: "2026-01-01T00:00:00.000Z",
        criado_em: "2026-01-01T00:00:00.000Z",
      });
      await setDoc(doc(db, "lojas", LOJA, "configuracao", "atual"), {
        loja: LOJA,
        nome_loja: "Minha loja",
        atualizado_em: "2026-01-01T00:00:00.000Z",
      });
    });
  });

  it("membro lê e grava venda com o próprio uid", async () => {
    const db = ctx("membro", "membro@loja.com");
    await assertSucceeds(getDoc(doc(db, "lojas", LOJA, "vendas", "v1")));
    await assertSucceeds(setDoc(doc(db, "lojas", LOJA, "vendas", "v1"), {
      id: "v1", loja: LOJA, valor: 10, criado_em: "2026-01-02T00:00:00.000Z", atualizado_em: "2026-01-02T00:00:00.000Z",
      criadoPor: "membro", atualizadoPor: "membro",
    }));
  });

  it("membro não cria venda atribuída a outra pessoa, salvo importado pelo dono", async () => {
    const membro = ctx("membro", "membro@loja.com");
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "vendas", "v2"), {
      id: "v2", loja: LOJA, valor: 10, criado_em: "2026-01-02T00:00:00.000Z", atualizado_em: "2026-01-02T00:00:00.000Z",
      criadoPor: "outra", atualizadoPor: "membro",
    }));
    const dono = ctx("dono", "dono@loja.com");
    await assertSucceeds(setDoc(doc(dono, "lojas", LOJA, "vendas", "v3"), {
      id: "v3", loja: LOJA, valor: 10, criado_em: "2026-01-02T00:00:00.000Z", atualizado_em: "2026-01-02T00:00:00.000Z",
      criadoPor: "importado", atualizadoPor: "importado",
    }));
  });

  it("só o dono altera configurações e gerencia membros", async () => {
    const membro = ctx("membro", "membro@loja.com");
    await assertSucceeds(getDoc(doc(membro, "lojas", LOJA, "configuracao", "atual")));
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "configuracao", "atual"), { nome_loja: "Hack" }, { merge: true }));
    await assertFails(setDoc(doc(membro, "lojas", LOJA), { membrosEmails: ["x@y.com"] }, { merge: true }));
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "membros", "membro"), { bloqueado: true }, { merge: true }));

    const dono = ctx("dono", "dono@loja.com");
    await assertSucceeds(setDoc(doc(dono, "lojas", LOJA, "configuracao", "atual"), { nome_loja: "Nova" }, { merge: true }));
    await assertSucceeds(setDoc(doc(dono, "lojas", LOJA), { membrosEmails: ["dono@loja.com", "membro@loja.com", "novo@loja.com"] }, { merge: true }));
    await assertSucceeds(setDoc(doc(dono, "lojas", LOJA, "membros", "membro"), { bloqueado: true }, { merge: true }));
  });

  it("membro atualiza só o próprio último acesso", async () => {
    const membro = ctx("membro", "membro@loja.com");
    await assertSucceeds(setDoc(doc(membro, "lojas", LOJA, "membros", "membro"), { ultimoAcesso: "2026-02-01T00:00:00.000Z" }, { merge: true }));
  });

  it("membro bloqueado não grava dados da loja", async () => {
    await env.withSecurityRulesDisabled(async (ctxn) => {
      await setDoc(doc(ctxn.firestore(), "lojas", LOJA, "membros", "membro"), { bloqueado: true }, { merge: true });
    });
    const membro = ctx("membro", "membro@loja.com");
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "vendas", "v4"), {
      id: "v4", loja: LOJA, valor: 1, criado_em: "2026-01-02T00:00:00.000Z", atualizado_em: "2026-01-02T00:00:00.000Z",
      criadoPor: "membro", atualizadoPor: "membro",
    }));
  });

  it("estranho não lê a loja; convidado ainda sem doc de membro pode entrar", async () => {
    const estranho = ctx("estranho", "estranho@x.com");
    await assertFails(getDoc(doc(estranho, "lojas", LOJA)));

    const dono = ctx("dono", "dono@loja.com");
    await assertSucceeds(setDoc(doc(dono, "lojas", LOJA), {
      membrosEmails: ["dono@loja.com", "membro@loja.com", "novo@loja.com"],
    }, { merge: true }));

    const novo = ctx("novo", "novo@loja.com");
    await assertSucceeds(setDoc(doc(novo, "lojas", LOJA, "membros", "novo"), {
      uid: "novo", email: "novo@loja.com", bloqueado: false, ultimoAcesso: "2026-02-01T00:00:00.000Z", criado_em: "2026-02-01T00:00:00.000Z",
    }));
  });

  it("dono lê atividades; membro cria a própria e não lê as dos outros", async () => {
    const membro = ctx("membro", "membro@loja.com");
    await assertSucceeds(setDoc(doc(membro, "lojas", LOJA, "atividades", "a1"), {
      id: "a1", loja: LOJA, uid: "membro", email: "membro@loja.com", acao: "criar", colecao: "vendas", registroId: "v1", resumo: "Venda", em: "2026-01-02T00:00:00.000Z",
    }));
    await assertFails(getDoc(doc(membro, "lojas", LOJA, "atividades", "a1")));
    const dono = ctx("dono", "dono@loja.com");
    await assertSucceeds(getDoc(doc(dono, "lojas", LOJA, "atividades", "a1")));
  });

  it("anônimo não cria loja; autenticado cria como dono", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, "lojas", "nova"), { ownerUid: "x" }));
    const db = ctx("rafael", "rafael@loja.com");
    await assertSucceeds(setDoc(doc(db, "lojas", "nova"), { ownerUid: "rafael", ownerEmail: "rafael@loja.com", membrosEmails: ["rafael@loja.com"] }));
    await assertFails(setDoc(doc(db, "lojas", "outra"), { ownerUid: "outra-pessoa" }));
  });
});
