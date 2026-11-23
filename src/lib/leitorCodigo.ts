import { BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";
import { ehNativo } from "./plataforma";

const FORMATOS_NATIVOS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
  BarcodeFormat.Code39,
  BarcodeFormat.Code93,
  BarcodeFormat.Itf,
  BarcodeFormat.QrCode,
  BarcodeFormat.DataMatrix,
];

export async function lerCodigoBarras(): Promise<string | null> {
  if (ehNativo()) {
    try {
      return await lerCodigoNativo();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|user|canceled|cancelled/i.test(msg)) return null;
      // If the Play scanner module is missing, try the camera in the WebView.
      try {
        return await lerCodigoNaWeb();
      } catch {
        throw e instanceof Error ? e : new Error(msg);
      }
    }
  }
  return lerCodigoNaWeb();
}

async function lerCodigoNativo(): Promise<string | null> {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== "granted" && perm.camera !== "limited") {
    throw new Error("A câmera não foi autorizada. Autorize a câmera nas configurações do aparelho.");
  }
  try {
    const disponivel = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!disponivel.available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    }
  } catch {
    // some devices have no Play module; scan() may still work or we'll fallback
  }
  const { barcodes } = await BarcodeScanner.scan({ formats: FORMATOS_NATIVOS });
  const valor = barcodes.find((b) => b.rawValue)?.rawValue?.trim();
  return valor || null;
}

export function lerCodigoNaWeb(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const raiz = document.createElement("div");
    raiz.className = "leitor-overlay";
    raiz.setAttribute("data-testid", "leitor-overlay");
    raiz.innerHTML = `
      <div class="leitor-caixa">
        <h3>Ler código de barras</h3>
        <p class="muted small">Aponte a câmera para o código. Você também pode digitá-lo.</p>
        <video class="leitor-video" autoplay muted playsinline></video>
        <p class="muted small leitor-status">Abrindo a câmera…</p>
        <label class="field">Digitar o código
          <input class="input" data-testid="leitor-digitado" inputmode="numeric" autocomplete="off" />
        </label>
        <div class="row wrap">
          <button type="button" class="btn grow" data-acao="cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary grow" data-acao="usar" data-testid="leitor-usar">Usar código</button>
        </div>
      </div>
    `;
    document.body.appendChild(raiz);
    const video = raiz.querySelector("video") as HTMLVideoElement;
    const status = raiz.querySelector(".leitor-status") as HTMLElement;
    const input = raiz.querySelector("input") as HTMLInputElement;
    let stream: MediaStream | undefined;
    let encerrado = false;
    let detector: { detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>; stop?: () => void } | undefined;
    let timer = 0;

    const sair = (valor: string | null) => {
      if (encerrado) return;
      encerrado = true;
      window.clearInterval(timer);
      try { detector?.stop?.(); } catch { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
      raiz.remove();
      resolve(valor);
    };

    raiz.querySelector('[data-acao="cancelar"]')?.addEventListener("click", () => sair(null));
    raiz.querySelector('[data-acao="usar"]')?.addEventListener("click", () => {
      const v = input.value.trim();
      if (v) sair(v);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) sair(input.value.trim());
    });

    const onCodigo = (valor: string) => {
      if (valor.trim()) sair(valor.trim());
    };

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          status.textContent = "Este aparelho não liberou a câmera. Digite o código abaixo.";
          input.focus();
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        status.textContent = "Aponte para o código…";
        const nativo = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
        if (nativo) {
          const det = new nativo({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"] });
          detector = det;
          timer = window.setInterval(() => {
            if (encerrado || video.readyState < 2) return;
            void det.detect(video).then((codigos) => {
              const v = codigos[0]?.rawValue;
              if (v) onCodigo(v);
            }).catch(() => { /* frame vazio */ });
          }, 250);
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controles = await reader.decodeFromVideoElement(video, (result) => {
          if (result) onCodigo(result.getText());
        });
        detector = { detect: async () => [], stop: () => controles.stop() };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Não foi possível abrir a câmera.";
        if (/NotAllowedError|Permission|denied/i.test(String((e as { name?: string })?.name) + msg)) {
          status.textContent = "A câmera não foi autorizada. Autorize o acesso ou digite o código.";
          input.focus();
          return;
        }
        status.textContent = "Não foi possível abrir a câmera. Digite o código.";
        input.focus();
        if (!navigator.mediaDevices?.getUserMedia) reject(e instanceof Error ? e : new Error(msg));
      }
    })();
  });
}
