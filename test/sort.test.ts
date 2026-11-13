import { sortItems, SortItem } from "../src/sort";

const mk = (vals: unknown[], fmt?: (v: any) => string): SortItem[] =>
    vals.map((v, i) => ({ value: v, display: v == null ? "" : fmt ? fmt(v) : String(v), count: 1, firstIndex: i }));

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
}
const order = (items: SortItem[], mode: any = "auto") => sortItems(items, mode).items.map(i => i.display);

// Valores reais da dim_Calendario[MES] (pt-BR, ordem embaralhada como no relatório)
eq("meses pt abreviados",
    order(mk(["dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov"].reverse())),
    ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]);
eq("meses com ponto/maiúscula", order(mk(["Dez.", "Jan.", "Mar."])), ["Jan.", "Mar.", "Dez."]);
eq("meses completos com acento", order(mk(["Março", "Janeiro", "Dezembro", "Fevereiro"])), ["Janeiro", "Fevereiro", "Março", "Dezembro"]);
eq("meses en", order(mk(["Mar", "Jan", "Dec"])), ["Jan", "Mar", "Dec"]);
eq("dias da semana", order(mk(["sex", "dom", "qua", "seg"])), ["dom", "seg", "qua", "sex"]);
eq("dia numérico 2 < 10", order(mk([10, 2, 31, 1])), ["1", "2", "10", "31"]);
eq("dia numérico como texto", order(mk(["10", "2", "1"])), ["1", "2", "10"]);
eq("ano", order(mk([2026, 2024, 2025])), ["2024", "2025", "2026"]);
eq("mes/ano", order(mk(["jan/26", "dez/25", "fev/26"])), ["dez/25", "jan/26", "fev/26"]);
eq("iso ano-mes", order(mk(["2026-02", "2025-12"])), ["2025-12", "2026-02"]);
eq("trimestres", order(mk(["T3", "T1", "T2"])), ["T1", "T2", "T3"]);
eq("datas Date (dd/mm/yyyy exibido)",
    order(mk([new Date(Date.UTC(2026, 0, 10)), new Date(Date.UTC(2025, 11, 31)), new Date(Date.UTC(2026, 0, 2))],
        (d: Date) => `${("0" + d.getUTCDate()).slice(-2)}/${("0" + (d.getUTCMonth() + 1)).slice(-2)}/${d.getUTCFullYear()}`)),
    ["31/12/2025", "02/01/2026", "10/01/2026"]);
eq("datas só texto dd/mm/yyyy", order(mk(["10/01/2026", "31/12/2025", "02/01/2026"])), ["31/12/2025", "02/01/2026", "10/01/2026"]);
eq("texto natural", order(mk(["Op 10", "Op 2", "ana", "Bruno"])), ["ana", "Bruno", "Op 2", "Op 10"]);
eq("vazios por último", order(mk(["mar", null, "jan"])), ["jan", "mar", ""]);
eq("modo original preserva", order(mk(["mar", "jan", "fev"]), "original"), ["mar", "jan", "fev"]);
eq("modo z-a", order(mk(["a", "c", "b"]), "za"), ["c", "b", "a"]);
const cnt = mk(["x", "y", "z"]); cnt[1].count = 5;
eq("modo contagem", order(cnt, "count")[0], "y");


// --- casos extras ---
eq("semana completa pt", order(mk(["Sábado", "Segunda-feira", "Quarta-feira", "Domingo"])), ["Domingo", "Segunda-feira", "Quarta-feira", "Sábado"]);
eq("anos misturados com texto viram texto", order(mk(["2025", "Total", "2024"])), ["2024", "2025", "Total"]);
eq("lista vazia", order(mk([])), []);
eq("so vazios", order(mk([null, ""])), ["", ""]);
eq("numeros decimais com virgula", order(mk(["1,5", "10,25", "2"])), ["1,5", "2", "10,25"]);
eq("mes com maiusculas e espacos", order(mk([" Out ", "JAN", "Fev"])), ["JAN", "Fev", " Out "]);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); } else console.log("\nTodos os testes passaram");
