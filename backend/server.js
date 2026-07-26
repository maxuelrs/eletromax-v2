const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

app.use(cors());
app.use(express.json());

// ==========================================
// CAMINHO DO FRONTEND
// ==========================================

// IMPORTANTE:
// O index.html está dentro da pasta frontend

const frontendPath = path.join(__dirname, '../frontend');

console.log('Pasta frontend:', frontendPath);

// Servir arquivos estáticos
app.use(express.static(frontendPath));

// ==========================================
// POSTGRESQL
// ==========================================

if (!process.env.DATABASE_URL) {

  console.error(
    'ERRO: DATABASE_URL não foi configurada no Render.'
  );

}

const pool = new Pool({

  connectionString:
    process.env.DATABASE_URL,

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

        criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP

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

  res.sendFile(

    path.join(
      frontendPath,
      'index.html'
    ),

    (erro) => {

      if (erro) {

        console.error(
          'ERRO: index.html não foi encontrado.'
        );

        console.error(
          'Caminho procurado:',
          path.join(
            frontendPath,
            'index.html'
          )
        );

        res.status(404).send(
          'ERRO: index.html não foi encontrado.'
        );

      }

    }

  );

});

// ==========================================
// API STATUS
// ==========================================

app.get(
  '/api/status',
  async (req, res) => {

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

  }
);

// ==========================================
// LISTAR PRODUTOS
// ==========================================

app.get(
  '/api/produtos',
  async (req, res) => {

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

  }
);

// ==========================================
// SALVAR PRODUTO
// ==========================================

app.post(
  '/api/produtos',
  async (req, res) => {

    try {

      const {

        nome,

        preco,

        link,

        plataforma

      } = req.body;

      // Validar dados

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

      // Inserir produto

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
          ($1, $2, $3, $4)

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

  }
);

// ==========================================
// DELETAR PRODUTO
// ==========================================

app.delete(

  '/api/produtos/:id',

  async (req, res) => {

    try {

      const { id } =
        req.params;

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

// ==========================================
// ROTA 404 DA API
// ==========================================

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({

      success: false,

      message:
        'Rota da API não encontrada.'

    });

  }
);

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
        '📦 FRONTEND: /frontend'
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
