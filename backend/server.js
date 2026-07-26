const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// CONFIGURAÇÕES
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// CAMINHO DO FRONTEND
// ========================================

const frontendPath = path.join(__dirname, '../frontend');

console.log('Caminho do frontend:', frontendPath);

// Servir arquivos estáticos do frontend
app.use(express.static(frontendPath));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(
    path.join(frontendPath, 'index.html'),
    (erro) => {
      if (erro) {
        console.error(
          'ERRO AO CARREGAR INDEX.HTML:',
          erro.message
        );

        res.status(500).send(
          'Erro: index.html não foi encontrado.'
        );
      }
    }
  );
});

// ========================================
// POSTGRESQL
// ========================================

let pool = null;

if (process.env.DATABASE_URL) {

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  console.log(
    'DATABASE_URL encontrada.'
  );

} else {

  console.error(
    'ERRO: DATABASE_URL não foi configurada no Render.'
  );

}

// ========================================
// FUNÇÃO PARA VERIFICAR BANCO
// ========================================

async function verificarBanco() {

  if (!pool) {
    return false;
  }

  try {

    await pool.query(
      'SELECT NOW()'
    );

    return true;

  } catch (erro) {

    console.error(
      'ERRO DE CONEXÃO COM POSTGRESQL:',
      erro.message
    );

    return false;
  }
}

// ========================================
// CRIAR TABELA
// ========================================

async function inicializarBanco() {

  if (!pool) {

    console.error(
      'Banco não inicializado porque DATABASE_URL não existe.'
    );

    return;
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

    console.log(
      'BANCO DE DADOS CONECTADO'
    );

    console.log(
      'TABELA PRODUTOS PRONTA'
    );

  } catch (erro) {

    console.error(
      'ERRO AO CRIAR TABELA:',
      erro.message
    );

  }
}

// ========================================
// API STATUS
// ========================================

app.get(
  '/api/status',
  async (req, res) => {

    try {

      const bancoOnline =
        await verificarBanco();

      res.json({

        success: true,

        status: 'online',

        database:
          bancoOnline
            ? 'connected'
            : 'disconnected',

        message:
          'Eletromax V2 API funcionando!'

      });

    } catch (erro) {

      console.error(
        'ERRO STATUS:',
        erro.message
      );

      res.status(500).json({

        success: false,

        status: 'offline',

        database: 'error',

        message:
          'Erro ao verificar sistema.',

        error:
          erro.message

      });

    }

  }
);

// ========================================
// LISTAR PRODUTOS
// ========================================

app.get(
  '/api/produtos',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não configurado.'

        });

      }

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

  }
);

// ========================================
// CADASTRAR PRODUTO
// ========================================

app.post(
  '/api/produtos',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não configurado.'

        });

      }

      const {
        nome,
        preco,
        link,
        plataforma
      } = req.body;

      // Validação

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

      // Salvar produto

      const resultado =
        await pool.query(

          `
          INSERT INTO produtos
          (
            nome,
            preco,
            link,
            plataforma
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4
          )
          RETURNING *
          `,

          [
            String(nome).trim(),

            preco
              ? String(preco).trim()
              : '',

            String(link).trim(),

            String(plataforma).trim()
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

  }
);

// ========================================
// DELETAR PRODUTO
// ========================================

app.delete(
  '/api/produtos/:id',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não configurado.'

        });

      }

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

  }
);

// ========================================
// ROTA DE TESTE
// ========================================

app.get(
  '/api/teste',
  (req, res) => {

    res.json({

      success: true,

      message:
        'Eletromax V2 funcionando corretamente!',

      frontend:
        frontendPath,

      servidor:
        'online'

    });

  }
);

// ========================================
// TRATAMENTO DE ERROS
// ========================================

app.use(
  (err, req, res, next) => {

    console.error(
      'ERRO INTERNO:',
      err
    );

    res.status(500).json({

      success: false,

      message:
        'Erro interno do servidor.'

    });

  }
);

// ========================================
// INICIAR SERVIDOR
// ========================================

async function iniciarServidor() {

  console.log(
    '================================='
  );

  console.log(
    'INICIANDO ELETROMAX V2'
  );

  console.log(
    '================================='
  );

  console.log(
    'PORTA:',
    PORT
  );

  console.log(
    'FRONTEND:',
    frontendPath
  );

  await inicializarBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        '================================='
      );

      console.log(
        'ELETROMAX V2 ONLINE'
      );

      console.log(
        'SERVIDOR INICIADO COM SUCESSO'
      );

      console.log(
        'PORTA:',
        PORT
      );

      console.log(
        '================================='
      );

    }
  );

}

// ========================================
// EXECUTAR
// ========================================

iniciarServidor();
