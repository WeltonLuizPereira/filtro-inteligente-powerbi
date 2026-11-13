# Filtro Inteligente (Power BI)

Visual de filtros com **ordenação inteligente**: meses, dias da semana, trimestres, números e datas saem na ordem certa sem depender da coluna de ordenação do modelo. Funciona em dois estilos: **Cabeçalho** (barra horizontal) e **Menu lateral** (sub-menu à direita).

## Baixar

**[Baixar o visual (filtro-inteligente-powerbi.pbiviz)](https://github.com/WeltonLuizPereira/filtro-inteligente-powerbi/releases/latest/download/filtro-inteligente-powerbi.pbiviz)**: é um arquivo só, não precisa baixar mais nada.
Todas as versões ficam em [Releases](https://github.com/WeltonLuizPereira/filtro-inteligente-powerbi/releases).

## Usar no Power BI

1. `Inserir → Mais visuais → Dos meus arquivos` e escolha o arquivo `.pbiviz` baixado.
2. Coloque as colunas em **Campos de filtro** (até 10).
3. Em **Formato**, escolha o **Estilo do visual**.
4. Para logo: ligue **Mostrar logo** em *Cabeçalho, logo e título* e clique em **+ Importar logo** no próprio visual (ou arraste a imagem para ele).

## Painel de formato

| Cartão | O que controla |
|---|---|
| Layout e comportamento | Estilo (cabeçalho ou menu lateral), largura do menu, filtros visíveis na barra, alinhamento, seleção única, idioma, busca, ordenação, chips, limpar tudo, grade de meses/dias, indicador no botão |
| Cabeçalho, logo e título | Altura, cor de fundo, fundo transparente, logo (tamanho, recorte, fundo branco) e título (texto, tamanho, cor) |
| Ordenação | Ordenação padrão. Cada filtro pode ter a sua, escolhida no próprio painel do filtro |
| Aparência | Cor de destaque, fundo dos botões e painéis, cor do texto, fonte, tamanho, arredondamento, sombra do painel, borda dos botões, modo escuro |

## Desenvolver

```bash
npm install
npm test        # testes da ordenação + auditoria (capabilities x painel x código)
npm run build   # gera dist/*.pbiviz
```

Estrutura:

- `src/sort.ts` ordenação (sem dependência do Power BI, testável em Node)
- `src/visual.ts` interface, filtros e estilos
- `src/settings.ts` painel de formato
- `src/logo.ts` preparo do logo (recorte e fundo branco)
- `src/i18n.ts` textos em português e inglês
- `style/visual.less` estilos
- `tools/audit.js` confere se `capabilities.json`, o painel e o código andam juntos

Ao criar uma opção nova: declare em `capabilities.json` **e** em `src/settings.ts`, use em `src/visual.ts` e rode `npm test`.

## Limites do Power BI

- O visual não redimensiona a si mesmo: o menu lateral ocupa a largura configurada dentro da área reservada. Para o sub-menu abrir à direita, o visual precisa ser mais largo que o menu; sem espaço, o sub-menu cobre o menu.
- A parte transparente do visual bloqueia cliques nos visuais que estiverem debaixo dele.
- O logo é gravado dentro do visual (reduzido a no máximo 640 px).

## Licença e origem

Código aberto sob a licença [MIT](LICENSE): pode usar, copiar, modificar e distribuir, inclusive em trabalho comercial.

É um projeto independente, escrito do zero. Não usa código de outros visuais.

## Contribuir

Achou um erro ou tem uma ideia? Abra uma [issue](https://github.com/WeltonLuizPereira/filtro-inteligente-powerbi/issues). Para mexer no código, veja a seção *Desenvolver*; rode `npm test` antes de enviar alterações.
