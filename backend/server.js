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
// FRONTEND
// ========================================

const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));

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
// CONFIGURAÇÃO POSTGRESQL
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
    'ERRO: DATABASE_URL não configurada.'
  );

}

// ========================================
// BANCO DE DADOS
// ========================================

async function inicializarBanco() {

  if (!pool) {
    console.error(
      'Banco não inicializado.'
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
// TABELA DE OFERTAS
// ========================================

async function inicializarOfertas() {

  if (!pool) return;

  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ofertas (
        id SERIAL PRIMARY KEY,
        produto TEXT NOT NULL,
        preco_antigo TEXT DEFAULT '',
        preco_oferta TEXT NOT NULL,
        desconto TEXT DEFAULT '',
        link TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        texto_post TEXT DEFAULT '',
        status TEXT DEFAULT 'pendente',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log(
      'TABELA OFERTAS PRONTA'
    );

  } catch (erro) {

    console.error(
      'ERRO AO CRIAR TABELA OFERTAS:',
      erro.message
    );

  }

}

// ========================================
// STATUS
// ========================================

app.get(
  '/api/status',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({
          success: false,
          status: 'offline',
          database: 'not_configured'
        });

      }

      await pool.query(
        'SELECT NOW()'
      );

      res.json({

        success: true,

        status: 'online',

        database: 'connected',

        message:
          'Eletromax V2 funcionando!'

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

        status: 'offline',

        database: 'error',

        error:
          erro.message

      });

    }

  }
);

// ========================================
// PRODUTOS
// ========================================

app.get(
  '/api/produtos',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({
          success: false,
          message:
            'Banco não configurado.'
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
            'Banco não configurado.'
        });

      }

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
            'Banco não configurado.'
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

  }
);

// ========================================
// OFERTAS
// ========================================

// Listar ofertas

app.get(
  '/api/ofertas',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({
          success: false,
          message:
            'Banco não configurado.'
        });

      }

      const resultado =
        await pool.query(`
          SELECT *
          FROM ofertas
          ORDER BY id DESC
        `);

      res.json({

        success: true,

        ofertas:
          resultado.rows

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

  }
);

// ========================================
// CRIAR OFERTA
// ========================================

app.post(
  '/api/ofertas',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({
          success: false,
          message:
            'Banco não configurado.'
        });

      }

      const {
        produto,
        precoAntigo,
        precoOferta,
        desconto,
        link,
        plataforma
      } = req.body;

      if (
        !produto ||
        !precoOferta ||
        !link ||
        !plataforma
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Preencha produto, preço da oferta, link e plataforma.'

        });

      }

      const textoPost = `
🔥 OFERTA IMPERDÍVEL!

📦 ${produto}

${precoAntigo
  ? `💰 De: ${precoAntigo}`
  : ''
}

🚨 POR APENAS: ${precoOferta}

${desconto
  ? `📉 ${desconto} DE DESCONTO`
  : ''
}

🛒 COMPRE AQUI:
${link}

⚡ ELETROMAX
Ofertas e produtos selecionados!

📲 Entre no nosso grupo:
https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU
      `.trim();

      const resultado =
        await pool.query(

          `
          INSERT INTO ofertas
          (
            produto,
            preco_antigo,
            preco_oferta,
            desconto,
            link,
            plataforma,
            texto_post
          )
          VALUES
          ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
          `,

          [
            produto.trim(),

            precoAntigo
              ? precoAntigo.trim()
              : '',

            precoOferta.trim(),

            desconto
              ? desconto.trim()
              : '',

            link.trim(),

            plataforma.trim(),

            textoPost
          ]

        );

      res.status(201).json({

        success: true,

        message:
          'Oferta criada com sucesso!',

        oferta:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        'ERRO AO CRIAR OFERTA:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao criar oferta.',

        error:
          erro.message

      });

    }

  }
);

// ========================================
// DELETAR OFERTA
// ========================================

app.delete(
  '/api/ofertas/:id',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({
          success: false,
          message:
            'Banco não configurado.'
        });

      }

      const {
        id
      } = req.params;

      await pool.query(
        `
        DELETE FROM ofertas
        WHERE id = $1
        `,
        [id]
      );

      res.json({

        success: true,

        message:
          'Oferta excluída com sucesso!'

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

        message:
          'Erro ao excluir oferta.',

        error:
          erro.message

      });

    }

  }
);

// ========================================
// INICIALIZAÇÃO
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

  await inicializarBanco();

  await inicializarOfertas();

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
        'PORTA:',
        PORT
      );

      console.log(
        'FRONTEND:',
        frontendPath
      );

      console.log(
        '================================='
      );

    }
  );

}

iniciarServidor();
