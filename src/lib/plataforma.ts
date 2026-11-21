import { baixarArquivo } from "./drive";

export function ehNativo(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(c?.isNativePlatform?.());
}

export async function exportarArquivo(nome: string, texto: string): Promise<"share" | "download"> {
  if (ehNativo()) {
    try {
      const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      await Filesystem.writeFile({
        path: nome,
        data: texto,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const uri = await Filesystem.getUri({ path: nome, directory: Directory.Cache });
      await Share.share({ title: "Backup do Controle de Vendas", url: uri.uri });
      return "share";
    } catch {
      // fall through to download
    }
  }
  baixarArquivo(nome, texto);
  return "download";
}
