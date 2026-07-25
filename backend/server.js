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

async function inicializarBanco() {
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS produtos (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, preco TEXT, link TEXT NOT NULL, plataforma TEXT NOT NULL, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
    );

    console.log('BANCO DE DADOS CONECTADO');
    console.log('TABELA PRODUTOS PRONTA');

  } catch (erro) {
    console.error('ERRO AO INICIALIZAR BANCO:', erro.message);
  }
}

app.get('/', (req, res) => {
  res.send('Eletromax V2 funcionando!');
});

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
      message: 'Erro na conexão com banco',
      error: erro.message
    });
  }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const { nome, preco, link, plataforma } = req.body;

    if (!nome || !link || !plataforma) {
      return res.status(400).json({
        success: false,
        message: 'Nome, link e plataforma são obrigatórios.'
      });
    }

    const resultado = await pool.query(
      'INSERT INTO produtos (nome, preco, link, plataforma) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, preco || '', link, plataforma]
    );

    res.status(201).json({
      success: true,
      message: 'Produto salvo com sucesso!',
      produto: resultado.rows[0]
    });

  } catch (erro) {
    console.error('ERRO AO SALVAR:', erro.message);

    res.status(500).json({
      success: false,
      message: 'Erro ao salvar produto.',
      error: erro.message
    });
  }
});

app.get('/api/produtos', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT * FROM produtos ORDER BY id DESC'
    );

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

async function iniciarServidor() {
  await inicializarBanco();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('ELETROMAX V2 NOVO CODIGO');
    console.log(`Eletromax API rodando na porta ${PORT}`);
  });
}

iniciarServidor();
