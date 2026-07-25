```js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================
   CONEXÃO POSTGRESQL
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   CRIAR TABELA
========================= */

async function inicializarBanco() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco TEXT,
        link TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('BANCO DE DADOS CONECTADO');
    console.log('TABELA PRODUTOS PRONTA');

  } catch (erro) {
    console.error(
      'ERRO AO INICIALIZAR BANCO:',
      erro.message
    );
  }
}

/* =========================
   STATUS
========================= */

app.get('/api/status', async (req, res) => {

  try {

    await pool.query('SELECT NOW()');

    res.json({
      success: true,
      message: 'Eletromax API funcionando!',
      status: 'online',
      database: 'connected'
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: 'Banco de dados não conectado.',
      status: 'online',
      database: 'error',
      error: erro.message
    });

  }

});

/* =========================
   CADASTRAR PRODUTO
========================= */

app.post('/api/produtos', async (req, res) => {

  try {

    const {
      nome,
      preco,
      link,
      plataforma
    } = req.body;

    if (!nome || !link || !plataforma) {

      return res.status(400).json({
        success: false,
        message:
          'Nome, link e plataforma são obrigatórios.'
      });

    }

    const resultado = await pool.query(
      `
      INSERT INTO produtos
      (nome, preco, link, plataforma)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        nome,
        preco || '',
        link,
        plataforma
      ]
    );

    console.log(
      'PRODUTO SALVO:',
      resultado.rows[0]
    );

    res.status(201).json({
      success: true,
      message: 'Produto salvo com sucesso!',
      produto: resultado.rows[0]
    });

  } catch (erro) {

    console.error(
      'ERRO AO SALVAR PRODUTO:',
      erro.message
    );

    res.status(500).json({
      success: false,
      message: 'Erro ao salvar produto.',
      error: erro.message
    });

  }

});

/* =========================
   LISTAR PRODUTOS
========================= */

app.get('/api/produtos', async (req, res) => {

  try {

    const resultado = await pool.query(`
      SELECT *
      FROM produtos
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      produtos: resultado.rows
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: 'Erro ao buscar produtos.',
      error: erro.message
    });

  }

});

/* =========================
   EXCLUIR PRODUTO
========================= */

app.delete('/api/produtos/:id', async (req, res) => {

  try {

    const { id } = req.params;

    const resultado = await pool.query(
      `
      DELETE FROM produtos
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (resultado.rows.length === 0) {

      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado.'
      });

    }

    res.json({
      success: true,
      message: 'Produto excluído com sucesso!',
      produto: resultado.rows[0]
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: 'Erro ao excluir produto.',
      error: erro.message
    });

  }

});

/* =========================
   ESTATÍSTICAS
========================= */

app.get('/api/estatisticas', async (req, res) => {

  try {

    const total =
      await pool.query(
        'SELECT COUNT(*) FROM produtos'
      );

    const mercadoLivre =
      await pool.query(`
        SELECT COUNT(*)
        FROM produtos
        WHERE plataforma = 'Mercado Livre'
      `);

    const shopee =
      await pool.query(`
        SELECT COUNT(*)
        FROM produtos
        WHERE plataforma = 'Shopee'
      `);

    res.json({

      produtos:
        Number(total.rows[0].count),

      mercadoLivre:
        Number(mercadoLivre.rows[0].count),

      shopee:
        Number(shopee.rows[0].count),

      posts: 0

    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: 'Erro nas estatísticas.',
      error: erro.message
    });

  }

});

/* =========================
   PAINEL ELETROMAX
========================= */

app.get('/', (req, res) => {

  res.send(`
<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0"
>

<title>Eletromax V2</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f4f6f8;
  color: #111827;
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 240px;
  height: 100vh;
  background: #111827;
  color: white;
  padding: 25px 15px;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 35px;
  padding-left: 10px;
}

.menu button {
  width: 100%;
  border: none;
  background: transparent;
  color: #d1d5db;
  padding: 14px 12px;
  margin-bottom: 5px;
  text-align: left;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
}

.menu button:hover,
.menu button.active {
  background: #2563eb;
  color: white;
}

.main {
  margin-left: 240px;
  padding: 30px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.status {
  background: #dcfce7;
  color: #166534;
  padding: 9px 15px;
  border-radius: 20px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 30px;
}

.card,
.panel {
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 15px rgba(0,0,0,.06);
}

.card h3 {
  color: #6b7280;
  font-size: 14px;
}

.card strong {
  font-size: 28px;
}

input,
select {
  width: 100%;
  padding: 12px;
  margin: 8px 0 15px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
}

button.primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 7px;
  cursor: pointer;
}

button.danger {
  background: #dc2626;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 7px;
  cursor: pointer;
}

.page {
  display: none;
}

.page.active {
  display: block;
}

.produto {
  border: 1px solid #e5e7eb;
  padding: 15px;
  border-radius: 10px;
  margin-top: 10px;
}

.produto-topo {
  display: flex;
  justify-content: space-between;
  gap: 15px;
}

.badge {
  display: inline-block;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 5px 10px;
  border-radius: 15px;
  font-size: 12px;
}

a {
  color: #2563eb;
  word-break: break-all;
}

textarea {
  width: 100%;
  height: 180px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

@media(max-width: 800px) {

  .sidebar {
    width: 70px;
    padding: 15px 8px;
  }

  .logo {
    font-size: 0;
    text-align: center;
  }

  .logo:first-letter {
    font-size: 25px;
  }

  .menu button {
    font-size: 0;
    text-align: center;
  }

  .menu button:first-letter {
    font-size: 20px;
  }

  .main {
    margin-left: 70px;
    padding: 15px;
  }

  .cards {
    grid-template-columns: 1fr 1fr;
  }

  .produto-topo {
    flex-direction: column;
  }

}

</style>

</head>

<body>

<div class="sidebar">

<div class="logo">
⚡ Eletromax
</div>

<div class="menu">

<button
class="active"
onclick="abrirPagina('dashboard', this)"
>
🏠 Dashboard
</button>

<button
onclick="abrirPagina('produtos', this)"
>
📦 Produtos
</button>

<button
onclick="abrirPagina('mercadolivre', this)"
>
🛒 Mercado Livre
</button>

<button
onclick="abrirPagina('shopee', this)"
>
🛍️ Shopee
</button>

<button
onclick="abrirPagina('posts', this)"
>
📱 Posts
</button>

</div>

</div>

<div class="main">

<div class="header">

<h1 id="titulo">
Dashboard
</h1>

<div class="status">
● Sistema Online
</div>

</div>

<div
id="dashboard"
class="page active"
>

<div class="cards">

<div class="card">
<h3>Produtos</h3>
<strong id="totalProdutos">0</strong>
</div>

<div class="card">
<h3>Posts Criados</h3>
<strong>0</strong>
</div>

<div class="card">
<h3>Mercado Livre</h3>
<strong id="totalMercadoLivre">0</strong>
</div>

<div class="card">
<h3>Shopee</h3>
<strong id="totalShopee">0</strong>
</div>

</div>

<div class="panel">

<h2>
🚀 Central Eletromax V2
</h2>

<p>
Gerencie seus produtos, links e divulgações
em um único painel.
</p>

</div>

</div>

<div
id="produtos"
class="page"
>

<div class="panel">

<h2>
📦 Cadastrar Produto
</h2>

<label>
Nome do produto
</label>

<input
id="produtoNome"
placeholder="Ex: Câmera Dome Hikvision"
>

<label>
Preço
</label>

<input
id="produtoPreco"
placeholder="Ex: R$ 85,49"
>

<label>
Link do produto
</label>

<input
id="produtoLink"
placeholder="Cole o link do produto"
>

<label>
Plataforma
</label>

<select
id="produtoPlataforma"
>

<option>
Mercado Livre
</option>

<option>
Shopee
</option>

</select>

<button
class="primary"
onclick="cadastrarProduto()"
>

Cadastrar Produto

</button>

<p
id="resultadoProduto"
>
</p>

</div>

<div class="panel">

<h2>
📋 Produtos cadastrados
</h2>

<div id="listaProdutos">
Carregando...
</div>

</div>

</div>

<div
id="mercadolivre"
class="page"
>

<div class="panel">

<h2>
🛒 Mercado Livre
</h2>

<div id="listaMercadoLivre">
Carregando...
</div>

</div>

</div>

<div
id="shopee"
class="page"
>

<div class="panel">

<h2>
🛍️ Shopee
</h2>

<div id="listaShopee">
Carregando...
</div>

</div>

</div>

<div
id="posts"
class="page"
>

<div class="panel">

<h2>
📱 Gerador de Posts
</h2>

<input
id="postNome"
placeholder="Nome do produto"
>

<input
id="postPreco"
placeholder="R$ 99,90"
>

<input
id="postLink"
placeholder="Link do produto"
>

<button
class="primary"
onclick="gerarPost()"
>

🤖 Gerar Post

</button>

<br><br>

<textarea
id="postResultado"
placeholder="Seu post aparecerá aqui..."
></textarea>

</div>

</div>

</div>

<script>

function abrirPagina(
  pagina,
  botao
) {

  document
  .querySelectorAll('.page')
  .forEach(
    p =>
    p.classList.remove('active')
  );

  document
  .getElementById(pagina)
  .classList.add('active');

  document
  .querySelectorAll('.menu button')
  .forEach(
    b =>
    b.classList.remove('active')
  );

  if (botao) {
    botao.classList.add('active');
  }

  const titulos = {

    dashboard: 'Dashboard',
    produtos: 'Produtos',
    mercadolivre: 'Mercado Livre',
    shopee: 'Shopee',
    posts: 'Posts'

  };

  document
  .getElementById('titulo')
  .innerText =
    titulos[pagina];

  if (
    pagina === 'produtos'
  ) {
    carregarProdutos();
  }

  if (
    pagina === 'mercadolivre'
  ) {
    carregarPlataforma(
      'Mercado Livre'
    );
  }

  if (
    pagina === 'shopee'
  ) {
    carregarPlataforma(
      'Shopee'
    );
  }

}

/* =========================
   CADASTRAR PRODUTO
========================= */

async function cadastrarProduto() {

  const nome =
    document
    .getElementById('produtoNome')
    .value
    .trim();

  const preco =
    document
    .getElementById('produtoPreco')
    .value
    .trim();

  const link =
    document
    .getElementById('produtoLink')
    .value
    .trim();

  const plataforma =
    document
    .getElementById('produtoPlataforma')
    .value;

  if (!nome || !link) {

    alert(
      'Preencha o nome e o link.'
    );

    return;

  }

  try {

    const resposta =
      await fetch(
        '/api/produtos',
        {

          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              nome,
              preco,
              link,
              plataforma
            })

        }
      );

    const dados =
      await resposta.json();

    if (!resposta.ok) {

      throw new Error(
        dados.message ||
        dados.error ||
        'Erro ao salvar produto.'
      );

    }

    document
    .getElementById(
      'resultadoProduto'
    )
    .innerHTML =
      '✅ Produto salvo com sucesso!';

    document
    .getElementById(
      'produtoNome'
    )
    .value = '';

    document
    .getElementById(
      'produtoPreco'
    )
    .value = '';

    document
    .getElementById(
      'produtoLink'
    )
    .value = '';

    carregarProdutos();
    carregarEstatisticas();

  } catch (erro) {

    alert(
      'Erro ao salvar produto: ' +
      erro.message
    );

  }

}

/* =========================
   CARREGAR PRODUTOS
========================= */

async function carregarProdutos() {

  try {

    const resposta =
      await fetch(
        '/api/produtos'
      );

    const dados =
      await resposta.json();

    const produtos =
      dados.produtos || [];

    const lista =
      document
      .getElementById(
        'listaProdutos'
      );

    if (!produtos.length) {

      lista.innerHTML =
        '<p>Nenhum produto cadastrado.</p>';

      return;

    }

    lista.innerHTML =
      produtos
      .map(
        produto => `

<div class="produto">

<div class="produto-topo">

<div>

<strong>
${produto.nome}
</strong>

<br><br>

<span class="badge">
${produto.plataforma}
</span>

<br><br>

💰
${produto.preco || 'Preço não informado'}

<br><br>

<a
href="${produto.link}"
target="_blank"
>
Abrir produto
</a>

</div>

<button
class="danger"
onclick="excluirProduto(${produto.id})"
>
Excluir
</button>

</div>

</div>

`
      )
      .join('');

  } catch (erro) {

    console.error(
      'Erro ao carregar produtos:',
      erro
    );

  }

}

/* =========================
   EXCLUIR PRODUTO
========================= */

async function excluirProduto(
  id
) {

  if (
    !confirm(
      'Deseja excluir este produto?'
    )
  ) {

    return;

  }

  try {

    const resposta =
      await fetch(
        '/api/produtos/' + id,
        {
          method: 'DELETE'
        }
      );

    const dados =
      await resposta.json();

    if (!resposta.ok) {

      throw new Error(
        dados.message ||
        dados.error ||
        'Erro ao excluir produto.'
      );

    }

    carregarProdutos();
    carregarEstatisticas();

  } catch (erro) {

    alert(
      'Erro: ' +
      erro.message
    );

  }

}

/* =========================
   FILTRAR PLATAFORMA
========================= */

async function carregarPlataforma(
  plataforma
) {

  try {

    const resposta =
      await fetch(
        '/api/produtos'
      );

    const dados =
      await resposta.json();

    const produtos =
      dados.produtos || [];

    const filtrados =
      produtos.filter(
        produto =>
          produto.plataforma ===
          plataforma
      );

    const id =
      plataforma === 'Shopee'
        ? 'listaShopee'
        : 'listaMercadoLivre';

    const lista =
      document
      .getElementById(id);

    if (!filtrados.length) {

      lista.innerHTML =
        '<p>Nenhum produto cadastrado.</p>';

      return;

    }

    lista.innerHTML =
      filtrados
      .map(
        produto => `

<div class="produto">

<strong>
${produto.nome}
</strong>

<br><br>

💰
${produto.preco || 'Preço não informado'}

<br><br>

<a
href="${produto.link}"
target="_blank"
>
Abrir produto
</a>

</div>

`
      )
      .join('');

  } catch (erro) {

    console.error(
      erro
    );

  }

}

/* =========================
   ESTATÍSTICAS
========================= */

async function carregarEstatisticas() {

  try {

    const resposta =
      await fetch(
        '/api/estatisticas'
      );

    const dados =
      await resposta.json();

    document
    .getElementById(
      'totalProdutos'
    )
    .innerText =
      dados.produtos || 0;

    document
    .getElementById(
      'totalMercadoLivre'
    )
    .innerText =
      dados.mercadoLivre || 0;

    document
    .getElementById(
      'totalShopee'
    )
    .innerText =
      dados.shopee || 0;

  } catch (erro) {

    console.error(
      erro
    );

  }

}

/* =========================
   GERAR POST
========================= */

function gerarPost() {

  const nome =
    document
    .getElementById(
      'postNome'
    )
    .value
    .trim();

  const preco =
    document
    .getElementById(
      'postPreco'
    )
    .value
    .trim();

  const link =
    document
    .getElementById(
      'postLink'
    )
    .value
    .trim();

  if (!nome || !link) {

    alert(
      'Preencha o nome e o link.'
    );

    return;

  }

  const texto =
    '🔥 OFERTA IMPERDÍVEL!\\n\\n' +
    '📦 ' + nome + '\\n' +
    '💰 Por apenas ' +
    (preco || 'consulte o preço') +
    '\\n\\n' +
    '🛒 COMPRE AQUI:\\n' +
    link +
    '\\n\\n' +
    '⚡ Eletromax — Ofertas e produtos selecionados!';

  document
  .getElementById(
    'postResultado'
  )
  .value =
    texto;

}

/* =========================
   INICIAR
========================= */

window.addEventListener(
  'load',
  function() {

    carregarEstatisticas();

    carregarProdutos();

  }
);

</script>

</body>

</html>
  `);

});

/* =========================
   INICIAR SERVIDOR
========================= */

async function iniciarServidor() {

  await inicializarBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        'ELETROMAX V2 NOVO CODIGO'
      );

      console.log(
        `Eletromax API rodando na porta ${PORT}`
      );

    }
  );

}

iniciarServidor();
```
