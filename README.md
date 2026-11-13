# Atlas Visual de Redes CFTV IP — Página de Vendas

Página de vendas estática de alta conversão (7 Dobras StoryBrand, mobile-first), otimizada para Core Web Vitals, acessibilidade moderna e estética minimalista em **Branco, Preto, Grafite e Azul**.

## Onde configurar seus links de checkout (Payt / Cakto / Hotmart / Hubla)

Abra o arquivo `app.js` e substitua os valores de `CHECKOUT_URLS`:

```js
const CHECKOUT_URLS = {
  basico: 'https://SEU-CHECKOUT-PLANO-BASICO',
  pro: 'https://SEU-CHECKOUT-PLANO-PRO',
};
```

## Arquitetura & Experiência Interativa (Apple Design + Modern Web)

- **Navegação flutuante translúcida:** Barra superior com `backdrop-filter` e indicador direcional animado por molas independentes.
- **Carrossel com física real:** Arraste 1:1 com ponteiro, resistência elástica nas bordas (*rubber-band*), projeção de momento e gradiente suave nas margens (`@property` + `animation-timeline: scroll()`).
- **Inspetor Rápido de Pranchas (`<dialog closedby="any">`):** Ampliação ancorada ao card clicado (*Quick Look* via FLIP), zoom `1.6x` com pan 2D X/Y independente e gesto *swipe-down-to-dismiss* com redução gradual do foco do fundo.
- **Acessibilidade nativa do sistema:** Tipografia nativa por plataforma (`text-scale`), suporte completo a `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast: more` e `forced-colors: active`.

## Onde adicionar o Microsoft Clarity (Mapa de Calor / CRO)

Cole a tag `<script>` fornecida pelo Microsoft Clarity antes do fechamento da tag `</head>` no arquivo `index.html`.
