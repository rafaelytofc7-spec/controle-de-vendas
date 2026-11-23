import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const LOJA = "principal";
const PIN = "2468";
const CODIGO = "ABCD2345";
const REGRAS = readFileSync(resolve(import.meta.dirname, "../../rules/firestore.rules"), "utf8");

let env: RulesTestEnvironment;

function ctx(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

async function semRegras(fn: (db: ReturnType<ReturnType<typeof env.authenticatedContext>["firestore"]>) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (c) => {
    await fn(c.firestore());
  });
}

async function semearLoja(lider = "lider") {
  await semRegras(async (db) => {
    const agora = "2026-11-22T12:00:00.000Z";
    await setDoc(doc(db, "lojas", LOJA), { liderUid: lider, criado_em: agora });
    await setDoc(doc(db, "lojas", LOJA, "privado", "acesso"), { pin: PIN, codigoRecuperacao: CODIGO, atualizado_em: agora });
    await setDoc(doc(db, "lojas", LOJA, "membros", lider), {
      uid: lider, nome: "Rafael", papel: "lider", bloqueado: false, ultimoAcesso: agora, criado_em: agora,
    });
  });
}

async function liberarTentativas(uid: string, falhas = 1) {
  await semRegras(async (db) => {
    await setDoc(doc(db, "lojas", LOJA, "tentativas", uid), {
      falhas,
      proximaTentativa: Timestamp.fromMillis(Date.now() - 1000),
    });
  });
}

describe("regras do Firestore (PIN anônimo, líder e loja compartilhada)", () => {
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
  });

  it("não autenticado não lê a loja", async () => {
    await semearLoja();
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "lojas", LOJA)));
  });

  it("o primeiro aparelho cria loja, PIN privado e se torna líder no mesmo lote", async () => {
    const db = ctx("lider");
    const batch = writeBatch(db);
    const agora = "2026-11-22T12:00:00.000Z";
    batch.set(doc(db, "lojas", LOJA), { liderUid: "lider", criado_em: agora });
    batch.set(doc(db, "lojas", LOJA, "privado", "acesso"), { pin: PIN, codigoRecuperacao: CODIGO, atualizado_em: agora });
    batch.set(doc(db, "lojas", LOJA, "membros", "lider"), {
      uid: "lider", nome: "Rafael", papel: "lider", bloqueado: false, ultimoAcesso: agora, criado_em: agora,
    });
    await assertSucceeds(batch.commit());
  });

  it("o documento privado do PIN não pode ser lido nem listado, nem pelo líder", async () => {
    await semearLoja();
    const db = ctx("lider");
    await assertFails(getDoc(doc(db, "lojas", LOJA, "privado", "acesso")));
    await assertFails(getDocs(collection(db, "lojas", LOJA, "privado")));
  });

  it("entra com o PIN certo e passa a ler as vendas; PIN errado é recusado", async () => {
    await semearLoja();
    await liberarTentativas("membro");
    const db = ctx("membro");
    await assertFails(setDoc(doc(db, "lojas", LOJA, "ingressos", "membro"), {
      pin: "0000", nome: "Ana", em: "2026-11-22T12:00:00.000Z",
    }));
    await assertSucceeds(setDoc(doc(db, "lojas", LOJA, "ingressos", "membro"), {
      pin: PIN, nome: "Ana", em: "2026-11-22T12:00:00.000Z",
    }));
    await assertSucceeds(setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
      uid: "membro", nome: "Ana", papel: "membro", bloqueado: false,
      ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
    }));
    await assertSucceeds(getDoc(doc(db, "lojas", LOJA)));
    await semRegras(async (admin) => {
      await setDoc(doc(admin, "lojas", LOJA, "vendas", "v1"), {
        id: "v1", loja: LOJA, valor: 10, criado_em: "2026-11-22T12:00:00.000Z", atualizado_em: "2026-11-22T12:00:00.000Z",
        criadoPor: "lider", atualizadoPor: "lider",
      });
    });
    await assertSucceeds(getDoc(doc(db, "lojas", LOJA, "vendas", "v1")));
  });

  it("quem não é membro não lê vendas", async () => {
    await semearLoja();
    const db = ctx("estranho");
    await assertFails(getDoc(doc(db, "lojas", LOJA, "vendas", "v1")));
  });

  it("não aceita PIN no documento do membro", async () => {
    await semearLoja();
    await liberarTentativas("membro");
    const db = ctx("membro");
    await assertSucceeds(setDoc(doc(db, "lojas", LOJA, "ingressos", "membro"), {
      pin: PIN, nome: "Ana", em: "2026-11-22T12:00:00.000Z",
    }));
    await assertFails(setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
      uid: "membro", nome: "Ana", papel: "membro", bloqueado: false, pin: PIN,
      ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
    }));
  });

  it("bloqueio de força bruta impede um novo ingresso", async () => {
    await semearLoja();
    await semRegras(async (db) => {
      await setDoc(doc(db, "lojas", LOJA, "tentativas", "intruso"), {
        falhas: 15,
        proximaTentativa: Timestamp.fromMillis(Date.now() - 1000),
        bloqueadoAte: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      });
    });
    const db = ctx("intruso");
    await assertFails(setDoc(doc(db, "lojas", LOJA, "ingressos", "intruso"), {
      pin: PIN, nome: "X", em: "2026-11-22T12:00:00.000Z",
    }));
  });

  it("o líder altera o PIN; um membro não altera", async () => {
    await semearLoja();
    await semRegras(async (db) => {
      await setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
        uid: "membro", nome: "Ana", papel: "membro", bloqueado: false,
        ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
      });
    });
    const lider = ctx("lider");
    await assertSucceeds(setDoc(doc(lider, "lojas", LOJA, "privado", "acesso"), {
      pin: "9999", codigoRecuperacao: "ZZZZZZZZ", atualizado_em: "2026-11-22T13:00:00.000Z",
    }, { merge: true }));
    const membroDb = ctx("membro");
    await assertFails(setDoc(doc(membroDb, "lojas", LOJA, "privado", "acesso"), {
      pin: "1111", codigoRecuperacao: "AAAAAAAA", atualizado_em: "2026-11-22T13:00:00.000Z",
    }, { merge: true }));
  });

  it("recuperação com PIN e código transfere a liderança", async () => {
    await semearLoja();
    await liberarTentativas("novo");
    const db = ctx("novo");
    await assertSucceeds(setDoc(doc(db, "lojas", LOJA, "recuperacao", "novo"), {
      pin: PIN, codigo: CODIGO, em: "2026-11-22T12:00:00.000Z",
    }));
    await assertSucceeds(setDoc(doc(db, "lojas", LOJA), { liderUid: "novo", atualizado_em: "2026-11-22T12:01:00.000Z" }, { merge: true }));
  });

  it("o líder transfere a liderança para um membro", async () => {
    await semearLoja();
    await semRegras(async (db) => {
      await setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
        uid: "membro", nome: "Ana", papel: "membro", bloqueado: false,
        ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
      });
    });
    const lider = ctx("lider");
    await assertSucceeds(setDoc(doc(lider, "lojas", LOJA, "membros", "membro"), { papel: "lider" }, { merge: true }));
    await assertSucceeds(setDoc(doc(lider, "lojas", LOJA, "membros", "lider"), { papel: "membro" }, { merge: true }));
    await assertSucceeds(setDoc(doc(lider, "lojas", LOJA), { liderUid: "membro", atualizado_em: "2026-11-22T12:02:00.000Z" }, { merge: true }));
  });

  it("membro bloqueado não lê os dados da loja; o líder pode bloquear e editar o nome", async () => {
    await semearLoja();
    await semRegras(async (db) => {
      await setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
        uid: "membro", nome: "Ana", papel: "membro", bloqueado: true,
        ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
      });
      await setDoc(doc(db, "lojas", LOJA, "vendas", "v1"), {
        id: "v1", loja: LOJA, valor: 10, criado_em: "2026-11-22T12:00:00.000Z", atualizado_em: "2026-11-22T12:00:00.000Z",
        criadoPor: "lider", atualizadoPor: "lider",
      });
    });
    await assertFails(getDoc(doc(ctx("membro"), "lojas", LOJA, "vendas", "v1")));
    const lider = ctx("lider");
    await assertSucceeds(setDoc(doc(lider, "lojas", LOJA, "membros", "membro"), { bloqueado: false, nome: "Ana Paula" }, { merge: true }));
    await assertSucceeds(getDoc(doc(ctx("membro"), "lojas", LOJA, "vendas", "v1")));
  });

  it("membro registra venda com o próprio uid; dados importados só o líder grava", async () => {
    await semearLoja();
    await semRegras(async (db) => {
      await setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
        uid: "membro", nome: "Ana", papel: "membro", bloqueado: false,
        ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
      });
    });
    const membro = ctx("membro");
    await assertSucceeds(setDoc(doc(membro, "lojas", LOJA, "vendas", "v2"), {
      id: "v2", loja: LOJA, valor: 12, criado_em: "2026-11-22T12:00:00.000Z", atualizado_em: "2026-11-22T12:00:00.000Z",
      criadoPor: "membro", atualizadoPor: "membro",
    }));
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "vendas", "imp"), {
      id: "imp", loja: LOJA, valor: 5, criado_em: "2026-11-22T12:00:00.000Z", atualizado_em: "2026-11-22T12:00:00.000Z",
      criadoPor: "importado", atualizadoPor: "importado",
    }));
    await assertSucceeds(setDoc(doc(ctx("lider"), "lojas", LOJA, "vendas", "imp"), {
      id: "imp", loja: LOJA, valor: 5, criado_em: "2026-11-22T12:00:00.000Z", atualizado_em: "2026-11-22T12:00:00.000Z",
      criadoPor: "importado", atualizadoPor: "importado",
    }));
  });

  it("o membro atualiza só o próprio ultimoAcesso e o próprio nome", async () => {
    await semearLoja();
    await semRegras(async (db) => {
      await setDoc(doc(db, "lojas", LOJA, "membros", "membro"), {
        uid: "membro", nome: "Ana", papel: "membro", bloqueado: false,
        ultimoAcesso: "2026-11-22T12:00:00.000Z", criado_em: "2026-11-22T12:00:00.000Z",
      });
    });
    const membro = ctx("membro");
    await assertSucceeds(setDoc(doc(membro, "lojas", LOJA, "membros", "membro"), {
      ultimoAcesso: "2026-11-22T12:01:00.000Z",
    }, { merge: true }));
    await assertSucceeds(setDoc(doc(membro, "lojas", LOJA, "membros", "membro"), {
      nome: "Ana Paula",
    }, { merge: true }));
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "membros", "lider"), {
      ultimoAcesso: "2026-11-22T12:01:00.000Z",
    }, { merge: true }));
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "membros", "membro"), {
      papel: "lider",
    }, { merge: true }));
    await assertFails(setDoc(doc(membro, "lojas", LOJA, "membros", "membro"), {
      bloqueado: true,
    }, { merge: true }));
  });
});
