const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURAÇÕES
// ======================================================

app.use(cors());
app.use(express.json());

// ======================================================
// CAMINHO DO FRONTEND
// Estrutura:
// backend/server.js
// frontend/index.html
// ======================================================

const frontendPath = path.join(
  __dirname,
  '../frontend'
);

// Servir arquivos do frontend
app.use(
  express.static(frontendPath)
);

// ======================================================
// POSTGRESQL
// ======================================================

let pool = null;

if (process.env.DATABASE_URL) {

  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL,

    ssl: {
      rejectUnauthorized: false
    }
  });

} else {

  console.error(
    'ERRO: DATABASE_URL não foi configurada.'
  );

}

// ======================================================
// INICIALIZAR BANCO
// ======================================================

async function inicializarBanco() {

  if (!pool) {

    console.error(
      'Banco não inicializado: DATABASE_URL ausente.'
    );

    return false;

  }

  try {

    // Tabela de produtos
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

    // Tabela de ofertas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ofertas (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco TEXT,
        preco_anterior TEXT,
        link TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        imagem TEXT,
        descricao TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de configurações
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        id SERIAL PRIMARY KEY,
        nome_loja TEXT,
        link_mercadolivre TEXT,
        link_shopee TEXT,
        link_whatsapp TEXT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar configuração inicial
    const config =
      await pool.query(
        'SELECT id FROM configuracoes LIMIT 1'
      );

    if (config.rows.length === 0) {

      await pool.query(
        `
        INSERT INTO configuracoes
        (
          nome_loja,
          link_mercadolivre,
          link_shopee,
          link_whatsapp
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          'Eletromax',
          'https://meli.la/33A3HdG',
          'https://s.shopee.com.br/6VMYjYBtKZ',
          'https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU?s=cl&p=a&ilr=1'
        ]
      );

    }

    console.log(
      '================================='
    );

    console.log(
      'BANCO DE DADOS CONECTADO'
    );

    console.log(
      'TABELA PRODUTOS PRONTA'
    );

    console.log(
      'TABELA OFERTAS PRONTA'
    );

    console.log(
      'TABELA CONFIGURAÇÕES PRONTA'
    );

    console.log(
      '================================='
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

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get(
  '/',
  (req, res) => {

    res.sendFile(
      path.join(
        frontendPath,
        'index.html'
      )
    );

  }
);

// ======================================================
// STATUS DA API
// ======================================================

app.get(
  '/api/status',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'DATABASE_URL não configurada.',

          status:
            'offline',

          database:
            'disconnected'

        });

      }

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
          'Erro na conexão com banco.',

        status:
          'offline',

        database:
          'disconnected',

        error:
          erro.message

      });

    }

  }
);

// ======================================================
// DASHBOARD
// ======================================================

app.get(
  '/api/dashboard',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

        });

      }

      const produtos =
        await pool.query(
          'SELECT COUNT(*) FROM produtos'
        );

      const ofertas =
        await pool.query(
          'SELECT COUNT(*) FROM ofertas'
        );

      const mercadoLivre =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM produtos
          WHERE plataforma = 'Mercado Livre'
          `
        );

      const shopee =
        await pool.query(
          `
          SELECT COUNT(*)
          FROM produtos
          WHERE plataforma = 'Shopee'
          `
        );

      res.json({

        success: true,

        totalProdutos:
          Number(
            produtos.rows[0].count
          ),

        totalOfertas:
          Number(
            ofertas.rows[0].count
          ),

        totalMercadoLivre:
          Number(
            mercadoLivre.rows[0].count
          ),

        totalShopee:
          Number(
            shopee.rows[0].count
          )

      });

    } catch (erro) {

      console.error(
        'ERRO DASHBOARD:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao carregar dashboard.',

        error:
          erro.message

      });

    }

  }
);

// ======================================================
// PRODUTOS - CADASTRAR
// ======================================================

app.post(
  '/api/produtos',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

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
            nome.trim(),
            preco
              ? String(preco).trim()
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

// ======================================================
// PRODUTOS - LISTAR
// ======================================================

app.get(
  '/api/produtos',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.',

          produtos: []

        });

      }

      const resultado =
        await pool.query(
          `
          SELECT *
          FROM produtos
          ORDER BY id DESC
          `
        );

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
          erro.message,

        produtos: []

      });

    }

  }
);

// ======================================================
// PRODUTOS - DELETAR
// ======================================================

app.delete(
  '/api/produtos/:id',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

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

// ======================================================
// OFERTAS - CADASTRAR
// ======================================================

app.post(
  '/api/ofertas',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

        });

      }

      const {
        nome,
        preco,
        precoAnterior,
        link,
        plataforma,
        imagem,
        descricao
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
          INSERT INTO ofertas
          (
            nome,
            preco,
            preco_anterior,
            link,
            plataforma,
            imagem,
            descricao
          )
          VALUES
          ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
          `,
          [
            nome.trim(),

            preco
              ? String(preco).trim()
              : '',

            precoAnterior
              ? String(precoAnterior).trim()
              : '',

            link.trim(),

            plataforma.trim(),

            imagem
              ? String(imagem).trim()
              : '',

            descricao
              ? String(descricao).trim()
              : ''
          ]
        );

      res.status(201).json({

        success: true,

        message:
          'Oferta salva com sucesso!',

        oferta:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        'ERRO AO SALVAR OFERTA:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao salvar oferta.',

        error:
          erro.message

      });

    }

  }
);

// ======================================================
// OFERTAS - LISTAR
// ======================================================

app.get(
  '/api/ofertas',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.',

          ofertas: []

        });

      }

      const resultado =
        await pool.query(
          `
          SELECT *
          FROM ofertas
          ORDER BY id DESC
          `
        );

      res.json({

        success: true,

        ofertas:
          resultado.rows

      });

    } catch (erro) {

      console.error(
        'ERRO AO BUSCAR OFERTAS:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao buscar ofertas.',

        error:
          erro.message,

        ofertas: []

      });

    }

  }
);

// ======================================================
// OFERTAS - DELETAR
// ======================================================

app.delete(
  '/api/ofertas/:id',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

        });

      }

      const {
        id
      } = req.params;

      const resultado =
        await pool.query(
          `
          DELETE FROM ofertas
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
            'Oferta não encontrada.'

        });

      }

      res.json({

        success: true,

        message:
          'Oferta excluída com sucesso!',

        oferta:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        'ERRO AO DELETAR OFERTA:',
        erro.message
      );

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

// ======================================================
// GERAR POST
// ======================================================

app.post(
  '/api/ofertas/gerar-post',
  async (req, res) => {

    try {

      const {
        nome,
        preco,
        precoAnterior,
        link,
        plataforma
      } = req.body;

      if (
        !nome ||
        !link
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Nome e link são obrigatórios.'

        });

      }

      const texto = `🔥 OFERTA IMPERDÍVEL! 🔥

📦 ${nome}

${
  precoAnterior
  ?
  `❌ De: ${precoAnterior}
`
  :
  ''
}💰 POR APENAS: ${preco || 'CONSULTE O PREÇO'}!

🛒 Plataforma: ${plataforma || 'Oferta'}

🔗 COMPRE AQUI:
${link}

⚡ Aproveite enquanto durar o estoque!

📲 Eletromax | Ofertas e oportunidades todos os dias`;

      res.json({

        success: true,

        texto

      });

    } catch (erro) {

      console.error(
        'ERRO AO GERAR POST:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao gerar post.',

        error:
          erro.message

      });

    }

  }
);

// ======================================================
// CONFIGURAÇÕES - BUSCAR
// ======================================================

app.get(
  '/api/configuracoes',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

        });

      }

      const resultado =
        await pool.query(
          `
          SELECT *
          FROM configuracoes
          ORDER BY id ASC
          LIMIT 1
          `
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.json({

          success: true,

          configuracoes: {

            nome_loja:
              'Eletromax',

            link_mercadolivre:
              'https://meli.la/33A3HdG',

            link_shopee:
              'https://s.shopee.com.br/6VMYjYBtKZ',

            link_whatsapp:
              'https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU?s=cl&p=a&ilr=1'

          }

        });

      }

      res.json({

        success: true,

        configuracoes:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        'ERRO CONFIGURAÇÕES:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao carregar configurações.',

        error:
          erro.message

      });

    }

  }
);

// ======================================================
// CONFIGURAÇÕES - SALVAR
// ======================================================

app.put(
  '/api/configuracoes',
  async (req, res) => {

    try {

      if (!pool) {

        return res.status(500).json({

          success: false,

          message:
            'Banco de dados não conectado.'

        });

      }

      const {
        nomeLoja,
        linkMercadoLivre,
        linkShopee,
        linkWhatsapp
      } = req.body;

      const resultado =
        await pool.query(
          `
          UPDATE configuracoes
          SET
            nome_loja = $1,
            link_mercadolivre = $2,
            link_shopee = $3,
            link_whatsapp = $4,
            atualizado_em = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT id
            FROM configuracoes
            ORDER BY id ASC
            LIMIT 1
          )
          RETURNING *
          `,
          [
            nomeLoja ||
              'Eletromax',

            linkMercadoLivre ||
              '',

            linkShopee ||
              '',

            linkWhatsapp ||
              ''
          ]
        );

      res.json({

        success: true,

        message:
          'Configurações salvas com sucesso!',

        configuracoes:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        'ERRO AO SALVAR CONFIGURAÇÕES:',
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          'Erro ao salvar configurações.',

        error:
          erro.message

      });

    }

  }
);

// ======================================================
// ROTA PARA ERROS DE API
// IMPORTANTE:
// NÃO USAR app.get('*') NO EXPRESS 5
// ======================================================

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({

      success: false,

      message:
        'Endpoint da API não encontrado.'

    });

  }
);

// ======================================================
// INICIAR SERVIDOR
// ======================================================

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
        '🚀 ELETROMAX V2.1 INICIADO'
      );

      console.log(
        '🔥 CENTRAL DE OFERTAS ATIVA'
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
        '📂 FRONTEND:',
        frontendPath
      );

      console.log(
        '================================='
      );

    }
  );

}

iniciarServidor();
