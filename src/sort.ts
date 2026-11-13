// Ordenação inteligente — módulo puro (sem dependência do Power BI), testável em Node.

export type SortMode = "auto" | "original" | "az" | "za" | "count";

export interface SortItem {
    value: unknown;     // valor bruto vindo do Power BI (number | Date | string | null)
    display: string;    // texto exibido
    count: number;      // nº de linhas com esse valor
    firstIndex: number; // ordem de primeira aparição
}

type Kind = "number" | "date" | "month" | "weekday" | "quarter" | "monthYear" | "text";

const strip = (s: string): string =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\.$/, "");

// Mês: abreviações e nomes completos em pt-BR e en (sem acento, sem ponto final).
const MONTHS: Record<string, number> = {};
[
    ["janeiro", "january", "jan"], ["fevereiro", "february", "fev", "feb"],
    ["marco", "march", "mar"], ["abril", "april", "abr", "apr"],
    ["maio", "may", "mai"], ["junho", "june", "jun"],
    ["julho", "july", "jul"], ["agosto", "august", "ago", "aug"],
    ["setembro", "september", "set", "sep", "sept"], ["outubro", "october", "out", "oct"],
    ["novembro", "november", "nov"], ["dezembro", "december", "dez", "dec"],
].forEach((names, i) => names.forEach(n => (MONTHS[n] = i + 1)));

const WEEKDAYS: Record<string, number> = {};
[
    ["domingo", "sunday", "dom", "sun"], ["segunda-feira", "segunda", "monday", "seg", "mon"],
    ["terca-feira", "terca", "tuesday", "ter", "tue", "tues"], ["quarta-feira", "quarta", "wednesday", "qua", "wed"],
    ["quinta-feira", "quinta", "thursday", "qui", "thu", "thur", "thurs"], ["sexta-feira", "sexta", "friday", "sex", "fri"],
    ["sabado", "saturday", "sab", "sat"],
].forEach((names, i) => names.forEach(n => (WEEKDAYS[n] = i + 1)));

const monthOf = (s: string): number | undefined => MONTHS[strip(s)];
const weekdayOf = (s: string): number | undefined => WEEKDAYS[strip(s)];

/** "jan/25", "jan-2025", "janeiro de 2025", "2025-01", "01/2025" -> ano*100+mes */
function monthYearOf(raw: string): number | undefined {
    const s = strip(raw);
    let m = s.match(/^([a-z]+)\s*(?:de|[\/\-. ])\s*(\d{2}|\d{4})$/);
    if (m && MONTHS[m[1]]) return fullYear(+m[2]) * 100 + MONTHS[m[1]];
    m = s.match(/^(\d{2}|\d{4})\s*[\/\-. ]\s*([a-z]+)$/);
    if (m && MONTHS[m[2]]) return fullYear(+m[1]) * 100 + MONTHS[m[2]];
    m = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return +m[1] * 100 + +m[2];
    m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return +m[2] * 100 + +m[1];
    return undefined;
}
const fullYear = (y: number): number => (y < 100 ? 2000 + y : y);

/** "T1", "Q2", "1º trimestre", "Tri 3" -> 1..4 */
function quarterOf(raw: string): number | undefined {
    const s = strip(raw);
    const m = s.match(/^(?:t|q|tri|trim|trimestre|quarter)?\s*([1-4])\s*(?:o|º|°)?\s*(?:t|q|tri|trim|trimestre|quarter)?$/);
    if (m && /[a-z]/.test(s)) return +m[1];
    return undefined;
}

/** "dd/mm/yyyy" ou ISO -> timestamp */
function dateOf(raw: string): number | undefined {
    const s = raw.trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T].*)?$/);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return undefined;
}

const isBlank = (it: SortItem): boolean =>
    it.value === null || it.value === undefined || String(it.display).trim() === "";

function numberOf(it: SortItem): number | undefined {
    if (typeof it.value === "number" && isFinite(it.value)) return it.value;
    const s = String(it.display).trim().replace(/\s/g, "");
    if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return parseFloat(s.replace(",", "."));
    return undefined;
}

/** Decide qual tipo de coluna é, olhando todos os valores não vazios. */
export function detectKind(items: SortItem[]): Kind {
    const vals = items.filter(i => !isBlank(i));
    if (vals.length === 0) return "text";
    const all = (f: (i: SortItem) => boolean) => vals.every(f);
    if (all(i => i.value instanceof Date)) return "date";
    if (all(i => monthOf(String(i.display)) !== undefined)) return "month";
    if (all(i => weekdayOf(String(i.display)) !== undefined)) return "weekday";
    if (all(i => monthYearOf(String(i.display)) !== undefined)) return "monthYear";
    if (all(i => quarterOf(String(i.display)) !== undefined)) return "quarter";
    if (all(i => dateOf(String(i.display)) !== undefined)) return "date";
    if (all(i => numberOf(i) !== undefined)) return "number";
    return "text";
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function keyFor(kind: Kind, it: SortItem): number | string {
    switch (kind) {
        case "number": return numberOf(it) as number;
        case "date":
            return it.value instanceof Date ? it.value.getTime() : (dateOf(String(it.display)) as number);
        case "month": return monthOf(String(it.display)) as number;
        case "weekday": return weekdayOf(String(it.display)) as number;
        case "monthYear": return monthYearOf(String(it.display)) as number;
        case "quarter": return quarterOf(String(it.display)) as number;
        default: return String(it.display);
    }
}

export function sortItems<T extends SortItem>(items: T[], mode: SortMode): { items: T[]; kind: Kind } {
    const kind = detectKind(items);
    const out = items.slice();
    // Vazios sempre por último, qualquer que seja o modo.
    const cmpBlank = (a: T, b: T): number | undefined => {
        const ba = isBlank(a), bb = isBlank(b);
        return ba === bb ? undefined : ba ? 1 : -1;
    };
    const natural = (a: T, b: T): number => {
        const ka = keyFor(kind, a), kb = keyFor(kind, b);
        if (typeof ka === "number" && typeof kb === "number") return ka - kb;
        return collator.compare(String(ka), String(kb));
    };
    switch (mode) {
        case "original":
            out.sort((a, b) => cmpBlank(a, b) ?? a.firstIndex - b.firstIndex);
            break;
        case "az":
            out.sort((a, b) => cmpBlank(a, b) ?? collator.compare(String(a.display), String(b.display)));
            break;
        case "za":
            out.sort((a, b) => cmpBlank(a, b) ?? collator.compare(String(b.display), String(a.display)));
            break;
        case "count":
            out.sort((a, b) => cmpBlank(a, b) ?? (b.count - a.count || natural(a, b)));
            break;
        default: // "auto"
            out.sort((a, b) => cmpBlank(a, b) ?? natural(a, b));
    }
    return { items: out, kind };
}
