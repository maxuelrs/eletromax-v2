const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: {
rejectUnauthorized: false
}
});

// =========================
// BANCO DE DADOS
// =========================

async function inicializarBanco() {
try {
await pool.query(
'CREATE TABLE IF NOT EXISTS produtos (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, preco TEXT, link TEXT NOT NULL, plataforma TEXT NOT NULL, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
);

```
console.log('BANCO DE DADOS CONECTADO');
console.log('TABELA PRODUTOS PRONTA');

return true;
```

} catch (erro) {
console.error('ERRO AO INICIALIZAR BANCO:', erro.message);
return false;
}
}

// =========================
// PAINEL PRINCIPAL
// =========================

app.get('/', (req, res) => {
const html = String.raw`<!DOCTYPE html>

<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
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

.header h1 {
  margin: 0;
}

.status {
  background: #dcfce7;
  color: #166534;
  padding: 9px 15px;
  border-radius: 20px;
  font-size: 14px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 30px;
}

.card {
  background: white;
  padding: 22px;
  border-radius: 15px;
  box-shadow: 0 4px 15px rgba(0,0,0,.06);
}

.card h3 {
  margin-top: 0;
  color: #6b7280;
  font-size: 14px;
}

.card strong {
  font-size: 28px;
}

.panel {
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 15px rgba(0,0,0,.06);
  margin-bottom: 20px;
}

.panel h2 {
  margin-top: 0;
}

input,
select,
textarea {
  width: 100%;
  padding: 12px;
  margin: 8px 0 15px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
}

.primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 15px;
}

.primary:hover {
  background: #1d4ed8;
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
  margin-top: 12px;
  border-radius: 10px;
  background: #fafafa;
}

.produto h3 {
  margin-top: 0;
}

.produto a {
  color: #2563eb;
  word-break: break-all;
}

.mensagem {
  margin-top: 15px;
  font-weight: bold;
}

@media (max-width: 800px) {
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
}
</style>

</head>

<body>

<div class="sidebar">
  <div class="logo">⚡ Eletromax</div>

  <div class="menu">
    <button class="active" onclick="abrirPagina('dashboard', this)">🏠 Dashboard</button>
    <button onclick="abrirPagina('produtos', this)">📦 Produtos</button>
    <button onclick="abrirPagina('mercadolivre', this)">🛒 Mercado Livre</button>
    <button onclick="abrirPagina('shopee', this)">🛍️ Shopee</button>
    <button onclick="abrirPagina('posts', this)">📱 Posts</button>
    <button onclick="abrirPagina('configuracoes', this)">⚙️ Configurações</button>
  </div>
</div>

<div class="main">

  <div class="header">
    <h1 id="titulo">Dashboard</h1>
    <div class="status">● Sistema Online</div>
  </div>

  <div id="dashboard" class="page active">

```
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
  <h2>🚀 Central Eletromax V2</h2>
  <p>Gerencie seus produtos, links e divulgações em um único painel.</p>
  <p>Banco de dados: <strong>PostgreSQL conectado</strong></p>
</div>
```

  </div>

  <div id="produtos" class="page">

```
<div class="panel">
  <h2>📦 Cadastrar Produto</h2>

  <label>Nome do produto</label>
  <input id="produtoNome" placeholder="Ex: Câmera Dome Hikvision">

  <label>Preço</label>
  <input id="produtoPreco" placeholder="Ex: R$ 85,49">

  <label>Link do produto</label>
  <input id="produtoLink" placeholder="Cole o link do produto">

  <label>Plataforma</label>
  <select id="produtoPlataforma">
    <option value="Mercado Livre">Mercado Livre</option>
    <option value="Shopee">Shopee</option>
  </select>

  <button class="primary" onclick="cadastrarProduto()">
    Cadastrar Produto
  </button>

  <div id="resultadoProduto" class="mensagem"></div>
</div>

<div class="panel">
  <h2>📋 Produtos cadastrados</h2>
  <div id="listaProdutos">Carregando produtos...</div>
</div>
```

  </div>

  <div id="mercadolivre" class="page">
    <div class="panel">
      <h2>🛒 Mercado Livre</h2>
      <p>Produtos cadastrados no Mercado Livre.</p>
      <div id="listaMercadoLivre">Carregando...</div>
    </div>
  </div>

  <div id="shopee" class="page">
    <div class="panel">
      <h2>🛍️ Shopee</h2>
      <p>Produtos cadastrados na Shopee.</p>
      <div id="listaShopee">Carregando...</div>
    </div>
  </div>

  <div id="posts" class="page">
    <div class="panel">
      <h2>📱 Gerador de Posts</h2>

```
  <label>Nome do produto</label>
  <input id="postNome" placeholder="Nome do produto">

  <label>Preço</label>
  <input id="postPreco" placeholder="R$ 99,90">

  <label>Link</label>
  <input id="postLink" placeholder="Link do produto">

  <button class="primary" onclick="gerarPost()">
    🤖 Gerar Post
  </button>

  <br><br>

  <textarea
    id="postResultado"
    style="height:180px"
    placeholder="Seu post aparecerá aqui..."
  ></textarea>
</div>
```

  </div>

  <div id="configuracoes" class="page">
    <div class="panel">
      <h2>⚙️ Configurações</h2>
      <p>Configurações do sistema Eletromax V2.</p>

```
  <label>Nome da loja</label>
  <input id="nomeLoja" value="Eletromax">

  <button class="primary" onclick="salvarConfiguracoes()">
    Salvar Configurações
  </button>

  <div id="resultadoConfiguracoes" class="mensagem"></div>
</div>
```

  </div>

</div>

<script>
function abrirPagina(pagina, botao) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });

  const paginaSelecionada = document.getElementById(pagina);

  if (paginaSelecionada) {
    paginaSelecionada.classList.add('active');
  }

  document.querySelectorAll('.menu button').forEach(function(b) {
    b.classList.remove('active');
  });

  if (botao) {
    botao.classList.add('active');
  }

  const titulos = {
    dashboard: 'Dashboard',
    produtos: 'Produtos',
    mercadolivre: 'Mercado Livre',
    shopee: 'Shopee',
    posts: 'Posts',
    configuracoes: 'Configurações'
  };

  document.getElementById('titulo').innerText =
    titulos[pagina] || 'Eletromax V2';

  if (pagina === 'produtos') {
    carregarProdutos();
  }

  if (pagina === 'mercadolivre') {
    carregarProdutosPlataforma('Mercado Livre');
  }

  if (pagina === 'shopee') {
    carregarProdutosPlataforma('Shopee');
  }
}

async function cadastrarProduto() {
  const nome = document.getElementById('produtoNome').value.trim();
  const preco = document.getElementById('produtoPreco').value.trim();
  const link = document.getElementById('produtoLink').value.trim();
  const plataforma = document.getElementById('produtoPlataforma').value;
  const resultado = document.getElementById('resultadoProduto');

  if (!nome || !link) {
    resultado.innerText = '❌ Preencha o nome e o link do produto.';
    return;
  }

  resultado.innerText = '⏳ Salvando produto...';

  try {
    const resposta = await fetch('/api/produtos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome,
        preco,
        link,
        plataforma
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok || !dados.success) {
      throw new Error(
        dados.message || 'Erro ao salvar produto'
      );
    }

    resultado.innerText = '✅ Produto salvo com sucesso!';

    document.getElementById('produtoNome').value = '';
    document.getElementById('produtoPreco').value = '';
    document.getElementById('produtoLink').value = '';

    await carregarProdutos();
    await atualizarDashboard();

  } catch (erro) {
    console.error(erro);

    resultado.innerText =
      '❌ Erro ao salvar: ' + erro.message;
  }
}

async function carregarProdutos() {
  const lista = document.getElementById('listaProdutos');

  if (!lista) {
    return;
  }

  lista.innerHTML = '⏳ Carregando...';

  try {
    const resposta = await fetch('/api/produtos');
    const dados = await resposta.json();

    if (!resposta.ok || !dados.success) {
      throw new Error(
        dados.message || 'Erro ao buscar produtos'
      );
    }

    if (!dados.produtos || !dados.produtos.length) {
      lista.innerHTML =
        '📦 Nenhum produto cadastrado ainda.';
      return;
    }

    lista.innerHTML = dados.produtos.map(function(produto) {
      return '<div class="produto">' +
        '<h3>📦 ' + escaparHTML(produto.nome) + '</h3>' +
        '<p>💰 ' +
          escaparHTML(produto.preco || 'Preço não informado') +
        '</p>' +
        '<p>🏷️ ' +
          escaparHTML(produto.plataforma) +
        '</p>' +
        '<p><a href="' +
          escaparAtributo(produto.link) +
          '" target="_blank" rel="noopener noreferrer">' +
          '🔗 Abrir produto' +
        '</a></p>' +
      '</div>';
    }).join('');

  } catch (erro) {
    console.error(erro);

    lista.innerHTML =
      '❌ Erro ao carregar produtos: ' +
      escaparHTML(erro.message);
  }
}

async function carregarProdutosPlataforma(plataforma) {
  const elemento =
    plataforma === 'Mercado Livre'
      ? document.getElementById('listaMercadoLivre')
      : document.getElementById('listaShopee');

  if (!elemento) {
    return;
  }

  elemento.innerHTML = '⏳ Carregando...';

  try {
    const resposta = await fetch('/api/produtos');
    const dados = await resposta.json();

    if (!resposta.ok || !dados.success) {
      throw new Error(
        dados.message || 'Erro ao buscar produtos'
      );
    }

    const produtos = (dados.produtos || []).filter(function(produto) {
      return produto.plataforma === plataforma;
    });

    if (!produtos.length) {
      elemento.innerHTML =
        '📦 Nenhum produto cadastrado nesta plataforma.';
      return;
    }

    elemento.innerHTML = produtos.map(function(produto) {
      return '<div class="produto">' +
        '<h3>' +
          escaparHTML(produto.nome) +
        '</h3>' +
        '<p>💰 ' +
          escaparHTML(produto.preco || 'Preço não informado') +
        '</p>' +
        '<p><a href="' +
          escaparAtributo(produto.link) +
          '" target="_blank" rel="noopener noreferrer">' +
          '🔗 Abrir produto' +
        '</a></p>' +
      '</div>';
    }).join('');

  } catch (erro) {
    console.error(erro);

    elemento.innerHTML =
      '❌ Erro ao carregar produtos: ' +
      escaparHTML(erro.message);
  }
}

async function atualizarDashboard() {
  try {
    const resposta = await fetch('/api/produtos');
    const dados = await resposta.json();

    if (!resposta.ok || !dados.success) {
      return;
    }

    const produtos = dados.produtos || [];

    document.getElementById('totalProdutos').innerText =
      produtos.length;

    document.getElementById('totalMercadoLivre').innerText =
      produtos.filter(function(p) {
        return p.plataforma === 'Mercado Livre';
      }).length;

    document.getElementById('totalShopee').innerText =
      produtos.filter(function(p) {
        return p.plataforma === 'Shopee';
      }).length;

  } catch (erro) {
    console.error(
      'Erro ao atualizar dashboard:',
      erro
    );
  }
}

function gerarPost() {
  const nome =
    document.getElementById('postNome').value.trim();

  const preco =
    document.getElementById('postPreco').value.trim();

  const link =
    document.getElementById('postLink').value.trim();

  if (!nome || !link) {
    alert('Preencha o nome e o link.');
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

  document.getElementById('postResultado').value = texto;
}

function salvarConfiguracoes() {
  const nome =
    document.getElementById('nomeLoja').value.trim();

  document.getElementById('resultadoConfiguracoes').innerText =
    nome
      ? '✅ Configurações salvas!'
      : '❌ Informe o nome da loja.';
}

function escaparHTML(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escaparAtributo(texto) {
  return escaparHTML(texto);
}

window.addEventListener('DOMContentLoaded', function() {
  atualizarDashboard();
});
</script>

</body>
</html>`;

res.type('html').send(html);
});

// =========================
// API STATUS
// =========================

app.get('/api/status', async (req, res) => {
try {
await pool.query('SELECT NOW()');

```
res.json({
  success: true,
  message: 'Eletromax API funcionando!',
  status: 'online',
  database: 'connected'
});
```

} catch (erro) {
console.error('ERRO STATUS:', erro.message);

```
res.status(500).json({
  success: false,
  message: 'Erro na conexão com banco',
  error: erro.message
});
```

}
});

// =========================
// SALVAR PRODUTO
// =========================

app.post('/api/produtos', async (req, res) => {
try {
const {
nome,
preco,
link,
plataforma
} = req.body;

```
if (!nome || !link || !plataforma) {
  return res.status(400).json({
    success: false,
    message: 'Nome, link e plataforma são obrigatórios.'
  });
}

const resultado = await pool.query(
  'INSERT INTO produtos (nome, preco, link, plataforma) VALUES ($1, $2, $3, $4) RETURNING *',
  [
    nome,
    preco || '',
    link,
    plataforma
  ]
);

res.status(201).json({
  success: true,
  message: 'Produto salvo com sucesso!',
  produto: resultado.rows[0]
});
```

} catch (erro) {
console.error(
'ERRO AO SALVAR PRODUTO:',
erro.message
);

```
res.status(500).json({
  success: false,
  message: 'Erro ao salvar produto.',
  error: erro.message
});
```

}
});

// =========================
// LISTAR PRODUTOS
// =========================

app.get('/api/produtos', async (req, res) => {
try {
const resultado = await pool.query(
'SELECT * FROM produtos ORDER BY id DESC'
);

```
res.json({
  success: true,
  produtos: resultado.rows
});
```

} catch (erro) {
console.error(
'ERRO AO BUSCAR PRODUTOS:',
erro.message
);

```
res.status(500).json({
  success: false,
  message: 'Erro ao buscar produtos.',
  error: erro.message
});
```

}
});

// =========================
// INICIAR SERVIDOR
// =========================

async function iniciarServidor() {
const bancoOK = await inicializarBanco();

if (!bancoOK) {
console.error(
'ATENÇÃO: O banco apresentou erro.'
);
}

app.listen(PORT, '0.0.0.0', function() {
console.log('=================================');
console.log('ELETROMAX V2 INICIADO');
console.log('BANCO POSTGRESQL ATIVO');
console.log('PORTA:', PORT);
console.log('=================================');
});
}

iniciarServidor();
