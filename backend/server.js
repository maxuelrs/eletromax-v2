const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
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
}

.panel h2 {
  margin-top: 0;
}

.platforms {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.platform {
  padding: 25px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.platform button {
  border: none;
  background: #2563eb;
  color: white;
  padding: 10px 18px;
  border-radius: 7px;
  cursor: pointer;
}

input, select {
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
}

.page {
  display: none;
}

.page.active {
  display: block;
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

  .platforms {
    grid-template-columns: 1fr;
  }

}

</style>
</head>

<body>

<div class="sidebar">

<div class="logo">⚡ Eletromax</div>

<div class="menu">

<button class="active" onclick="abrirPagina('dashboard', this)">
🏠 Dashboard
</button>

<button onclick="abrirPagina('produtos', this)">
📦 Produtos
</button>

<button onclick="abrirPagina('mercadolivre', this)">
🛒 Mercado Livre
</button>

<button onclick="abrirPagina('shopee', this)">
🛍️ Shopee
</button>

<button onclick="abrirPagina('posts', this)">
📱 Posts
</button>

<button onclick="abrirPagina('configuracoes', this)">
⚙️ Configurações
</button>

</div>

</div>


<div class="main">

<div class="header">

<h1 id="titulo">Dashboard</h1>

<div class="status">
● Sistema Online
</div>

</div>


<!-- DASHBOARD -->

<div id="dashboard" class="page active">

<div class="cards">

<div class="card">
<h3>Produtos</h3>
<strong>0</strong>
</div>

<div class="card">
<h3>Posts Criados</h3>
<strong>0</strong>
</div>

<div class="card">
<h3>Mercado Livre</h3>
<strong>0</strong>
</div>

<div class="card">
<h3>Shopee</h3>
<strong>0</strong>
</div>

</div>


<div class="panel">

<h2>🚀 Central Eletromax V2</h2>

<p>
Gerencie seus produtos, links e divulgações
em um único painel.
</p>

<div class="platforms">

<div class="platform">

<h3>🛒 Mercado Livre</h3>

<p>
Cadastre seus produtos e links de afiliado.
</p>

<button onclick="abrirPagina('mercadolivre')">
Acessar
</button>

</div>


<div class="platform">

<h3>🛍️ Shopee</h3>

<p>
Gerencie produtos e links da Shopee.
</p>

<button onclick="abrirPagina('shopee')">
Acessar
</button>

</div>

</div>

</div>

</div>


<!-- PRODUTOS -->

<div id="produtos" class="page">

<div class="panel">

<h2>📦 Cadastrar Produto</h2>

<label>Nome do produto</label>

<input id="produtoNome" placeholder="Ex: Câmera Dome Hikvision">

<label>Preço</label>

<input id="produtoPreco" placeholder="Ex: R$ 85,49">

<label>Link do produto</label>

<input id="produtoLink" placeholder="Cole o link do Mercado Livre ou Shopee">

<label>Plataforma</label>

<select id="produtoPlataforma">

<option>Mercado Livre</option>

<option>Shopee</option>

</select>

<button class="primary" onclick="cadastrarProduto()">
Cadastrar Produto
</button>

<p id="resultadoProduto"></p>

</div>

</div>


<!-- MERCADO LIVRE -->

<div id="mercadolivre" class="page">

<div class="panel">

<h2>🛒 Mercado Livre</h2>

<p>
Área preparada para integração com Mercado Livre.
</p>

<input placeholder="Cole aqui o link do produto">

<button class="primary">
Adicionar Produto
</button>

</div>

</div>


<!-- SHOPEE -->

<div id="shopee" class="page">

<div class="panel">

<h2>🛍️ Shopee</h2>

<p>
Área preparada para integração com Shopee.
</p>

<input placeholder="Cole aqui o link do produto">

<button class="primary">
Adicionar Produto
</button>

</div>

</div>


<!-- POSTS -->

<div id="posts" class="page">

<div class="panel">

<h2>📱 Gerador de Posts</h2>

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
style="width:100%;height:180px;padding:15px;border:1px solid #ddd;border-radius:8px;"
placeholder="Seu post aparecerá aqui..."
></textarea>

</div>

</div>


<!-- CONFIGURAÇÕES -->

<div id="configuracoes" class="page">

<div class="panel">

<h2>⚙️ Configurações</h2>

<p>
Configurações do sistema Eletromax V2.
</p>

<label>Nome da loja</label>

<input value="Eletromax">

<button class="primary">
Salvar Configurações
</button>

</div>

</div>

</div>


<script>

function abrirPagina(pagina, botao) {

document.querySelectorAll('.page').forEach(function(p) {
p.classList.remove('active');
});

document.getElementById(pagina).classList.add('active');

document.querySelectorAll('.menu button').forEach(function(b) {
b.classList.remove('active');
});

if(botao) {
botao.classList.add('active');
}

let titulos = {
dashboard: 'Dashboard',
produtos: 'Produtos',
mercadolivre: 'Mercado Livre',
shopee: 'Shopee',
posts: 'Posts',
configuracoes: 'Configurações'
};

document.getElementById('titulo').innerText = titulos[pagina];

}


function cadastrarProduto() {

let nome = document.getElementById('produtoNome').value;

let preco = document.getElementById('produtoPreco').value;

let link = document.getElementById('produtoLink').value;

if(!nome || !link) {

alert('Preencha o nome e o link do produto.');

return;

}

document.getElementById('resultadoProduto').innerHTML =
'✅ Produto <b>' + nome + '</b> cadastrado com sucesso!';

}


function gerarPost() {

let nome = document.getElementById('postNome').value;

let preco = document.getElementById('postPreco').value;

let link = document.getElementById('postLink').value;

if(!nome || !link) {

alert('Preencha o nome e o link.');

return;

}

let texto =
'🔥 OFERTA IMPERDÍVEL!\\n\\n' +
'📦 ' + nome + '\\n' +
'💰 Por apenas ' + preco + '\\n\\n' +
'🛒 COMPRE AQUI:\\n' +
link + '\\n\\n' +
'⚡ Eletromax — Ofertas e produtos selecionados!';

document.getElementById('postResultado').value = texto;

}

</script>

</body>
</html>
  `);
});


app.get('/api/status', (req, res) => {

  res.json({
    success: true,
    message: 'Eletromax API funcionando!',
    status: 'online'
  });

});


app.listen(PORT, '0.0.0.0', () => {

  console.log(
    `Eletromax API rodando na porta ${PORT}`
  );

});
