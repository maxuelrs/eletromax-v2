const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURAÇÕES
// ===============================

app.use(cors());
app.use(express.json());

// ===============================
// FRONTEND
// ===============================

const publicPath = path.join(__dirname, '../public');

app.use(express.static(publicPath));

// ===============================
// BANCO POSTGRESQL
// ===============================

if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada no Render.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

// ===============================
// CONFIGURAÇÃO ELETROMAX
// ===============================

const CONFIG = {
  mercadoLivre:
    'https://meli.la/33A3HdG',

  shopee:
    'https://s.shopee.com.br/6VMYjYBtKZ',

  whatsapp:
    'https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU?s=cl&p=a&ilr=1'
};

// ===============================
// BANCO DE DADOS
// ===============================

async function inicializarBanco() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco TEXT,
        preco_anterior TEXT,
        link TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        imagem TEXT,
        descricao TEXT,
        aprovado BOOLEAN DEFAULT FALSE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('BANCO POSTGRESQL CONECTADO');
    console.log('TABELA PRODUTOS PRONTA');

    return true;

  } catch (erro) {

    console.error(
      'ERRO AO INICIALIZAR BANCO:',
      erro.message
    );

    return false;
  }
}

// ===============================
// PÁGINA PRINCIPAL
// ===============================

app.get('/', (req, res) => {

  res.sendFile(
    path.join(publicPath, 'index.html')
  );

});

// ===============================
// CONFIGURAÇÕES DA LOJA
// ===============================

app.get('/api/config', (req, res) => {

  res.json({
    success: true,
    config: CONFIG
  });

});

// ===============================
// STATUS
// ===============================

app.get('/api/status', async (req, res) => {

  try {

    await pool.query('SELECT NOW()');

    res.json({
      success: true,
      status: 'online',
      database: 'connected',
      message: 'Eletromax V2.1 funcionando!'
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      status: 'error',
      database: 'disconnected',
      message: erro.message
    });

  }

});

// ===============================
// LISTAR PRODUTOS
// ===============================

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

    console.error(
      'ERRO AO LISTAR PRODUTOS:',
      erro.message
    );

    res.status(500).json({
      success: false,
      message: 'Erro ao buscar produtos.',
      error: erro.message
    });

  }

});

// ===============================
// CADASTRAR PRODUTO
// ===============================

app.post('/api/produtos', async (req, res) => {

  try {

    const {
      nome,
      preco,
      preco_anterior,
      link,
      plataforma,
      imagem,
      descricao
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
      (
        nome,
        preco,
        preco_anterior,
        link,
        plataforma,
        imagem,
        descricao
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        nome.trim(),
        preco ? preco.trim() : '',
        preco_anterior
          ? preco_anterior.trim()
          : '',
        link.trim(),
        plataforma.trim(),
        imagem
          ? imagem.trim()
          : '',
        descricao
          ? descricao.trim()
          : ''
      ]
    );

    res.status(201).json({

      success: true,

      message:
        'Produto cadastrado com sucesso!',

      produto:
        resultado.rows[0]

    });

  } catch (erro) {

    console.error(
      'ERRO AO CADASTRAR PRODUTO:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message:
        'Erro ao cadastrar produto.',

      error:
        erro.message

    });

  }

});

// ===============================
// APROVAR PRODUTO
// ===============================

app.put('/api/produtos/:id/aprovar', async (req, res) => {

  try {

    const { id } = req.params;

    const resultado = await pool.query(
      `
      UPDATE produtos
      SET aprovado = NOT aprovado
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (!resultado.rows.length) {

      return res.status(404).json({

        success: false,

        message:
          'Produto não encontrado.'

      });

    }

    res.json({

      success: true,

      produto:
        resultado.rows[0]

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message:
        'Erro ao aprovar produto.',

      error:
        erro.message

    });

  }

});

// ===============================
// EXCLUIR PRODUTO
// ===============================

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

    if (!resultado.rows.length) {

      return res.status(404).json({

        success: false,

        message:
          'Produto não encontrado.'

      });

    }

    res.json({

      success: true,

      message:
        'Produto excluído com sucesso!'

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message:
        'Erro ao excluir produto.',

      error:
        erro.message

    });

  }

});

// ===============================
// GERAR POST
// ===============================

app.post('/api/gerar-post', (req, res) => {

  try {

    const {
      nome,
      preco,
      preco_anterior,
      link,
      plataforma
    } = req.body;

    if (!nome || !link) {

      return res.status(400).json({

        success: false,

        message:
          'Nome e link são obrigatórios.'

      });

    }

    let chamada =
      plataforma === 'Shopee'
        ? '🛍️ OFERTA NA SHOPEE!'
        : '🛒 OFERTA NO MERCADO LIVRE!';

    let texto =

`${chamada}

🔥 ${nome}

💰 Por apenas: ${preco || 'Confira o preço'}

${preco_anterior
  ? `🏷️ De: ${preco_anterior}`
  : ''}

🔗 COMPRE AQUI:
${link}

⚡ Eletromax
Ofertas e produtos selecionados!

📲 Entre no nosso grupo de ofertas:
${CONFIG.whatsapp}`;

    res.json({

      success: true,

      post:
        texto

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message:
        'Erro ao gerar post.',

      error:
        erro.message

    });

  }

});

// ===============================
// BUSCAR OFERTAS
// ===============================
//
// Esta rota prepara a central de ofertas.
// A busca real automática via APIs de afiliados
// será conectada posteriormente.
//

app.get('/api/ofertas', async (req, res) => {

  try {

    const resultado = await pool.query(`
      SELECT *
      FROM produtos
      ORDER BY id DESC
      LIMIT 50
    `);

    res.json({

      success: true,

      ofertas:
        resultado.rows,

      message:
        'Ofertas disponíveis no banco Eletromax.'

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message:
        'Erro ao buscar ofertas.',

      error:
        erro.message

    });

  }

});

// ===============================
// INICIAR SERVIDOR
// ===============================

async function iniciarServidor() {

  await inicializarBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        '===================================='
      );

      console.log(
        '⚡ ELETROMAX V2.1 ONLINE'
      );

      console.log(
        '🤖 CENTRAL DE OFERTAS ATIVA'
      );

      console.log(
        '🛒 MERCADO LIVRE CONFIGURADO'
      );

      console.log(
        '🛍️ SHOPEE CONFIGURADA'
      );

      console.log(
        '📱 WHATSAPP CONFIGURADO'
      );

      console.log(
        '🌐 PORTA:',
        PORT
      );

      console.log(
        '===================================='
      );

    }
  );

}

iniciarServidor();
