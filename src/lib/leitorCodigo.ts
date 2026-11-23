import { ehNativo } from "./plataforma";
import { logLeitor } from "./diagnosticoLeitor";

/** String values of BarcodeFormat — keep this module free of a static plugin import. */
const FORMATOS_NATIVOS = [
  "ean13",
  "ean8",
  "upcA",
  "upcE",
  "code128",
  "code39",
  "code93",
  "itf",
  "qrCode",
  "dataMatrix",
] as const;

/** Only waits for the camera to start, never cuts a scan already running. */
const START_SCAN_MS = 20_000;
const WEB_CAMERA_MS = 12_000;

export async function lerCodigoBarras(): Promise<string | null> {
  return new Promise((resolve) => {
    const ui = montarOverlay();
    let encerrado = false;
    let stream: MediaStream | undefined;
    let detector: { stop?: () => void } | undefined;
    let timer = 0;
    let nativoAtivo = false;

    const sair = (valor: string | null) => {
      if (encerrado) return;
      encerrado = true;
      window.clearInterval(timer);
      try { detector?.stop?.(); } catch { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
      void pararNativo(nativoAtivo);
      ui.remover();
      logLeitor("info", valor ? "código lido" : "leitura cancelada", valor ? "ok" : undefined);
      resolve(valor);
    };

    ui.onCancel(() => sair(null));
    ui.onUsar((v) => { if (v) sair(v); });
    ui.onAjustes(() => { void abrirAjustes(); });

    void (async () => {
      logLeitor("info", ehNativo() ? "iniciando leitor nativo" : "iniciando leitor web");
      if (ehNativo()) {
        const r = await iniciarNativo(ui, (v) => sair(v), () => {
          nativoAtivo = true;
        });
        if (r === "ok") return;
        nativoAtivo = false;
        if (r === "denied") {
          ui.mostrarErro("A câmera não foi autorizada. Autorize nas configurações do aparelho ou digite o código.", true);
          logLeitor("erro", "permissão da câmera negada");
          return;
        }
        logLeitor("info", "nativo indisponível, tentando câmera do navegador", r);
      }
      const web = await iniciarWeb(ui, (v) => sair(v));
      stream = web.stream;
      detector = web.detector;
      timer = web.timer;
    })();
  });
}

type Overlay = {
  raiz: HTMLElement;
  video: HTMLVideoElement;
  status: HTMLElement;
  input: HTMLInputElement;
  onCancel: (fn: () => void) => void;
  onUsar: (fn: (v: string) => void) => void;
  onAjustes: (fn: () => void) => void;
  setStatus: (t: string) => void;
  modoNativo: (on: boolean) => void;
  mostrarErro: (t: string, nativo?: boolean) => void;
  mostrarPermissaoNegada: (nativo: boolean) => void;
  remover: () => void;
};

function montarOverlay(): Overlay {
  const raiz = document.createElement("div");
  raiz.className = "leitor-overlay";
  raiz.setAttribute("data-testid", "leitor-overlay");
  raiz.setAttribute("role", "dialog");
  raiz.setAttribute("aria-label", "Ler código de barras");
  raiz.innerHTML = `
    <div class="leitor-palco">
      <div class="leitor-visor">
        <video class="leitor-video" autoplay muted playsinline></video>
        <div class="leitor-mira" aria-hidden="true">
          <span class="canto c1"></span>
          <span class="canto c2"></span>
          <span class="canto c3"></span>
          <span class="canto c4"></span>
        </div>
      </div>
      <p class="leitor-status">Abrindo a câmera…</p>
      <p class="leitor-erro" data-testid="leitor-erro" hidden></p>
      <button type="button" class="btn btn-leitor-ajustes" data-acao="ajustes" hidden>Abrir configurações</button>
      <label class="field leitor-digitar">Digitar o código
        <input class="input" data-testid="leitor-digitado" inputmode="numeric" autocomplete="off" />
      </label>
      <div class="leitor-acoes">
        <button type="button" class="btn grow" data-acao="cancelar">Cancelar</button>
        <button type="button" class="btn btn-primary grow" data-acao="usar" data-testid="leitor-usar">Usar código</button>
      </div>
    </div>
  `;
  document.body.appendChild(raiz);
  const video = raiz.querySelector("video") as HTMLVideoElement;
  const status = raiz.querySelector(".leitor-status") as HTMLElement;
  const erroEl = raiz.querySelector(".leitor-erro") as HTMLElement;
  const input = raiz.querySelector('[data-testid="leitor-digitado"]') as HTMLInputElement;
  const btnAjustes = raiz.querySelector('[data-acao="ajustes"]') as HTMLButtonElement;

  const mostrarErro = (t: string, nativo = false) => {
    status.textContent = t;
    erroEl.hidden = false;
    erroEl.textContent = t;
    if (nativo) btnAjustes.hidden = false;
    input.focus();
  };

  return {
    raiz,
    video,
    status,
    input,
    onCancel: (fn) => {
      raiz.querySelector('[data-acao="cancelar"]')?.addEventListener("click", fn);
    },
    onUsar: (fn) => {
      raiz.querySelector('[data-acao="usar"]')?.addEventListener("click", () => {
        const v = input.value.trim();
        if (v) fn(v);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) fn(input.value.trim());
      });
    },
    onAjustes: (fn) => {
      btnAjustes.addEventListener("click", fn);
    },
    setStatus: (t) => { status.textContent = t; },
    modoNativo: (on) => {
      raiz.classList.toggle("leitor-modo-nativo", on);
      document.documentElement.classList.toggle("leitor-nativo-ativo", on);
      document.body.classList.toggle("leitor-nativo-ativo", on);
    },
    mostrarErro,
    mostrarPermissaoNegada: (nativo) => {
      mostrarErro("A câmera não foi autorizada. Autorize nas configurações do aparelho ou digite o código.", nativo);
    },
    remover: () => {
      document.documentElement.classList.remove("leitor-nativo-ativo");
      document.body.classList.remove("leitor-nativo-ativo");
      raiz.remove();
    },
  };
}

type PluginScan = {
  requestPermissions: () => Promise<{ camera?: string }>;
  checkPermissions?: () => Promise<{ camera?: string }>;
  isSupported?: () => Promise<{ supported?: boolean }>;
  startScan: (opts?: { formats?: readonly string[]; lensFacing?: string }) => Promise<void>;
  stopScan: () => Promise<void>;
  addListener: (ev: string, fn: (e: { barcode?: { rawValue?: string } }) => void) => Promise<{ remove: () => Promise<void> }>;
  removeAllListeners?: () => Promise<void>;
  openSettings?: () => Promise<void>;
};

async function carregarPlugin(): Promise<PluginScan> {
  const mod = await import("@capacitor-mlkit/barcode-scanning");
  return mod.BarcodeScanner as unknown as PluginScan;
}

async function pararNativo(estavaAtivo: boolean): Promise<void> {
  document.documentElement.classList.remove("leitor-nativo-ativo");
  document.body.classList.remove("leitor-nativo-ativo");
  if (!ehNativo() && !estavaAtivo) return;
  try {
    const scanner = await carregarPlugin();
    await scanner.removeAllListeners?.();
    await scanner.stopScan();
  } catch {
    /* already stopped or unavailable */
  }
}

async function abrirAjustes(): Promise<void> {
  try {
    const scanner = await carregarPlugin();
    await scanner.openSettings?.();
    logLeitor("info", "abriu configurações do aparelho");
  } catch (e) {
    logLeitor("erro", "não abriu as configurações", e instanceof Error ? e.message : e);
  }
}

async function iniciarNativo(
  ui: Overlay,
  onCodigo: (v: string | null) => void,
  marcarAtivo: () => void,
): Promise<"ok" | "denied" | "fallback"> {
  try {
    const scanner = await carregarPlugin();
    try {
      const sup = await scanner.isSupported?.();
      logLeitor("info", "plugin suportado", sup);
      if (sup && sup.supported === false) return "fallback";
    } catch (e) {
      logLeitor("erro", "isSupported falhou", e instanceof Error ? e.message : e);
    }
    let perm = await scanner.checkPermissions?.().catch(() => undefined);
    if (perm?.camera !== "granted" && perm?.camera !== "limited") {
      perm = await scanner.requestPermissions();
    }
    logLeitor("info", "permissão da câmera", perm);
    if (perm?.camera !== "granted" && perm?.camera !== "limited") {
      return "denied";
    }
    await scanner.removeAllListeners?.();
    await scanner.addListener("barcodeScanned", (ev) => {
      const v = ev.barcode?.rawValue?.trim();
      if (v) {
        logLeitor("info", "código nativo lido");
        onCodigo(v);
      }
    });
    ui.modoNativo(true);
    marcarAtivo();
    ui.setStatus("Aponte para o código…");
    let iniciou = false;
    const inicio = scanner.startScan({ formats: FORMATOS_NATIVOS, lensFacing: "BACK" }).then(() => {
      iniciou = true;
      return "ok" as const;
    });
    const resultado = await Promise.race([
      inicio,
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), START_SCAN_MS)),
    ]);
    if (resultado === "timeout") {
      if (iniciou) {
        // startScan resolved just after the timer; keep the camera running.
        logLeitor("info", "câmera nativa atrasou, mas abriu");
        return "ok";
      }
      logLeitor("erro", "startScan não abriu a tempo, indo para o fallback");
      ui.modoNativo(false);
      await pararNativo(true);
      return "fallback";
    }
    logLeitor("info", "startScan iniciado (ML Kit embutido)");
    ui.setStatus("Aponte para o código…");
    return "ok";
  } catch (e) {
    logLeitor("erro", "falha no leitor nativo", e instanceof Error ? e.message : e);
    ui.modoNativo(false);
    await pararNativo(true);
    return "fallback";
  }
}

async function iniciarWeb(
  ui: Overlay,
  onCodigo: (v: string) => void,
): Promise<{ stream?: MediaStream; detector?: { stop?: () => void }; timer: number }> {
  ui.modoNativo(false);
  let stream: MediaStream | undefined;
  let detector: { stop?: () => void } | undefined;
  let timer = 0;
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      ui.mostrarErro("A câmera está indisponível neste aparelho. Digite o código abaixo.");
      logLeitor("erro", "getUserMedia ausente");
      ui.input.focus();
      return { stream, detector, timer };
    }
    const pedido = navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    const limite = new Promise<MediaStream>((_, rej) => {
      window.setTimeout(() => rej(new Error("timeout")), WEB_CAMERA_MS);
    });
    stream = await Promise.race([pedido, limite]);
    pedido.then((s) => {
      if (s !== stream) s.getTracks().forEach((t) => t.stop());
    }).catch(() => { /* already handled */ });
    ui.video.srcObject = stream;
    await ui.video.play();
    ui.setStatus("Aponte para o código…");
    logLeitor("info", "câmera web aberta");
    const Nativo = (window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
      };
    }).BarcodeDetector;
    if (Nativo) {
      const det = new Nativo({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"],
      });
      timer = window.setInterval(() => {
        if (ui.video.readyState < 2) return;
        void det.detect(ui.video).then((codigos) => {
          const v = codigos[0]?.rawValue;
          if (v) onCodigo(v);
        }).catch(() => { /* empty frame */ });
      }, 250);
      return { stream, detector: { stop: () => window.clearInterval(timer) }, timer };
    }
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const controles = await reader.decodeFromVideoElement(ui.video, (result) => {
      if (result) onCodigo(result.getText());
    });
    detector = { stop: () => controles.stop() };
    return { stream, detector, timer };
  } catch (e) {
    const nome = String((e as { name?: string })?.name ?? "");
    const msg = e instanceof Error ? e.message : "Não foi possível abrir a câmera.";
    logLeitor("erro", "câmera web falhou", nome + " " + msg);
    if (/NotAllowedError|Permission|denied/i.test(nome + msg)) {
      ui.mostrarErro("A câmera não foi autorizada. Autorize o acesso ou digite o código.", ehNativo());
    } else if (/timeout/i.test(msg)) {
      ui.mostrarErro("A câmera demorou para abrir. Digite o código ou tente de novo.");
    } else {
      ui.mostrarErro("A câmera está indisponível. Digite o código abaixo.");
    }
    ui.input.focus();
    return { stream, detector, timer };
  }
}

/** Kept for callers/tests that imported the web overlay directly. */
export function lerCodigoNaWeb(): Promise<string | null> {
  return lerCodigoBarras();
}
