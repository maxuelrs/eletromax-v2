const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

app.use(cors());
app.use(express.json());

// ==========================================
// LOCALIZAR O INDEX.HTML
// Aceita public/index.html ou frontend/index.html
// ==========================================

const publicPath = path.join(__dirname, '../public');
const frontendPath = path.join(__dirname, '../frontend');

let frontendFolder;

if (fs.existsSync(path.join(publicPath, 'index.html'))) {
  frontendFolder = publicPath;
  console.log('FRONTEND ENCONTRADO EM: public');

} else if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
  frontendFolder = frontendPath;
  console.log('FRONTEND ENCONTRADO EM: frontend');

} else {
  console.error('ERRO: index.html não foi encontrado.');
  console.error('Crie uma pasta public ou frontend na raiz do projeto.');
}

// ==========================================
// ARQUIVOS DO FRONTEND
// ==========================================

if (frontendFolder) {
  app.use(express.static(frontendFolder));
}

// ==========================================
// POSTGRESQL
// ==========================================

if (!process.env.DATABASE_URL) {
  console.error(
    'ATENÇÃO: DATABASE_URL não foi configurada.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ==========================================
// BANCO DE DADOS
// ==========================================

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

    console.log(
      'BANCO DE DADOS CONECTADO'
    );

    console.log(
      'TABELA PRODUTOS PRONTA'
    );

    return true;

  } catch (erro) {

    console.error(
      'ERRO AO INICIALIZAR BANCO:',
      erro.message
    );

    return false;
  }
}

// ==========================================
// PÁGINA PRINCIPAL
// ==========================================

app.get('/', (req, res) => {

  if (!frontendFolder) {

    return res.status(500).send(`
      <h1>Eletromax V2</h1>
      <p>Erro: index.html não foi encontrado.</p>
      <p>Crie uma pasta <b>public</b> ou <b>frontend</b> e coloque o index.html dentro dela.</p>
    `);

  }

  res.sendFile(
    path.join(frontendFolder, 'index.html')
  );

});

// ==========================================
// STATUS DA API
// ==========================================

app.get('/api/status', async (req, res) => {

  try {

    await pool.query(
      'SELECT NOW()'
    );

    res.json({

      success: true,

      message:
        'Eletromax API funcionando!',

      status:
        'online',

      database:
        'connected'

    });

  } catch (erro) {

    console.error(
      'ERRO STATUS:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message:
        'Erro na conexão com banco',

      error:
        erro.message

    });

  }

});

// ==========================================
// LISTAR PRODUTOS
// ==========================================

app.get('/api/produtos', async (req, res) => {

  try {

    const resultado =
      await pool.query(`
        SELECT *
        FROM produtos
        ORDER BY id DESC
      `);

    res.json({

      success: true,

      produtos:
        resultado.rows

    });

  } catch (erro) {

    console.error(
      'ERRO AO BUSCAR PRODUTOS:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message:
        'Erro ao buscar produtos.',

      error:
        erro.message

    });

  }

});

// ==========================================
// SALVAR PRODUTO
// ==========================================

app.post('/api/produtos', async (req, res) => {

  try {

    const {
      nome,
      preco,
      link,
      plataforma
    } = req.body;

    if (
      !nome ||
      !link ||
      !plataforma
    ) {

      return res.status(400).json({

        success: false,

        message:
          'Nome, link e plataforma são obrigatórios.'

      });

    }

    const resultado =
      await pool.query(
        `
        INSERT INTO produtos
        (nome, preco, link, plataforma)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [
          nome.trim(),
          preco
            ? preco.trim()
            : '',
          link.trim(),
          plataforma.trim()
        ]
      );

    res.status(201).json({

      success: true,

      message:
        'Produto salvo com sucesso!',

      produto:
        resultado.rows[0]

    });

  } catch (erro) {

    console.error(
      'ERRO AO SALVAR PRODUTO:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message:
        'Erro ao salvar produto.',

      error:
        erro.message

    });

  }

});

// ==========================================
// DELETAR PRODUTO
// ==========================================

app.delete('/api/produtos/:id', async (req, res) => {

  try {

    const {
      id
    } = req.params;

    const resultado =
      await pool.query(
        `
        DELETE FROM produtos
        WHERE id = $1
        RETURNING *
        `,
        [id]
      );

    if (
      resultado.rows.length === 0
    ) {

      return res.status(404).json({

        success: false,

        message:
          'Produto não encontrado.'

      });

    }

    res.json({

      success: true,

      message:
        'Produto excluído com sucesso!',

      produto:
        resultado.rows[0]

    });

  } catch (erro) {

    console.error(
      'ERRO AO DELETAR PRODUTO:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message:
        'Erro ao excluir produto.',

      error:
        erro.message

    });

  }

});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

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
        '⚡ ELETROMAX V2 INICIADO'
      );

      console.log(
        '🗄️ POSTGRESQL ATIVO'
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
