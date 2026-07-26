const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================
   FRONTEND
========================= */

const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));

/* =========================
   POSTGRESQL
========================= */

if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   BANCO
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
   CONFIGURAÇÕES
========================= */

const CONFIG = {
  mercadoLivre:
    'https://meli.la/33A3HdG',

  shopee:
    'https://s.shopee.com.br/6VMYjYBtKZ',

  whatsapp:
    'https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU?s=cl&p=a&ilr=1'
};

/* =========================
   STATUS
========================= */

app.get('/api/status', async (req, res) => {
  try {

    await pool.query('SELECT NOW()');

    res.json({
      success: true,
      status: 'online',
      database: 'connected',
      message: 'Eletromax V2 funcionando!'
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      status: 'online',
      database: 'error',
      error: erro.message
    });

  }
});

/* =========================
   CONFIGURAÇÕES API
========================= */

app.get('/api/config', (req, res) => {

  res.json({
    success: true,
    config: CONFIG
  });

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

    console.error(
      'ERRO AO BUSCAR PRODUTOS:',
      erro.message
    );

    res.status(500).json({
      success: false,
      message: 'Erro ao buscar produtos.',
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
        nome.trim(),
        preco ? preco.trim() : '',
        link.trim(),
        plataforma.trim()
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Oferta cadastrada com sucesso!',
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
   DELETAR PRODUTO
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
        message: 'Oferta não encontrada.'
      });

    }

    res.json({
      success: true,
      message: 'Oferta excluída!',
      produto: resultado.rows[0]
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: 'Erro ao excluir oferta.',
      error: erro.message
    });

  }

});

/* =========================
   FRONTEND
========================= */

app.get('*', (req, res) => {

  res.sendFile(
    path.join(frontendPath, 'index.html')
  );

});

/* =========================
   INICIAR
========================= */

async function iniciarServidor() {

  await inicializarBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        '================================='
      );

      console.log(
        '⚡ ELETROMAX V2 ONLINE'
      );

      console.log(
        '📦 BANCO POSTGRESQL ATIVO'
      );

      console.log(
        '🌐 PORTA:',
        PORT
      );

      console.log(
        '================================='
      );

    }
  );

}

iniciarServidor();
