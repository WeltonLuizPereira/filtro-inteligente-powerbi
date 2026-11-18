import powerbi from "powerbi-visuals-api";
import "../style/visual.less";
import * as models from "powerbi-models";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { interactivityFilterService } from "powerbi-visuals-utils-interactivityutils";
import { VisualSettings } from "./settings";
import { sortItems, SortItem, SortMode } from "./sort";
import { T, Lang } from "./i18n";
import { processLogo } from "./logo";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;

interface FieldItem extends SortItem { key: string; }
interface Field {
    name: string;
    target: models.IFilterColumnTarget;
    items: FieldItem[];
    selected: Set<string>;
    kind: string;
    lastKey?: string;
}

const MORE = -2;
const NONE = -1;

const keyOf = (v: unknown): string =>
    v instanceof Date ? "d:" + v.getTime() : v === null || v === undefined ? "__null__" : "v:" + String(v);

function fmt(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (v instanceof Date && !isNaN(v.getTime())) {
        const p = (n: number) => ("0" + n).slice(-2);
        return `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    }
    return String(v);
}

/** Escolhe texto claro ou escuro, o que tiver mais contraste sobre a cor de destaque. */
function onColor(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return "#FFFFFF";
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return (L + 0.05) / 0.06 > 1.05 / (L + 0.05) ? "#1C1917" : "#FFFFFF";
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private root: HTMLElement;
    private formatting: FormattingSettingsService;
    private settings: VisualSettings = new VisualSettings();
    private fields: Field[] = [];
    private restored: models.IFilter[] = [];
    private open = NONE;                       // índice do painel aberto, MORE ou NONE
    private expanded = new Set<number>();      // acordeões abertos (vertical / mais filtros)
    private searches = new Map<number, string>();
    private sortMode: SortMode = "auto";                 // padrão (painel de formatação)
    private sortByField: Record<string, SortMode> = {};  // ordenação individual de cada filtro
    private lang: Lang = "pt";
    private width = 0;
    private height = 0;
    private canEdit = true;
    private logoInput: HTMLInputElement | null = null;
    private logoMsg = "";
    private logoData = "";                    // logo gravado no visual (data URI), propriedade interna
    private style = "";                       // estilo atual (horizontal | vertical)
    private logoCache = new Map<string, string>();
    private logoPending = new Set<string>();

    constructor(options?: VisualConstructorOptions) {
        if (!options) throw new Error("options ausentes");
        this.host = options.host;
        this.formatting = new FormattingSettingsService();
        this.root = document.createElement("div");
        this.root.className = "sfp";
        options.element.appendChild(this.root);
        // O Power BI só mantém o visual em evidência (à frente dos outros) enquanto o iframe tem foco.
        // Como o render recria o DOM, o botão clicado some e o foco se perderia: o root guarda o foco.
        this.root.tabIndex = -1;
        this.root.addEventListener("pointerdown", () => this.keepFocus());
        // Clique em outro visual do relatório: o iframe perde o foco e o painel aberto fecha.
        window.addEventListener("blur", () => { if (this.open !== NONE) this.close(); });
        this.root.addEventListener("click", (e) => {
            if (this.open !== NONE && !(e.target as HTMLElement).closest(".sfp-btn,.sfp-panel,.sfp-clear,.sfp-chip,.sfp-acc-h")) this.close();
        });
        this.root.addEventListener("dragover", (e) => { if (this.canEdit && this.settings.cabecalho.mostrarLogo.value) e.preventDefault(); });
        this.root.addEventListener("drop", (e) => {
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f && this.canEdit && this.settings.cabecalho.mostrarLogo.value) { e.preventDefault(); this.importLogo(f); }
        });
        this.root.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.open !== NONE) { this.close(); }
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.canEdit = options.viewMode !== powerbi.ViewMode.View;
        this.width = options.viewport.width;
        this.height = options.viewport.height;
        const dv: DataView | undefined = options.dataViews && options.dataViews[0];
        this.settings = this.formatting.populateFormattingSettingsModel(VisualSettings, dv);
        this.sortMode = this.settings.ordenacao.modo.value.value as SortMode;
        this.lang = this.settings.layout.idioma.value.value as Lang;
        const side = this.settings.layout.orientacao.value.value === "vertical";
        this.settings.layout.numPrincipais.visible = !side;
        this.settings.layout.alinhamento.visible = !side;
        this.settings.layout.larguraMenu.visible = side;
        this.sortByField = this.parseSorts(this.readText(dv, "ordenacao", "porCampo"));
        this.logoData = this.readText(dv, "cabecalho", "logoUrl").trim();
        if (this.style !== this.settings.layout.orientacao.value.value) {
            this.style = this.settings.layout.orientacao.value.value as string;
            this.open = NONE; // painel aberto de um estilo não vale no outro
        }
        this.restored = (options.jsonFilters as models.IFilter[]) || [];
        this.lastDv = dv;
        this.pending = false;
        this.fields = this.parse(dv);
        if (this.open >= this.fields.length) this.open = NONE;
        this.render();
    }

    public destroy(): void {
        if (this.logoInput && this.logoInput.parentNode) this.logoInput.parentNode.removeChild(this.logoInput);
        this.logoInput = null;
        this.root.remove();
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formatting.buildFormattingModel(this.settings);
    }

    private get t() { return T[this.lang]; }

    /* ================= dados ================= */
    private parse(dv?: DataView): Field[] {
        const cats = dv && dv.categorical && dv.categorical.categories;
        if (!cats) return [];
        const out: Field[] = [];
        cats.forEach((cat) => {
            const map = new Map<string, FieldItem>();
            cat.values.forEach((v, i) => {
                const k = keyOf(v);
                const hit = map.get(k);
                if (hit) hit.count++;
                else map.set(k, { key: k, value: v, display: fmt(v), count: 1, firstIndex: i });
            });
            const target = interactivityFilterService.extractFilterColumnTarget(cat);
            const field: Field = {
                name: cat.source.displayName,
                target,
                items: Array.from(map.values()),
                selected: new Set<string>(),
                kind: "text",
            };
            for (const f of this.restored) {
                const bf = f as models.IBasicFilter;
                const tg = bf.target as models.IFilterColumnTarget;
                if (bf.values && tg && tg.table === target.table && tg.column === target.column) {
                    const wanted = new Set(bf.values.map((x: any) => String(x instanceof Date ? x.getTime() : x)));
                    field.items.forEach((it) => {
                        const raw = it.value instanceof Date ? String(it.value.getTime()) : String(it.value);
                        const iso = it.value instanceof Date ? it.value.toISOString() : raw;
                        if (wanted.has(raw) || wanted.has(iso)) field.selected.add(it.key);
                    });
                }
            }
            out.push(field);
        });
        return out;
    }

    private fieldKey(f: Field): string {
        const t = f.target as any;
        return [t.table, t.hierarchy, t.hierarchyLevel, t.column].filter(Boolean).join(".") || f.name;
    }

    private modeOf(f: Field): SortMode {
        return this.sortByField[this.fieldKey(f)] || this.sortMode;
    }

    /** Lê uma propriedade interna (sem controle no painel) gravada no visual. */
    private readText(dv: DataView | undefined, object: string, prop: string): string {
        const o: any = dv && dv.metadata && dv.metadata.objects && (dv.metadata.objects as any)[object];
        return o && typeof o[prop] === "string" ? o[prop] : "";
    }

    private parseSorts(json: string): Record<string, SortMode> {
        if (!json) return {};
        try { const j = JSON.parse(json); return j && typeof j === "object" ? j : {}; } catch { return {}; }
    }

    private sorted(f: Field): FieldItem[] {
        const r = sortItems(f.items, this.modeOf(f));
        f.kind = r.kind;
        return r.items;
    }

    /** No painel "Mais Filtros" as escolhas ficam pendentes até o botão "Aplicar Filtros". */
    private pending = false;
    private lastDv: DataView | undefined;

    private apply(): void {
        this.commit();
    }

    private commit(): void {
        this.pending = false;
        const filters: models.BasicFilter[] = this.fields
            .filter((f) => f.selected.size > 0)
            .map((f) => new models.BasicFilter(f.target, "In", f.items.filter((i) => f.selected.has(i.key)).map((i) => i.value as any)));
        if (filters.length === 0) this.host.applyJsonFilter(null as any, "general", "filter", powerbi.FilterAction.remove);
        else this.host.applyJsonFilter(filters as any, "general", "filter", powerbi.FilterAction.merge);
    }

    private setSort(f: Field, mode: SortMode): void {
        this.sortByField = { ...this.sortByField, [this.fieldKey(f)]: mode };
        this.host.persistProperties({
            merge: [{ objectName: "ordenacao", selector: null as any, properties: { porCampo: JSON.stringify(this.sortByField) } }],
        });
        this.render();
    }

    private close(): void {
        if (this.pending) { this.pending = false; this.fields = this.parse(this.lastDv); } // descarta o que não foi aplicado
        this.open = NONE;
        this.render();
    }
    private totalSel = () => this.fields.reduce((a, f) => a + f.selected.size, 0);

    private clearAll(): void {
        this.fields.forEach((f) => f.selected.clear());
        this.commit();
        this.render();
    }

    private toggle(f: Field, it: FieldItem, shown: FieldItem[], ev?: MouseEvent): void {
        const single = this.settings.layout.selecaoUnica.value;
        const has = f.selected.has(it.key);
        if (single) {
            const only = has && f.selected.size === 1;
            f.selected.clear();
            if (!only) f.selected.add(it.key);
        } else if (ev && ev.shiftKey && f.lastKey) {
            const a = shown.findIndex((x) => x.key === f.lastKey), b = shown.findIndex((x) => x.key === it.key);
            if (a >= 0 && b >= 0) shown.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => f.selected.add(x.key));
        } else if (has) f.selected.delete(it.key);
        else f.selected.add(it.key);
        f.lastKey = it.key;
        this.apply();
        this.render();
    }

    private only(f: Field, it: FieldItem): void {
        f.selected.clear();
        f.selected.add(it.key);
        f.lastKey = it.key;
        this.apply();
        this.render();
    }

    /* ================= UI ================= */
    private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    private label(f: Field): string {
        const n = f.selected.size, t = this.t;
        if (n === 0) return t.all;
        if (this.settings.layout.indicador.value.value === "numero") return String(n);
        if (n === 1) {
            const it = f.items.find((x) => f.selected.has(x.key));
            return (it && it.display) || t.blank;
        }
        return t.nSelected(n);
    }

    private applyTheme(): void {
        const a = this.settings.aparencia, s = this.root.style;
        const dark = a.modoEscuro.value;
        const acc = a.corDestaque.value.value;
        this.root.classList.toggle("dark", dark);
        this.root.classList.toggle("shadow", a.sombra.value);
        this.root.classList.toggle("outlined", a.borda.value);
        s.setProperty("--acc", acc);
        s.setProperty("--on-acc", onColor(acc));
        s.setProperty("--bg", dark ? "#1A1816" : a.fundo.value.value);
        s.setProperty("--danger", dark ? "#F0807A" : "#E5534B");
        s.setProperty("--fg", dark ? "#F3EFEA" : a.texto.value.value);
        s.setProperty("--panel", dark ? "#25221F" : a.fundo.value.value);
        s.setProperty("--fs", `${a.tamanhoFonte.value || 12}px`);
        s.setProperty("--r", `${Math.max(0, a.raio.value ?? 10)}px`);
        s.setProperty("--font", `"${a.fonte.value.value}", "Segoe UI", sans-serif`);
        const h = this.settings.cabecalho;
        const want = Math.min(200, Math.max(36, Math.round(h.altura.value || 40)));
        const sw = Math.min(420, Math.max(160, Math.round(this.settings.layout.larguraMenu.value || 240)));
        s.setProperty("--sw", `${Math.min(sw, Math.max(120, this.width - 8))}px`);
        s.setProperty("--hh", `${Math.min(want, Math.max(36, this.height - 8))}px`);
        s.setProperty("--head-bg", h.fundoTransparente.value ? "transparent" : dark ? "#25221F" : h.corFundo.value.value);
        s.setProperty("--title-fg", h.corTitulo.value.value);
        s.setProperty("--title-fs", `${Math.min(48, Math.max(8, Math.round(h.tamanhoTitulo.value || 16)))}px`);
        s.setProperty("--logo-k", String(Math.min(100, Math.max(20, h.tamanhoLogo.value || 100)) / 100));
    }

    /** Logo pronto para exibir; enquanto o preparo roda, mostra o original. */
    private logoSrc(): string {
        const c = this.settings.cabecalho;
        if (!c.mostrarLogo.value) return "";
        const url = this.logoData;
        if (!url) return "";
        const opts = { trim: c.recortarLogo.value, removeWhite: c.removerFundoBranco.value };
        const key = `${url.length}:${url.slice(-48)}:${opts.trim ? 1 : 0}${opts.removeWhite ? 1 : 0}`;
        const hit = this.logoCache.get(key);
        if (hit) return hit;
        if (!this.logoPending.has(key)) {
            this.logoPending.add(key);
            processLogo(url, opts).then((res) => {
                this.logoCache.set(key, res);
                this.logoPending.delete(key);
                this.render();
            });
        }
        return url;
    }

    /** Abre o seletor de arquivos para escolher o logo. */
    private pickLogo(): void {
        if (!this.logoInput) {
            const i = document.createElement("input");
            i.type = "file";
            i.accept = "image/*";
            i.style.display = "none";
            i.addEventListener("change", () => { const f = i.files && i.files[0]; if (f) this.importLogo(f); i.value = ""; });
            this.root.ownerDocument.body.appendChild(i);
            this.logoInput = i;
        }
        this.logoInput.click();
    }

    /** Lê a imagem, reduz para no máximo 640 px e grava no próprio visual. */
    private importLogo(file: File): void {
        if (!file.type.startsWith("image/")) { this.logoMsg = this.t.logoError; this.render(); return; }
        const reader = new FileReader();
        reader.onerror = () => { this.logoMsg = this.t.logoError; this.render(); };
        reader.onload = () => {
            const raw = String(reader.result || "");
            const save = (data: string) => {
                this.logoMsg = "";
                this.host.persistProperties({
                    merge: [{ objectName: "cabecalho", selector: null as any, properties: { logoUrl: data, mostrarLogo: true } }],
                });
            };
            if (file.type === "image/svg+xml") { save(raw); return; }
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement("canvas");
                c.width = Math.max(1, Math.round(img.naturalWidth * k));
                c.height = Math.max(1, Math.round(img.naturalHeight * k));
                const ctx = c.getContext("2d");
                if (!ctx) { save(raw); return; }
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, c.width, c.height);
                save(c.toDataURL("image/png"));
            };
            img.onerror = () => { this.logoMsg = this.t.logoError; this.render(); };
            img.src = raw;
        };
        reader.readAsDataURL(file);
    }

    private removeLogo(): void {
        this.host.persistProperties({
            merge: [{ objectName: "cabecalho", selector: null as any, properties: { logoUrl: "" } }],
        });
    }

    private brand(): HTMLElement | null {
        const c = this.settings.cabecalho;
        const src = this.logoSrc();
        const title = c.mostrarTitulo.value ? (c.titulo.value || "").trim() : "";
        const wantsAdd = c.mostrarLogo.value && !src && this.canEdit;
        if (!src && !title && !wantsAdd) return null;
        const b = this.el("div", "sfp-brand");
        if (wantsAdd) {
            const add = this.el("button", "sfp-logo-add");
            add.type = "button";
            add.appendChild(this.el("span", "sfp-logo-plus", "+"));
            add.appendChild(this.el("span", "", this.logoMsg || this.t.addLogo));
            add.addEventListener("click", (e) => { this.pickLogo(); });
            b.appendChild(add);
        }
        if (src) {
            const box = this.el("div", "sfp-logo-box");
            const img = this.el("img", "sfp-logo");
            img.src = src;
            img.alt = title || "Logo";
            img.draggable = false;
            box.appendChild(img);
            if (this.canEdit) {
                const tools = this.el("div", "sfp-logo-tools");
                const swap = this.el("button", "sfp-logo-btn", "↻");
                swap.type = "button"; swap.title = this.t.changeLogo; swap.setAttribute("aria-label", this.t.changeLogo);
                swap.addEventListener("click", (e) => { this.pickLogo(); });
                const del = this.el("button", "sfp-logo-btn", "×");
                del.type = "button"; del.title = this.t.removeLogo; del.setAttribute("aria-label", this.t.removeLogo);
                del.addEventListener("click", (e) => { this.removeLogo(); });
                tools.appendChild(swap); tools.appendChild(del);
                box.appendChild(tools);
            }
            b.appendChild(box);
        }
        if (title) { const t = this.el("span", "sfp-title", title); t.title = title; b.appendChild(t); }
        return b;
    }

    private icon(): SVGElement {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("class", "sfp-ico");
        svg.setAttribute("aria-hidden", "true");
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", "M2 4.5h5.4M12.6 4.5H14M2 11.5h1.4M8.6 11.5H14");
        svg.appendChild(p);
        [[10, 4.5], [6, 11.5]].forEach(([cx, cy]) => {
            const c = document.createElementNS(ns, "circle");
            c.setAttribute("cx", String(cx)); c.setAttribute("cy", String(cy)); c.setAttribute("r", "1.7");
            svg.appendChild(c);
        });
        return svg;
    }

    private render(): void {
        // preserva rolagem e foco da busca entre redesenhos
        const scrolls = new Map<string, number>();
        this.root.querySelectorAll<HTMLElement>("[data-scroll]").forEach((e) => scrolls.set(e.dataset.scroll as string, e.scrollTop));
        const ae = this.root.ownerDocument.activeElement as HTMLInputElement | null;
        const focus = ae && ae.classList && ae.classList.contains("sfp-search") ? { fi: ae.dataset.fi, pos: ae.selectionStart } : null;

        this.applyTheme();
        this.root.textContent = "";
        const L = this.settings.layout;

        if (this.fields.length === 0) {
            this.root.appendChild(this.el("div", "sfp-empty", this.t.addFields));
            return;
        }
        const vertical = L.orientacao.value.value === "vertical";
        if (vertical) this.renderVertical();
        else this.renderHorizontal();

        scrolls.forEach((v, k) => {
            const e = this.root.querySelector<HTMLElement>(`[data-scroll="${k}"]`);
            if (e) e.scrollTop = v;
        });
        if (focus) {
            const e = this.root.querySelector<HTMLInputElement>(`.sfp-search[data-fi="${focus.fi}"]`);
            if (e) { e.focus(); if (focus.pos !== null) e.setSelectionRange(focus.pos, focus.pos); }
        }
        if (this.hadFocus) this.keepFocus();
    }

    private hadFocus = false;

    /** Devolve o foco ao visual quando o redesenho descartou o elemento que o tinha. */
    private keepFocus(): void {
        this.hadFocus = true;
        const doc = this.root.ownerDocument;
        const ae = doc.activeElement;
        if (!ae || ae === doc.body || ae === doc.documentElement) this.root.focus({ preventScroll: true });
    }

    /* ---- horizontal ---- */
    private renderHorizontal(): void {
        const L = this.settings.layout;
        const nMain = Math.max(1, Math.min(Math.round(L.numPrincipais.value || 4), this.fields.length));
        const hasMore = this.fields.length > nMain;
        if ((this.open === MORE && !hasMore) || this.open >= nMain) this.open = NONE;
        const bar = this.el("div", "sfp-bar al-" + L.alinhamento.value.value);
        const btns: HTMLElement[] = [];

        this.fields.slice(0, nMain).forEach((f, i) => {
            const b = this.fieldButton(f, i === this.open, () => {
                this.open = this.open === i ? NONE : i;
                this.render();
            });
            btns.push(b);
            bar.appendChild(b);
        });
        if (hasMore) {
            const extra = this.fields.slice(nMain).reduce((a, f) => a + f.selected.size, 0);
            bar.appendChild(this.el("span", "sfp-sep"));
            const b = this.el("button", "sfp-btn sfp-more" + (extra ? " on" : "") + (this.open === MORE ? " open" : ""));
            b.type = "button";
            b.setAttribute("aria-expanded", String(this.open === MORE));
            b.appendChild(this.icon());
            b.appendChild(this.el("span", "sfp-name", this.t.more));
            if (extra) b.appendChild(this.el("span", "sfp-pill", String(extra)));
            b.appendChild(this.el("span", "sfp-chev"));
            b.addEventListener("click", (e) => { this.open = this.open === MORE ? NONE : MORE; this.render(); });
            btns.push(b);
            bar.appendChild(b);
        }
        if (L.mostrarLimpar.value) bar.appendChild(this.clearButton());
        const header = this.el("div", "sfp-header");
        const brand = this.brand();
        if (brand) header.appendChild(brand);
        header.appendChild(bar);
        this.root.appendChild(header);

        if (L.mostrarChips.value && this.totalSel() > 0) this.root.appendChild(this.chipRow());

        if (this.open !== NONE) {
            const anchor = this.open === MORE ? btns[btns.length - 1] : btns[this.open];
            this.renderPopover(header, anchor, nMain);
        }
    }

    private fieldButton(f: Field, open: boolean, onClick: () => void): HTMLButtonElement {
        const b = this.el("button", "sfp-btn" + (f.selected.size ? " on" : "") + (open ? " open" : ""));
        b.type = "button";
        b.setAttribute("aria-haspopup", "listbox");
        b.setAttribute("aria-expanded", String(open));
        b.title = f.selected.size ? `${f.name}: ${this.label(f)}` : f.name;
        b.appendChild(this.el("span", "sfp-name", f.name));
        const p = this.pill(f);
        if (p) b.appendChild(this.el("span", "sfp-pill", p));
        b.appendChild(this.el("span", "sfp-chev"));
        b.addEventListener("click", (e) => { onClick(); });
        return b;
    }

    /** Texto do selo no botão: valor (1 seleção) ou quantidade. */
    private pill(f: Field): string {
        const n = f.selected.size;
        if (n === 0) return "";
        if (n === 1 && this.settings.layout.indicador.value.value !== "numero") {
            const it = f.items.find((x) => f.selected.has(x.key));
            return (it && it.display) || this.t.blank;
        }
        return String(n);
    }

    private clearButton(): HTMLButtonElement {
        const off = this.totalSel() === 0;
        const c = this.el("button", "sfp-clear" + (off ? " off" : ""));
        c.type = "button";
        c.disabled = off;
        c.appendChild(this.el("span", "sfp-clear-x", "×"));
        c.appendChild(this.el("span", "", this.t.clearAll));
        c.addEventListener("click", (e) => { this.clearAll(); });
        return c;
    }

    private chipRow(): HTMLElement {
        const row = this.el("div", "sfp-chips");
        this.fields.forEach((f) => {
            const sel = f.items.filter((i) => f.selected.has(i.key));
            if (!sel.length) return;
            const shown = this.sorted(f).filter((i) => f.selected.has(i.key));
            shown.slice(0, 3).forEach((it) => row.appendChild(this.chip(f, it)));
            if (shown.length > 3) {
                const more = this.el("span", "sfp-chip static", `+${shown.length - 3}`);
                more.title = f.name;
                row.appendChild(more);
            }
        });
        return row;
    }

    private chip(f: Field, it: FieldItem): HTMLElement {
        const c = this.el("button", "sfp-chip");
        c.type = "button";
        c.title = `${f.name}: ${it.display || this.t.blank}`;
        c.appendChild(this.el("span", "sfp-chip-f", f.name));
        c.appendChild(this.el("span", "sfp-chip-v", it.display || this.t.blank));
        c.appendChild(this.el("span", "sfp-x", "×"));
        c.setAttribute("aria-label", this.t.remove(f.name, it.display));
        c.addEventListener("click", (e) => { f.selected.delete(it.key); this.commit(); this.render(); });
        return c;
    }

    private renderPopover(header: HTMLElement, anchor: HTMLElement, nMain: number): void {
        const panel = this.el("div", "sfp-panel");
        panel.setAttribute("role", "dialog");
        const isMore = this.open === MORE;
        if (isMore) {
            const wrap = this.el("div", "sfp-acc-wrap");
            wrap.dataset.scroll = "more";
            this.fields.slice(nMain).forEach((f, k) => wrap.appendChild(this.accordion(f, nMain + k)));
            panel.appendChild(wrap);
            const bar = this.el("div", "sfp-apply-bar");
            const go = this.el("button", "sfp-apply", this.t.applyFilters);
            go.type = "button";
            go.addEventListener("click", () => { this.commit(); this.close(); });
            bar.appendChild(go);
            panel.appendChild(bar);
            panel.classList.add("wide");
        } else {
            this.fillFieldPanel(panel, this.fields[this.open]);
        }
        this.root.appendChild(panel);

        const rr = this.root.getBoundingClientRect();
        const hr = header.getBoundingClientRect();
        const top = hr.bottom - rr.top + 4;
        const room = this.height - top - 6;
        if (room < 190) {
            panel.classList.add("overlay");
        } else {
            panel.style.top = `${top}px`;
            panel.style.maxHeight = `${room}px`;
            const w = panel.offsetWidth;
            panel.style.left = `${Math.max(6, Math.min(anchor.getBoundingClientRect().left - rr.left, this.width - w - 6))}px`;
        }
        const s = panel.querySelector<HTMLInputElement>(".sfp-search");
        if (s && !this.searches.get(this.open)) s.focus();
    }

    /* ---- vertical ---- */
    private renderVertical(): void {
        const L = this.settings.layout;
        const side = this.el("div", "sfp-side");
        const brand = this.brand();
        if (brand) { brand.classList.add("vert"); side.appendChild(brand); }
        const head = this.el("div", "sfp-vhead");
        head.appendChild(this.el("span", "sfp-vtitle", this.t.filters));
        if (L.mostrarLimpar.value) head.appendChild(this.clearButton());
        side.appendChild(head);
        if (L.mostrarChips.value && this.totalSel() > 0) side.appendChild(this.chipRow());

        const list = this.el("div", "sfp-nav-list");
        list.dataset.scroll = "vertical";
        const navs: HTMLElement[] = [];
        this.fields.forEach((f, i) => {
            const b = this.fieldButton(f, i === this.open, () => {
                this.open = this.open === i ? NONE : i;
                this.render();
            });
            b.classList.add("sfp-nav");
            navs.push(b);
            list.appendChild(b);
        });
        side.appendChild(list);
        this.root.appendChild(side);
        if (this.open >= 0 && navs[this.open]) this.renderFly(side, navs[this.open]);
    }

    /** Sub-menu: abre à direita do botão clicado; sem espaço, cobre o menu com botão de fechar. */
    private renderFly(side: HTMLElement, btn: HTMLElement): void {
        const f = this.fields[this.open];
        const panel = this.el("div", "sfp-panel fly");
        panel.setAttribute("role", "dialog");
        this.fillFieldPanel(panel, f);
        this.root.appendChild(panel);

        const rr = this.root.getBoundingClientRect();
        const sr = side.getBoundingClientRect();
        const room = this.width - (sr.right - rr.left) - 14;
        if (room < 280) {
            panel.classList.add("overlay");
        } else {
            panel.style.left = `${sr.right - rr.left + 8}px`;
            panel.style.maxWidth = `${room}px`;
            panel.style.maxHeight = `${this.height - 12}px`;
            const ph = panel.offsetHeight;
            const top = Math.max(6, Math.min(btn.getBoundingClientRect().top - rr.top - 4, this.height - ph - 6));
            panel.style.top = `${top}px`;
        }
        const s = panel.querySelector<HTMLInputElement>(".sfp-search");
        if (s && !this.searches.get(this.open)) s.focus();
    }

    private accordion(f: Field, i: number): HTMLElement {
        const open = this.expanded.has(i);
        const sec = this.el("section", "sfp-acc" + (open ? " open" : "") + (f.selected.size ? " on" : ""));
        const h = this.el("button", "sfp-acc-h");
        h.type = "button";
        h.setAttribute("aria-expanded", String(open));
        h.appendChild(this.el("span", "sfp-acc-t", f.name));
        h.appendChild(this.el("span", "sfp-acc-v", f.selected.size ? this.label(f) : ""));
        h.appendChild(this.el("span", "sfp-caret", open ? "−" : "+"));
        h.addEventListener("click", (e) => {
            if (open) this.expanded.delete(i); else this.expanded.add(i);
            this.render();
        });
        sec.appendChild(h);
        if (open) {
            const body = this.el("div", "sfp-acc-b");
            this.sorted(f);
            this.renderOptions(f, i, body);
            sec.appendChild(body);
        }
        return sec;
    }

    /** Conteúdo do painel de um campo (busca, ordenação e opções); vale para o cabeçalho e o menu lateral. */
    private fillFieldPanel(panel: HTMLElement, f: Field): void {
        this.sorted(f); // define o tipo do campo antes de escolher lista ou grade
        if (this.useGrid(f)) panel.classList.add("grid-panel");
        this.renderOptions(f, this.open, panel);
    }

    /* ---- lista / grade de opções ---- */
    private useGrid(f: Field): boolean {
        if (!this.settings.layout.gradeCalendario.value) return false;
        const k = f.kind;
        if (k === "month" || k === "weekday" || k === "quarter") return true;
        if (k === "number") {
            const vals = f.items.map((i) => Number(i.value)).filter((n) => isFinite(n));
            return vals.length > 0 && vals.length <= 31 && vals.every((n) => Number.isInteger(n) && n >= 0 && n <= 31) && f.items.length > 6;
        }
        return false;
    }

    private gridCols(f: Field): number {
        return f.kind === "month" || f.kind === "quarter" ? 4 : 7;
    }

    private isChipsRow(f: Field): boolean {
        // anos e números pequenos viram uma fileira de blocos
        if (f.kind !== "number" || f.items.length > 8) return false;
        return f.items.every((i) => { const n = Number(i.value); return Number.isInteger(n) && n >= 1900 && n <= 2200; });
    }

    private renderOptions(f: Field, fi: number, host: HTMLElement): void {
        const L = this.settings.layout, t = this.t;
        const single = L.selecaoUnica.value;

        const head = this.el("div", "sfp-head");
        const input = this.el("input", "sfp-search");
        input.type = "search";
        input.dataset.fi = String(fi);
        input.placeholder = t.search(f.name);
        input.value = this.searches.get(fi) || "";
        input.setAttribute("aria-label", t.search(f.name));
        if (L.mostrarBusca.value) {
            const sr = this.el("div", "sfp-search-row");
            sr.appendChild(input);
            host.appendChild(sr);
        }
        if (!single) {
            const all = this.el("button", "sfp-mini", t.all); all.type = "button";
            const inv = this.el("button", "sfp-mini", t.invert); inv.type = "button";
            head.appendChild(all); head.appendChild(inv);
            all.addEventListener("click", () => { this.visible(f, input.value).forEach((i) => f.selected.add(i.key)); this.apply(); this.render(); });
            inv.addEventListener("click", () => {
                this.visible(f, input.value).forEach((i) => (f.selected.has(i.key) ? f.selected.delete(i.key) : f.selected.add(i.key)));
                this.apply(); this.render();
            });
        }
        const none = this.el("button", "sfp-mini", t.none); none.type = "button";
        none.addEventListener("click", () => { f.selected.clear(); this.apply(); this.render(); });
        head.appendChild(none);
        if (this.open !== NONE && this.open !== MORE && this.open === fi) {
            head.appendChild(this.el("span", "sfp-spacer"));
            const close = this.el("button", "sfp-mini ghost", t.close); close.type = "button";
            close.addEventListener("click", () => this.close());
            head.appendChild(close);
        }
        host.appendChild(head);

        if (L.mostrarOrdenacao.value) {
            const seg = this.el("div", "sfp-seg");
            seg.setAttribute("role", "group");
            seg.setAttribute("aria-label", t.sort);
            (["auto", "az", "za", "count", "original"] as SortMode[]).forEach((m) => {
                const b = this.el("button", "sfp-seg-b" + (this.modeOf(f) === m ? " on" : ""), t.sortNames[m]);
                b.type = "button";
                b.setAttribute("aria-pressed", String(this.modeOf(f) === m));
                b.addEventListener("click", () => this.setSort(f, m));
                seg.appendChild(b);
            });
            host.appendChild(seg);
        }

        const scroller = this.el("div", "sfp-scroll");
        scroller.dataset.scroll = "opt" + fi;
        host.appendChild(scroller);
        const foot = this.el("div", "sfp-foot");
        host.appendChild(foot);

        const draw = () => {
            this.searches.set(fi, input.value);
            scroller.textContent = "";
            const shown = this.visible(f, input.value);
            const grid = this.useGrid(f) && !input.value.trim();
            const chips = this.isChipsRow(f);
            const box = this.el("div", grid ? "sfp-grid c" + this.gridCols(f) : chips ? "sfp-yrs" : "sfp-list");
            if (grid && f.kind === "weekday") box.classList.add("wk");
            shown.forEach((it) => {
                const on = f.selected.has(it.key);
                const txt = it.display || t.blank;
                if (grid || chips) {
                    const b = this.el("button", "sfp-tile" + (on ? " on" : ""), grid && f.kind !== "number" && txt.length > 3 ? txt.slice(0, 3) : txt);
                    b.type = "button";
                    b.title = `${txt} · ${it.count}`;
                    b.setAttribute("role", "checkbox");
                    b.setAttribute("aria-checked", String(on));
                    b.addEventListener("click", (e) => this.toggle(f, it, shown, e));
                    b.addEventListener("dblclick", () => this.only(f, it));
                    box.appendChild(b);
                } else {
                    const row = this.el("div", "sfp-row" + (on ? " on" : ""));
                    const b = this.el("button", "sfp-opt");
                    b.type = "button";
                    b.setAttribute("role", "checkbox");
                    b.setAttribute("aria-checked", String(on));
                    b.appendChild(this.el("span", "sfp-box"));
                    b.appendChild(this.el("span", "sfp-txt", txt));
                    b.appendChild(this.el("span", "sfp-cnt", String(it.count)));
                    b.addEventListener("click", (e) => this.toggle(f, it, shown, e));
                    row.appendChild(b);
                    if (!single) {
                        const o = this.el("button", "sfp-only", t.only); o.type = "button";
                        o.addEventListener("click", (e) => { this.only(f, it); });
                        row.appendChild(o);
                    }
                    box.appendChild(row);
                }
            });
            if (!shown.length) box.appendChild(this.el("div", "sfp-empty", t.empty));
            scroller.appendChild(box);
            foot.textContent = t.nOf(f.selected.size, f.items.length);
        };
        draw();
        input.addEventListener("input", draw);
    }

    private visible(f: Field, q: string): FieldItem[] {
        const s = q.trim().toLowerCase();
        return this.sorted(f).filter((i) => !s || i.display.toLowerCase().includes(s));
    }
}
