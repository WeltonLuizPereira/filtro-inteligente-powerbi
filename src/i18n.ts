import { SortMode } from "./sort";

export type Lang = "pt" | "en";

interface Strings {
    all: string; none: string; invert: string; close: string; blank: string; empty: string;
    more: string; filters: string; applyFilters: string; clearAll: string; only: string; sort: string; addFields: string;
    addLogo: string; changeLogo: string; removeLogo: string; logoError: string;
    search: (f: string) => string;
    nSelected: (n: number) => string;
    nOf: (n: number, total: number) => string;
    remove: (f: string, v: string) => string;
    sortNames: Record<SortMode, string>;
}

export const T: Record<Lang, Strings> = {
    pt: {
        all: "Todos", none: "Nenhum", invert: "Inverter", close: "Fechar", blank: "(vazio)", empty: "Nada encontrado",
        more: "Mais Filtros", filters: "Filtros", applyFilters: "Aplicar Filtros", clearAll: "Limpar tudo", only: "só este", sort: "Ordenar",
        addFields: "Adicione campos em “Campos de filtro”.",
        addLogo: "Importar logo", changeLogo: "Trocar logo", removeLogo: "Remover logo", logoError: "Não foi possível ler essa imagem.",
        search: (f) => `Buscar em ${f}…`,
        nSelected: (n) => `${n} selecionados`,
        nOf: (n, total) => (n === 0 ? `${total} opções` : `${n} de ${total} selecionados`),
        remove: (f, v) => `Remover ${f}: ${v}`,
        sortNames: { auto: "Auto", az: "A–Z", za: "Z–A", count: "Freq.", original: "Modelo" },
    },
    en: {
        all: "All", none: "None", invert: "Invert", close: "Close", blank: "(blank)", empty: "No matches",
        more: "More Filters", filters: "Filters", applyFilters: "Apply Filters", clearAll: "Clear all", only: "only", sort: "Sort",
        addFields: "Add fields to “Filter fields”.",
        addLogo: "Import logo", changeLogo: "Change logo", removeLogo: "Remove logo", logoError: "Could not read that image.",
        search: (f) => `Search ${f}…`,
        nSelected: (n) => `${n} selected`,
        nOf: (n, total) => (n === 0 ? `${total} options` : `${n} of ${total} selected`),
        remove: (f, v) => `Remove ${f}: ${v}`,
        sortNames: { auto: "Auto", az: "A–Z", za: "Z–A", count: "Freq.", original: "Model" },
    },
};
