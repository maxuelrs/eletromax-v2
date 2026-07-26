const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURAÇÕES
// =====================================================

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// =====================================================
// FRONTEND
// =====================================================

const publicPath = path.join(__dirname, '../public');

app.use(express.static(publicPath));

// =====================================================
// POSTGRESQL
// =====================================================

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  console.error('⚠️ DATABASE_URL não configurada.');
}

// =====================================================
// BANCO DE DADOS
// =====================================================

async function inicializarBanco() {
  if (!pool) {
    console.log('⚠️ Banco não configurado.');
    return false;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco TEXT DEFAULT '',
        link TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ BANCO DE DADOS CONECTADO');
    console.log('✅ TABELA PRODUTOS PRONTA');

    return true;

  } catch (erro) {
    console.error(
      '❌ ERRO AO INICIALIZAR BANCO:',
      erro.message
    );

    return false;
  }
}

// =====================================================
// PÁGINA PRINCIPAL
// =====================================================

app.get('/', (req, res) => {
  res.sendFile(
    path.join(publicPath, 'index.html')
  );
});

// =====================================================
// STATUS DA API
// =====================================================

app.get('/api/status', async (req, res) => {

  let banco = 'disconnected';

  try {

    if (pool) {
      await pool.query('SELECT NOW()');
      banco = 'connected';
    }

    res.json({
      success: true,
      status: 'online',
      database: banco,
      message: 'Eletromax V2 funcionando!'
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      status: 'online',
      database: 'disconnected',
      message: 'Servidor online, mas banco indisponível.',
      error: erro.message
    });

  }

});

// =====================================================
// LISTAR PRODUTOS
// =====================================================

app.get('/api/produtos', async (req, res) => {

  if (!pool) {
    return res.status(500).json({
      success: false,
      message: 'Banco de dados não configurado.'
    });
  }

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

// =====================================================
// CADASTRAR PRODUTO
// =====================================================

app.post('/api/produtos', async (req, res) => {

  if (!pool) {
    return res.status(500).json({
      success: false,
      message: 'Banco de dados não configurado.'
    });
  }

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
        String(nome).trim(),
        preco ? String(preco).trim() : '',
        String(link).trim(),
        String(plataforma).trim()
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

// =====================================================
// DELETAR PRODUTO
// =====================================================

app.delete('/api/produtos/:id', async (req, res) => {

  if (!pool) {
    return res.status(500).json({
      success: false,
      message: 'Banco de dados não configurado.'
    });
  }

  try {

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {

      return res.status(400).json({
        success: false,
        message: 'ID inválido.'
      });

    }

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
      message: 'Oferta excluída com sucesso!',
      produto: resultado.rows[0]
    });

  } catch (erro) {

    console.error(
      'ERRO AO DELETAR PRODUTO:',
      erro.message
    );

    res.status(500).json({
      success: false,
      message: 'Erro ao excluir oferta.',
      error: erro.message
    });

  }

});

// =====================================================
// ROTA PARA FILTRAR PLATAFORMA
// =====================================================

app.get('/api/produtos/:plataforma', async (req, res) => {

  if (!pool) {
    return res.status(500).json({
      success: false,
      message: 'Banco de dados não configurado.'
    });
  }

  try {

    const plataforma = req.params.plataforma;

    const resultado = await pool.query(
      `
      SELECT *
      FROM produtos
      WHERE plataforma = $1
      ORDER BY id DESC
      `,
      [plataforma]
    );

    res.json({
      success: true,
      produtos: resultado.rows
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: 'Erro ao filtrar produtos.',
      error: erro.message
    });

  }

});

// =====================================================
// INICIALIZAÇÃO
// =====================================================

async function iniciarServidor() {

  await inicializarBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log('');
      console.log('=================================');
      console.log('⚡ ELETROMAX V2 ONLINE');
      console.log('=================================');
      console.log('🌐 Porta:', PORT);
      console.log('📦 Sistema de ofertas ativo');
      console.log('🛒 Mercado Livre integrado ao painel');
      console.log('🛍️ Shopee integrada ao painel');
      console.log('📱 Gerador de posts ativo');
      console.log('=================================');
      console.log('');

    }
  );

}

iniciarServidor();
