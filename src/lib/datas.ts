const TZ = "America/Sao_Paulo";

export function agoraIso(): string {
  return new Date().toISOString();
}

export function zonedParts(iso: string, timeZone = TZ) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
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
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday, // Sun, Mon, ...
    chaveDia: `${map.year}-${map.month}-${map.day}`,
  };
}

export function hojeChave(timeZone = TZ): string {
  return zonedParts(new Date().toISOString(), timeZone).chaveDia;
}

/** Monday-start week key (YYYY-Www style via the Monday date). */
export function chaveSemana(iso: string, timeZone = TZ): string {
  const p = zonedParts(iso, timeZone);
  const utc = Date.UTC(p.year, p.month - 1, p.day);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const offset = wd === 0 ? -6 : 1 - wd; // Monday start
  const monday = new Date(utc + offset * 86400000);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function chaveMes(iso: string, timeZone = TZ): string {
  const p = zonedParts(iso, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function mesmoDia(iso: string, chave: string, timeZone = TZ): boolean {
  return zonedParts(iso, timeZone).chaveDia === chave;
}

export function formatarDataHora(iso: string, timeZone = TZ): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDia(iso: string, timeZone = TZ): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
