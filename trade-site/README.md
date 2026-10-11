# ⚔️ Trade Ledger

Registro de trades por escambo: itens, preços de **compra/venda**, calculadora de trade, dashboard de lucro.
Tudo convertido em **Leg Bait**, **LC** (Legendary Fruit Chest) e **MC** (Mythical Fruit Chest = 10 LC).

## Publicar no GitHub Pages
1. Crie um repositório e envie estes arquivos (`index.html`, `style.css`, `app.js`, `config.js`).
2. Settings → Pages → Source: `main` / root. O site fica em `https://SEU_USER.github.io/REPO/`.

## Modo local (padrão)
Funciona sem configurar nada. Contas e dados ficam no navegador de quem usa (não sincroniza entre aparelhos).
Use **Config → Exportar/Importar backup** para levar os dados.

## Modo online (contas reais + lista global)
GitHub Pages é só hospedagem estática, então contas compartilhadas precisam de um backend. Use o Supabase (grátis):
1. Crie um projeto em supabase.com.
2. SQL Editor → cole e rode `supabase.sql`.
3. Authentication → Providers → Email → **desligue "Confirm email"**.
4. Settings → API → copie *Project URL* e *anon public key* para `config.js`.
5. Faça commit. Pronto: as contas passam a ser reais; a lista de itens é global; cada conta vê só suas trades.

A chave `anon` é pública por design; a segurança vem das políticas RLS do `supabase.sql`.

## Como o cálculo funciona
- Cada item tem **preço de compra** (quanto custa para você obter) e **preço de venda** (quanto você consegue vender), cada um escrito em *qualquer item de referência*.
  Ex.: Pika compra = 150 Leg Bait; Pika venda = 2,5 LC; LC compra = 75 Leg Bait, LC venda = 100 Leg Bait.
- Compra usa os preços de **compra** da referência; venda usa os de **venda** da referência.
- Numa trade: `lucro = valor do que você RECEBE (preço de venda) − valor do que você DÁ (preço de compra)`.
- Cada trade salva uma foto dos preços do momento, então mudar preços depois não altera o histórico.
