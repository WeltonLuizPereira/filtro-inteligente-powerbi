// Preparo do logo: remove fundo branco ligado à borda e recorta as margens vazias.
// Trabalha em até 1024 px no maior lado e devolve PNG, então o logo continua nítido
// mesmo quando o cabeçalho é grande ou a tela tem alta densidade.

export interface LogoOptions { trim: boolean; removeWhite: boolean; }

const MAX_SIDE = 1024;

export function processLogo(url: string, o: LogoOptions): Promise<string> {
    return new Promise((resolve) => {
        if (!o.trim && !o.removeWhite) return resolve(url);
        const img = new Image();
        img.onload = () => {
            try { resolve(run(img, o) || url); } catch { resolve(url); }
        };
        img.onerror = () => resolve(url);
        img.src = url;
    });
}

function run(img: HTMLImageElement, o: LogoOptions): string | null {
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return null;
    const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));

    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h); // lança erro se a imagem veio de outra origem
    const px = data.data;

    const near = (i: number) => {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        return Math.min(r, g, b) >= 235 && Math.max(r, g, b) - Math.min(r, g, b) < 25;
    };
    const empty = (i: number) => px[i + 3] < 12 || near(i);

    if (o.removeWhite) {
        // preenche a partir das bordas: só o fundo ligado à borda vira transparente
        const seen = new Uint8Array(w * h);
        const stack: number[] = [];
        const push = (x: number, y: number) => {
            const p = y * w + x;
            if (!seen[p] && empty(p * 4)) { seen[p] = 1; stack.push(p); }
        };
        for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
        for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
        while (stack.length) {
            const p = stack.pop() as number;
            px[p * 4 + 3] = 0;
            const x = p % w, y = (p / w) | 0;
            if (x > 0) push(x - 1, y);
            if (x < w - 1) push(x + 1, y);
            if (y > 0) push(x, y - 1);
            if (y < h - 1) push(x, y + 1);
        }
        ctx.putImageData(data, 0, 0);
    }

    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    if (o.trim) {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const content = o.removeWhite ? px[i + 3] >= 12 : !empty(i);
                if (content) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
        }
    }
    if (!o.trim || x1 < x0 || y1 < y0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }

    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    const octx = out.getContext("2d");
    if (!octx) return null;
    octx.drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    return out.toDataURL("image/png");
}
