const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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

      );

    `);

    await pool.query(`

      CREATE TABLE IF NOT EXISTS ofertas (

        id SERIAL PRIMARY KEY,

        nome TEXT NOT NULL,

        preco TEXT,

        preco_anterior TEXT,

        imagem TEXT,

        link TEXT,

        plataforma TEXT,

        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

      );

    `);

    await pool.query(`

      CREATE TABLE IF NOT EXISTS configuracoes (

        id SERIAL PRIMARY KEY,

        nome_loja TEXT DEFAULT 'Eletromax',

        link_mercadolivre TEXT,

        link_shopee TEXT,

        link_whatsapp TEXT

      );

    `);

    const existe = await pool.query(
      "SELECT id FROM configuracoes LIMIT 1"
    );

    if (existe.rows.length === 0) {

      await pool.query(

        `INSERT INTO configuracoes
        (nome_loja)
        VALUES ('Eletromax')`

      );

    }

    console.log("✅ PostgreSQL conectado");
    console.log("✅ Banco inicializado");

  } catch (erro) {

    console.error(
      "Erro ao iniciar banco:",
      erro.message
    );

  }

} 
```javascript
// ==========================================
// STATUS DA API
// ==========================================

app.get("/api/status", async (req, res) => {

  try {

    await pool.query("SELECT NOW()");

    res.json({

      success: true,

      status: "online",

      database: "connected",

      mercadolivre: process.env.ML_CLIENT_ID
        ? "configured"
        : "not_configured"

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      database: "disconnected",

      message: erro.message

    });

  }

});

// ==========================================
// DASHBOARD
// ==========================================

app.get("/api/dashboard", async (req, res) => {

  try {

    const produtos =
      await pool.query(
        "SELECT COUNT(*) total FROM produtos"
      );

    const ofertas =
      await pool.query(
        "SELECT COUNT(*) total FROM ofertas"
      );

    const ml =
      await pool.query(
        "SELECT COUNT(*) total FROM produtos WHERE plataforma='Mercado Livre'"
      );

    const shopee =
      await pool.query(
        "SELECT COUNT(*) total FROM produtos WHERE plataforma='Shopee'"
      );

    res.json({

      totalProdutos:
        Number(produtos.rows[0].total),

      totalOfertas:
        Number(ofertas.rows[0].total),

      totalMercadoLivre:
        Number(ml.rows[0].total),

      totalShopee:
        Number(shopee.rows[0].total)

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message: erro.message

    });

  }

});

// ==========================================
// LISTAR PRODUTOS
// ==========================================

app.get("/api/produtos", async (req, res) => {

  try {

    const resultado =
      await pool.query(

        "SELECT * FROM produtos ORDER BY id DESC"

      );

    res.json({

      success: true,

      produtos: resultado.rows

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message: erro.message

    });

  }

});

// ==========================================
// CADASTRAR PRODUTO
// ==========================================

app.post("/api/produtos", async (req, res) => {

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

        message: "Dados obrigatórios não informados."

      });

    }

    const resultado =
      await pool.query(

        `INSERT INTO produtos
        (nome,preco,link,plataforma)
        VALUES ($1,$2,$3,$4)
        RETURNING *`,

        [

          nome,

          preco,

          link,

          plataforma

        ]

      );

    res.status(201).json({

      success: true,

      produto:
        resultado.rows[0]

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message: erro.message

    });
    

  }

});
// ==========================================
// MERCADO LIVRE (BÁSICO)
// ==========================================

app.get("/api/mercadolivre/status", (req, res) => {

  res.json({

    conectado: !!process.env.ML_CLIENT_ID

  });

});

app.get("/api/mercadolivre/login", (req, res) => {

  res.json({

    success: false,

    message:
      "Configure o OAuth do Mercado Livre."

  });

});

app.get("/api/mercadolivre/buscar", async (req, res) => {

  res.json({

    success: true,

    produtos: []

  });

});

app.post("/api/mercadolivre/buscar-salvar", async (req, res) => {

  res.json({

    success: true,

    encontrados: 0,

    salvos: 0,

    duplicados: 0

  });

});

// ==========================================
// GERADOR DE POSTS
// ==========================================

app.post("/api/ofertas/gerar-post", (req, res) => {

  const {

    nome,

    preco,

    precoAnterior,

    plataforma,

    link

  } = req.body;

  const texto =
`🔥 OFERTA IMPERDÍVEL!

📦 ${nome}

${precoAnterior ? "💸 De: " + precoAnterior + "\n" : ""}💰 Por: ${preco}

🛒 ${plataforma}

🔗 ${link}

⚡ Eletromax`;

  res.json({

    success: true,

    texto

  });

});

// ==========================================
// LINKS
// ==========================================

app.get("/api/links", async (req, res) => {

  try {

    const resultado =
      await pool.query(

        "SELECT * FROM configuracoes LIMIT 1"

      );

    const cfg =
      resultado.rows[0] || {};

    res.json({

      whatsapp:
        cfg.link_whatsapp,

      shopee:
        cfg.link_shopee,

      mercadolivre:
        cfg.link_mercadolivre

    });

  } catch (erro) {

    res.status(500).json({

      success: false,

      message: erro.message

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

    "0.0.0.0",

    () => {

      console.log("========================");

      console.log("ELETROMAX V2 ONLINE");

      console.log("PORTA:", PORT);

      console.log("========================");

    }

  );

}

iniciarServidor();
