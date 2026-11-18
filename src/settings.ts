import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import Card = formattingSettings.SimpleCard;
import Model = formattingSettings.Model;
import Slice = formattingSettings.Slice;

type Opt = { value: string; displayName: string };
const dd = (name: string, displayName: string, items: Opt[], def: string) =>
    new formattingSettings.ItemDropdown({ name, displayName, items, value: items.find((i) => i.value === def) || items[0] });
const tg = (name: string, displayName: string, value: boolean) =>
    new formattingSettings.ToggleSwitch({ name, displayName, value });
const col = (name: string, displayName: string, value: string) =>
    new formattingSettings.ColorPicker({ name, displayName, value: { value } });
const num = (name: string, displayName: string, value: number) =>
    new formattingSettings.NumUpDown({ name, displayName, value });

class LayoutCard extends Card {
    orientacao = dd("orientacao", "Estilo do visual", [
        { value: "horizontal", displayName: "Cabeçalho (barra horizontal)" },
        { value: "vertical", displayName: "Menu lateral (vertical)" }], "horizontal");
    larguraMenu = num("larguraMenu", "Largura do menu lateral (px)", 240);
    numPrincipais = num("numPrincipais", "Filtros visíveis na barra", 4);
    alinhamento = dd("alinhamento", "Alinhamento", [
        { value: "left", displayName: "Esquerda" },
        { value: "center", displayName: "Centro" },
        { value: "right", displayName: "Direita" }], "right");
    selecaoUnica = tg("selecaoUnica", "Seleção única", false);
    idioma = dd("idioma", "Idioma", [
        { value: "pt", displayName: "Português" },
        { value: "en", displayName: "English" }], "pt");
    mostrarBusca = tg("mostrarBusca", "Busca nas listas", true);
    mostrarOrdenacao = tg("mostrarOrdenacao", "Controle de ordenação", true);
    mostrarChips = tg("mostrarChips", "Filtros aplicados (chips)", true);
    mostrarLimpar = tg("mostrarLimpar", "Botão limpar tudo", true);
    gradeCalendario = tg("gradeCalendario", "Grade para meses e dias", true);
    indicador = dd("indicador", "Indicador no botão", [
        { value: "texto", displayName: "Valor selecionado" },
        { value: "numero", displayName: "Quantidade" }], "texto");
    name = "layout";
    displayName = "Layout e comportamento";
    slices: Slice[] = [this.orientacao, this.larguraMenu, this.numPrincipais, this.alinhamento, this.selecaoUnica, this.idioma,
        this.mostrarBusca, this.mostrarOrdenacao, this.mostrarChips, this.mostrarLimpar, this.gradeCalendario, this.indicador];
}

class CabecalhoCard extends Card {
    altura = num("altura", "Altura do cabeçalho / do logo (px)", 40);
    corFundo = col("corFundo", "Cor de fundo", "#FFFFFF");
    fundoTransparente = tg("fundoTransparente", "Fundo transparente", false);
    mostrarLogo = tg("mostrarLogo", "Mostrar logo", false);
    tamanhoLogo = num("tamanhoLogo", "Tamanho do logo (%)", 100);
    recortarLogo = tg("recortarLogo", "Recortar margens do logo", true);
    removerFundoBranco = tg("removerFundoBranco", "Remover fundo branco do logo", true);
    mostrarTitulo = tg("mostrarTitulo", "Mostrar título", false);
    titulo = new formattingSettings.TextInput({ name: "titulo", displayName: "Título", value: "", placeholder: "Título do relatório" });
    tamanhoTitulo = num("tamanhoTitulo", "Tamanho do título", 16);
    corTitulo = col("corTitulo", "Cor do título", "#E8731A");
    name = "cabecalho";
    displayName = "Cabeçalho, logo e título";
    slices: Slice[] = [this.altura, this.corFundo, this.fundoTransparente, this.mostrarLogo, this.tamanhoLogo,
        this.recortarLogo, this.removerFundoBranco, this.mostrarTitulo, this.titulo, this.tamanhoTitulo, this.corTitulo];
}

class OrdenacaoCard extends Card {
    modo = dd("modo", "Ordenação padrão", [
        { value: "auto", displayName: "Automático (meses, dias, números, datas)" },
        { value: "original", displayName: "Ordem do modelo" },
        { value: "az", displayName: "A → Z" },
        { value: "za", displayName: "Z → A" },
        { value: "count", displayName: "Mais frequentes" }], "auto");
    name = "ordenacao";
    displayName = "Ordenação";
    slices: Slice[] = [this.modo];
}

class AparenciaCard extends Card {
    corDestaque = col("corDestaque", "Cor de destaque", "#E8731A");
    fundo = col("fundo", "Fundo dos botões e painéis", "#FFFFFF");
    texto = col("texto", "Cor do texto", "#334155");
    fonte = dd("fonte", "Fonte", ["Segoe UI", "Segoe UI Semibold", "Arial", "Tahoma", "Verdana", "DIN"]
        .map((f) => ({ value: f, displayName: f })), "Segoe UI");
    tamanhoFonte = num("tamanhoFonte", "Tamanho da fonte", 12);
    raio = num("raio", "Arredondamento (px)", 8);
    sombra = tg("sombra", "Sombra no painel", true);
    borda = tg("borda", "Borda nos botões", true);
    modoEscuro = tg("modoEscuro", "Modo escuro", false);
    name = "aparencia";
    displayName = "Aparência";
    slices: Slice[] = [this.corDestaque, this.fundo, this.texto, this.fonte, this.tamanhoFonte, this.raio,
        this.sombra, this.borda, this.modoEscuro];
}

export class VisualSettings extends Model {
    layout = new LayoutCard();
    cabecalho = new CabecalhoCard();
    ordenacao = new OrdenacaoCard();
    aparencia = new AparenciaCard();
    cards = [this.layout, this.cabecalho, this.ordenacao, this.aparencia];
}
