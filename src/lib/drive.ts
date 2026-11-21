export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.appdata";
const ARQUIVO_NOME = "controle-de-vendas-backup.json";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

export async function carregarGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Não foi possível carregar o login do Google."));
    document.head.appendChild(s);
  });
}

export function obterTokenDrive(clientId: string, prompt = "consent"): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("O login do Google ainda não carregou."));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: ESCOPO_DRIVE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) reject(new Error(resp.error || "Sem permissão do Drive."));
        else resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt });
  });
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Drive: ${r.status} ${t.slice(0, 200)}`);
  }
  return r;
}

export async function salvarBackupNoDrive(token: string, conteudo: string): Promise<void> {
  const list = await api(
    token,
    `/files?spaces=appDataFolder&q=name='${ARQUIVO_NOME}'&fields=files(id,name)`,
  ).then((r) => r.json()) as { files?: Array<{ id: string }> };
  const existente = list.files?.[0]?.id;
  const meta = { name: ARQUIVO_NOME, mimeType: "application/json", parents: existente ? undefined : ["appDataFolder"] };
  const body = new Blob([
    `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--boundary\r\nContent-Type: application/json\r\n\r\n${conteudo}\r\n`,
    `--boundary--`,
  ], { type: "multipart/related; boundary=boundary" });
  const path = existente
    ? `https://www.googleapis.com/upload/drive/v3/files/${existente}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const r = await fetch(path, {
    method: existente ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/related; boundary=boundary" },
    body,
  });
  if (!r.ok) throw new Error(`Falha ao salvar no Drive (${r.status}).`);
}

export async function carregarBackupDoDrive(token: string): Promise<string> {
  const list = await api(
    token,
    `/files?spaces=appDataFolder&q=name='${ARQUIVO_NOME}'&fields=files(id,name,modifiedTime)`,
  ).then((r) => r.json()) as { files?: Array<{ id: string }> };
  const id = list.files?.[0]?.id;
  if (!id) throw new Error("Nenhum backup encontrado no Google Drive.");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("Não foi possível ler o backup do Drive.");
  return r.text();
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "application/json") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
