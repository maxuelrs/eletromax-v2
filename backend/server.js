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
// FRONTEND
// Estrutura:
// projeto/
// ├── backend/
// │   └── server.js
// └── frontend/
//     └── index.html
// ======================================================

const frontendPath = path.join(__dirname, '../frontend');

app.use(express.static(frontendPath));

// ======================================================
// POSTGRESQL
// ======================================================

if (!process.env.DATABASE_URL) {
  console.error('⚠️ ERRO: DATABASE_URL não configurada.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: process.env.DATABASE_URL
    ? {
        rejectUnauthorized: false
      }
    : false
});

// ======================================================
// BANCO DE DADOS
// ======================================================

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
        status TEXT DEFAULT 'ativa',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY DEFAULT 1,
        nome_loja TEXT DEFAULT 'Eletromax',
        link_mercadolivre TEXT,
        link_shopee TEXT,
        link_whatsapp TEXT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO configuracoes
      (
        id,
        nome_loja,
        link_mercadolivre,
        link_shopee,
        link_whatsapp
      )
      VALUES
      (
        1,
        'Eletromax',
        'https://meli.la/33A3HdG',
        'https://s.shopee.com.br/6VMYjYBtKZ',
        'https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU?s=cl&p=a&ilr=1'
      )
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('=================================');
    console.log('✅ BANCO DE DADOS CONECTADO');
    console.log('✅ TABELA PRODUTOS PRONTA');
    console.log('✅ TABELA OFERTAS PRONTA');
    console.log('✅ CONFIGURAÇÕES PRONTAS');
    console.log('=================================');

    return true;

  } catch (erro) {

    console.error(
      '❌ ERRO AO INICIALIZAR BANCO:',
      erro.message
    );

    return false;
  }
}

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get('/', (req, res) => {

  res.sendFile(
    path.join(frontendPath, 'index.html')
  );

});

// ======================================================
// STATUS DA API
// ======================================================

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

    console.error(
      'ERRO STATUS:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message: 'Erro na conexão com banco',

      error: erro.message

    });

  }

});

// ======================================================
// DASHBOARD
// ======================================================

app.get('/api/dashboard', async (req, res) => {

  try {

    const produtos =
      await pool.query(
        'SELECT COUNT(*) FROM produtos'
      );

    const ofertas =
      await pool.query(
        "SELECT COUNT(*) FROM ofertas WHERE status = 'ativa'"
      );

    const mercadoLivre =
      await pool.query(
        "SELECT COUNT(*) FROM ofertas WHERE plataforma = 'Mercado Livre' AND status = 'ativa'"
      );

    const shopee =
      await pool.query(
        "SELECT COUNT(*) FROM ofertas WHERE plataforma = 'Shopee' AND status = 'ativa'"
      );

    res.json({

      success: true,

      totalProdutos:
        Number(produtos.rows[0].count),

      totalOfertas:
        Number(ofertas.rows[0].count),

      totalMercadoLivre:
        Number(mercadoLivre.rows[0].count),

      totalShopee:
        Number(shopee.rows[0].count)

    });

  } catch (erro) {

    console.error(
      'ERRO DASHBOARD:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message: 'Erro ao carregar dashboard.',

      error: erro.message

    });

  }

});

// ======================================================
// PRODUTOS
// ======================================================

// SALVAR PRODUTO

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
          preco ? preco.trim() : '',
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

// LISTAR PRODUTOS

app.get('/api/produtos', async (req, res) => {

  try {

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
        erro.message

    });

  }

});

// DELETAR PRODUTO

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
        'Produto excluído com sucesso!'

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

// ======================================================
// CENTRAL DE OFERTAS
// ======================================================

// CADASTRAR OFERTA

app.post('/api/ofertas', async (req, res) => {

  try {

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
          preco || '',
          precoAnterior || '',
          link.trim(),
          plataforma.trim(),
          imagem || '',
          descricao || ''
        ]

      );

    res.status(201).json({

      success: true,

      message:
        'Oferta cadastrada com sucesso!',

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

});

// ======================================================
// LISTAR OFERTAS
// ======================================================

app.get('/api/ofertas', async (req, res) => {

  try {

    const resultado =
      await pool.query(

        `
        SELECT *
        FROM ofertas
        WHERE status = 'ativa'
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
        erro.message

    });

  }

});

// ======================================================
// EXCLUIR OFERTA
// ======================================================

app.delete('/api/ofertas/:id', async (req, res) => {

  try {

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
        'Oferta excluída com sucesso!'

    });

  } catch (erro) {

    console.error(
      'ERRO AO EXCLUIR OFERTA:',
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

});

// ======================================================
// GERAR TEXTO DE OFERTA
// ======================================================

app.post('/api/ofertas/gerar-post', async (req, res) => {

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

    const texto =

`🔥 OFERTA IMPERDÍVEL! 🔥

📦 ${nome}

${precoAnterior ? `❌ De: ${precoAnterior}\n` : ''}💰 ${preco ? `Por apenas: ${preco}` : 'Confira o preço atual!'}

🛒 Plataforma: ${plataforma || 'Oferta'}

👇 COMPRE AQUI:
${link}

⚡ ELETROMAX
🔥 Ofertas selecionadas para você!

⚠️ Preço e disponibilidade podem mudar sem aviso.`;

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
        'Erro ao gerar post.'

    });

  }

});

// ======================================================
// CONFIGURAÇÕES
// ======================================================

// BUSCAR CONFIGURAÇÕES

app.get('/api/configuracoes', async (req, res) => {

  try {

    const resultado =
      await pool.query(

        `
        SELECT *
        FROM configuracoes
        WHERE id = 1
        `

      );

    res.json({

      success: true,

      configuracoes:
        resultado.rows[0] || null

    });

  } catch (erro) {

    console.error(
      'ERRO CONFIGURAÇÕES:',
      erro.message
    );

    res.status(500).json({

      success: false,

      message:
        'Erro ao buscar configurações.'

    });

  }

});

// SALVAR CONFIGURAÇÕES

app.put('/api/configuracoes', async (req, res) => {

  try {

    const {
      nomeLoja,
      linkMercadoLivre,
      linkShopee,
      linkWhatsapp
    } = req.body;

    const resultado =
      await pool.query(

        `
        INSERT INTO configuracoes
        (
          id,
          nome_loja,
          link_mercadolivre,
          link_shopee,
          link_whatsapp,
          atualizado_em
        )
        VALUES
        (
          1,
          $1,
          $2,
          $3,
          $4,
          CURRENT_TIMESTAMP
        )

        ON CONFLICT (id)
        DO UPDATE SET

          nome_loja = EXCLUDED.nome_loja,

          link_mercadolivre =
            EXCLUDED.link_mercadolivre,

          link_shopee =
            EXCLUDED.link_shopee,

          link_whatsapp =
            EXCLUDED.link_whatsapp,

          atualizado_em =
            CURRENT_TIMESTAMP

        RETURNING *
        `,

        [
          nomeLoja || 'Eletromax',
          linkMercadoLivre || '',
          linkShopee || '',
          linkWhatsapp || ''
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

});

// ======================================================
// ROTA FINAL PARA FRONTEND
// ======================================================

app.get('*', (req, res) => {

  if (
    req.path.startsWith('/api/')
  ) {

    return res.status(404).json({

      success: false,

      message:
        'API não encontrada.'

    });

  }

  res.sendFile(
    path.join(frontendPath, 'index.html')
  );

});

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
        '================================='
      );

    }
  );

}

iniciarServidor();
