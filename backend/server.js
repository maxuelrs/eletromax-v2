```js
// ======================================================
// INICIALIZAR BANCO
// ======================================================

async function inicializarBanco() {

  try {

    // --------------------------------------------------
    // TABELA PRODUTOS
    // --------------------------------------------------

    await pool.query(
      "CREATE TABLE IF NOT EXISTS produtos (" +
      "id SERIAL PRIMARY KEY, " +
      "nome TEXT NOT NULL, " +
      "preco TEXT, " +
      "link TEXT NOT NULL, " +
      "plataforma TEXT NOT NULL, " +
      "criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log("Tabela produtos OK");

    // --------------------------------------------------
    // TABELA OFERTAS
    // --------------------------------------------------

    await pool.query(
      "CREATE TABLE IF NOT EXISTS ofertas (" +
      "id SERIAL PRIMARY KEY, " +
      "nome TEXT NOT NULL, " +
      "preco TEXT, " +
      "preco_anterior TEXT, " +
      "link TEXT NOT NULL, " +
      "plataforma TEXT NOT NULL, " +
      "imagem TEXT, " +
      "descricao TEXT, " +
      "criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log("Tabela ofertas OK");

    // --------------------------------------------------
    // TABELA CONFIGURACOES
    // --------------------------------------------------

    await pool.query(
      "CREATE TABLE IF NOT EXISTS configuracoes (" +
      "id INTEGER PRIMARY KEY, " +
      "nome_loja TEXT, " +
      "link_mercadolivre TEXT, " +
      "link_shopee TEXT, " +
      "link_whatsapp TEXT, " +
      "atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log("Tabela configuracoes OK");

    // --------------------------------------------------
    // TABELA TOKENS MERCADO LIVRE
    // --------------------------------------------------

    await pool.query(
      "CREATE TABLE IF NOT EXISTS mercadolivre_tokens (" +
      "id INTEGER PRIMARY KEY, " +
      "access_token TEXT NOT NULL, " +
      "refresh_token TEXT, " +
      "user_id TEXT, " +
      "expires_in INTEGER, " +
      "criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
      "atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log("Tabela mercadolivre_tokens OK");

    // --------------------------------------------------
    // CONFIGURAÇÃO PADRÃO
    // --------------------------------------------------

    await pool.query(
      "INSERT INTO configuracoes " +
      "(id, nome_loja, link_mercadolivre, link_shopee, link_whatsapp) " +
      "VALUES (1, 'Eletromax', $1, $2, $3) " +
      "ON CONFLICT (id) DO NOTHING",
      [
        LINK_MERCADO_LIVRE,
        LINK_SHOPEE,
        LINK_WHATSAPP
      ]
    );

    console.log(
      "TABELAS DO ELETROMAX PRONTAS"
    );

    return true;

  } catch (erro) {

    console.error(
      "ERRO AO CRIAR TABELAS:",
      erro.message
    );

    return false;

  }

}
```
