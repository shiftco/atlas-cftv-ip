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

## Onde adicionar o Microsoft Clarity (Mapa de Calor / CRO)

Cole a tag `<script>` fornecida pelo Microsoft Clarity antes do fechamento da tag `</head>` no arquivo `index.html`.
