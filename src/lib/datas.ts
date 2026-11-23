export const TZ = "America/Sao_Paulo";

export function agoraIso(): string {
  return new Date().toISOString();
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: string;
  chaveDia: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const partsCache = new Map<string, ZonedParts>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function zonedParts(iso: string, timeZone = TZ): ZonedParts {
  const key = iso + "\t" + timeZone;
  const hit = partsCache.get(key);
  if (hit) return hit;
  const d = new Date(iso);
  const map: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const out: ZonedParts = {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
    chaveDia: `${map.year}-${map.month}-${map.day}`,
  };
  partsCache.set(key, out);
  return out;
}

let hojeMemo = { em: 0, chave: "", tz: TZ };

export function hojeChave(timeZone = TZ): string {
  const agora = Date.now();
  if (hojeMemo.tz === timeZone && hojeMemo.chave && agora - hojeMemo.em < 1_000) {
    return hojeMemo.chave;
  }
  const chave = zonedParts(new Date(agora).toISOString(), timeZone).chaveDia;
  hojeMemo = { em: agora, chave, tz: timeZone };
  return chave;
}

export function chaveSemanaDeParts(p: ZonedParts): string {
  const utc = Date.UTC(p.year, p.month - 1, p.day);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const offset = wd === 0 ? -6 : 1 - wd;
  const monday = new Date(utc + offset * 86400000);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday-start week key (YYYY-MM-DD of that week's Monday). */
export function chaveSemana(iso: string, timeZone = TZ): string {
  return chaveSemanaDeParts(zonedParts(iso, timeZone));
}

export function chaveMes(iso: string, timeZone = TZ): string {
  const p = zonedParts(iso, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function mesmoDia(iso: string, chave: string, timeZone = TZ): boolean {
  return zonedParts(iso, timeZone).chaveDia === chave;
}

const fmtHora = new Map<string, Intl.DateTimeFormat>();
const fmtDia = new Map<string, Intl.DateTimeFormat>();

export function formatarDataHora(iso: string, timeZone = TZ): string {
  let f = fmtHora.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("pt-BR", {
      timeZone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
    fmtHora.set(timeZone, f);
  }
  return f.format(new Date(iso));
}

export function formatarDia(iso: string, timeZone = TZ): string {
  let f = fmtDia.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("pt-BR", {
      timeZone, day: "2-digit", month: "short", year: "numeric",
    });
    fmtDia.set(timeZone, f);
  }
  return f.format(new Date(iso));
}

export function diasDoMes(ano: number, mes1a12: number): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(ano, mes1a12 - 1, 1));
  while (d.getUTCMonth() === mes1a12 - 1) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Local wall time in America/Sao_Paulo (UTC-3 year-round) to an ISO instant. */
export function horarioLocalParaIso(dia: string, hora: string): string {
  const [hh, mm] = (hora || "00:00").split(":");
  const h = String(Number(hh) || 0).padStart(2, "0");
  const m = String(Number(mm) || 0).padStart(2, "0");
  return new Date(`${dia}T${h}:${m}:00-03:00`).toISOString();
}

export function isoParaDiaHora(iso: string, timeZone = TZ): { dia: string; hora: string } {
  const p = zonedParts(iso, timeZone);
  const d = new Date(iso);
  const map: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(d)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return { dia: p.chaveDia, hora: `${map.hour ?? "00"}:${map.minute ?? "00"}` };
}

export function prazoLembretePadrao(dataEntregaIso: string, hora = "12:00"): string {
  return horarioLocalParaIso(zonedParts(dataEntregaIso).chaveDia, hora || "12:00");
}

