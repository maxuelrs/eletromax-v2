
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

const PORT =
  process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

// ==========================================
// POSTGRESQL
// ==========================================

const pool = new Pool({

  connectionString:
    process.env.DATABASE_URL,

  ssl:
    process.env.DATABASE_URL
      ? {
          rejectUnauthorized: false
        }
      : false

});

// ==========================================
// INICIALIZAR BANCO
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ofertas (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco TEXT,
        preco_anterior TEXT,
        link TEXT NOT NULL,
        plataforma TEXT NOT NULL,
        imagem TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY,
        nome_loja TEXT DEFAULT 'Eletromax',
        link_mercadolivre TEXT DEFAULT '',
        link_shopee TEXT DEFAULT '',
        link_whatsapp TEXT DEFAULT '',
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO configuracoes
      (
        id,
        nome_loja
      )
      VALUES
      (
        1,
        'Eletromax'
      )
      ON CONFLICT (id)
      DO NOTHING
    `);

    console.log(
      "================================="
    );

    console.log(
      "BANCO DE DADOS CONECTADO"
    );

    console.log(
      "TABELA PRODUTOS PRONTA"
    );

    console.log(
      "TABELA OFERTAS PRONTA"
    );

    console.log(
      "TABELA CONFIGURACOES PRONTA"
    );

    console.log(
      "================================="
    );

    return true;

  } catch (erro) {

    console.error(
      "ERRO AO INICIALIZAR BANCO:",
      erro.message
    );

    return false;

  }

}

// ==========================================
// STATUS DO SISTEMA
// ==========================================

app.get(
  "/api/status",
  async (req, res) => {

    try {

      await pool.query(
        "SELECT NOW()"
      );

      res.json({

        success: true,

        status: "online",

        database: "connected",

        mercadolivre:
          process.env.ML_CLIENT_ID
            ? "configured"
            : "not_configured"

      });

    } catch (erro) {

      console.error(
        "ERRO STATUS:",
        erro.message
      );

      res.status(500).json({

        success: false,

        status: "offline",

        database: "disconnected",

        message:
          erro.message

      });

    }

  }
);

// ==========================================
// DASHBOARD
// ==========================================

app.get(
  "/api/dashboard",
  async (req, res) => {

    try {

      const produtos =
        await pool.query(
          "SELECT COUNT(*)::int AS total FROM produtos"
        );

      const ofertas =
        await pool.query(
          "SELECT COUNT(*)::int AS total FROM ofertas"
        );

      const mercadoLivre =
        await pool.query(
          `SELECT COUNT(*)::int AS total
           FROM produtos
           WHERE plataforma = $1`,
          [
            "Mercado Livre"
          ]
        );

      const shopee =
        await pool.query(
          `SELECT COUNT(*)::int AS total
           FROM produtos
           WHERE plataforma = $1`,
          [
            "Shopee"
          ]
        );

      res.json({

        success: true,

        totalProdutos:
          produtos.rows[0].total,

        totalOfertas:
          ofertas.rows[0].total,

        totalMercadoLivre:
          mercadoLivre.rows[0].total,

        totalShopee:
          shopee.rows[0].total

      });

    } catch (erro) {

      console.error(
        "ERRO DASHBOARD:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          erro.message

      });

    }

  }
);

// ==========================================
// LISTAR PRODUTOS
// ==========================================

app.get(
  "/api/produtos",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `SELECT
             id,
             nome,
             preco,
             link,
             plataforma,
             criado_em
           FROM produtos
           ORDER BY id DESC`
        );

      res.json({

        success: true,

        produtos:
          resultado.rows

      });

    } catch (erro) {

      console.error(
        "ERRO AO BUSCAR PRODUTOS:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar produtos."

      });

    }

  }
);

// ==========================================
// CADASTRAR PRODUTO
// ==========================================

app.post(
  "/api/produtos",
  async (req, res) => {

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
            "Nome, link e plataforma são obrigatórios."

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
          (
            $1,
            $2,
            $3,
            $4
          )
          RETURNING *
          `,
          [

            nome.trim(),

            preco
              ? String(preco).trim()
              : "",

            link.trim(),

            plataforma.trim()

          ]
        );

      res.status(201).json({

        success: true,

        message:
          "Produto salvo com sucesso!",

        produto:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR PRODUTO:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao salvar produto.",

        error:
          erro.message

      });

    }

  }
);

// ==========================================
// EXCLUIR PRODUTO
// ==========================================

app.delete(
  "/api/produtos/:id",
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "ID do produto inválido."

        });

      }

      const resultado =
        await pool.query(
          `
          DELETE FROM produtos
          WHERE id = $1
          RETURNING id
          `,
          [
            id
          ]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(404).json({

          success: false,

          message:
            "Produto não encontrado."

        });

      }

      res.json({

        success: true,

        message:
          "Produto excluído com sucesso."

      });

    } catch (erro) {

      console.error(
        "ERRO AO EXCLUIR PRODUTO:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao excluir produto."

      });

    }

  }
);

// ==========================================
// LISTAR OFERTAS
// ==========================================

app.get(
  "/api/ofertas",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome,
            preco,
            preco_anterior AS "precoAnterior",
            link,
            plataforma,
            imagem,
            criado_em
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
        "ERRO AO BUSCAR OFERTAS:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar ofertas."

      });

    }

  }
);

// ==========================================
// CONFIGURAÇÕES - BUSCAR
// ==========================================

app.get(
  "/api/configuracoes",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome_loja,
            link_mercadolivre,
            link_shopee,
            link_whatsapp
          FROM configuracoes
          WHERE id = 1
          LIMIT 1
          `
        );

      res.json({

        success: true,

        configuracoes:
          resultado.rows[0] || {}

      });

    } catch (erro) {

      console.error(
        "ERRO CONFIGURACOES:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao carregar configurações."

      });

    }

  }
);

// ==========================================
// CONFIGURAÇÕES - SALVAR
// ==========================================

app.put(
  "/api/configuracoes",
  async (req, res) => {

    try {

      const {

        nomeLoja,

        linkMercadoLivre,

        linkShopee,

        linkWhatsapp

      } = req.body;

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
        `,
        [

          nomeLoja || "Eletromax",

          linkMercadoLivre || "",

          linkShopee || "",

          linkWhatsapp || ""

        ]
      );

      res.json({

        success: true,

        message:
          "Configurações salvas com sucesso."

      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR CONFIGURACOES:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao salvar configurações."

      });

    }

  }
);

// ==========================================
// LINKS
// ==========================================

app.get(
  "/api/links",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            link_mercadolivre,
            link_shopee,
            link_whatsapp
          FROM configuracoes
          WHERE id = 1
          LIMIT 1
          `
        );

      const config =
        resultado.rows[0] || {};

      res.json({

        success: true,

        whatsapp:
          config.link_whatsapp || "",

        shopee:
          config.link_shopee || "",

        mercadolivre:
          config.link_mercadolivre || ""

      });

    } catch (erro) {

      console.error(
        "ERRO AO BUSCAR LINKS:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar links."

      });

    }

  }
);

// ==========================================
// GERAR POST
// ==========================================

app.post(
  "/api/ofertas/gerar-post",
  (req, res) => {

    try {

      const {

        nome,

        preco,

        precoAnterior,

        plataforma,

        link

      } = req.body;

      if (!nome) {

        return res.status(400).json({

          success: false,

          message:
            "Nome do produto é obrigatório."

        });

      }

      const texto =
`🔥 OFERTA IMPERDÍVEL!

📦 ${nome}

${
  precoAnterior
    ? "💸 De: " +
      precoAnterior +
      "\n"
    : ""
}💰 Por: ${
  preco ||
  "Consulte o preço"
}

🏷️ Plataforma: ${
  plataforma ||
  "Oferta Eletromax"
}

🛒 COMPRE AQUI:
${
  link ||
  "Link não informado"
}

⚡ Eletromax
🔥 Ofertas e produtos selecionados!`;

      res.json({

        success: true,

        texto

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

        message:
          "Erro ao gerar post."

      });

    }

  }
);

// ==========================================
// MERCADO LIVRE - STATUS
// ==========================================

app.get(
  "/api/mercadolivre/status",
  (req, res) => {

    res.json({

      success: true,

      conectado:
        Boolean(
          process.env.ML_ACCESS_TOKEN
        ),

      configurado:
        Boolean(
          process.env.ML_CLIENT_ID &&
          process.env.ML_CLIENT_SECRET &&
          process.env.ML_REDIRECT_URI
        )

    });

  }
);

// ==========================================
// MERCADO LIVRE - LOGIN
// ==========================================

app.get(
  "/api/mercadolivre/login",
  (req, res) => {

    const clientId =
      process.env.ML_CLIENT_ID;

    const redirectUri =
      process.env.ML_REDIRECT_URI;

    if (
      !clientId ||
      !redirectUri
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Configurar OAuth do Mercado Livre."

      });

    }

    const url =
      "https://auth.mercadolivre.com.br/authorization" +
      "?response_type=code" +
      "&client_id=" +
      encodeURIComponent(
        clientId
      ) +
      "&redirect_uri=" +
      encodeURIComponent(
        redirectUri
      );

    res.redirect(
      url
    );

  }
);

// ==========================================
// MERCADO LIVRE - CALLBACK
// ==========================================

app.get(
  "/api/mercadolivre/callback",
  async (req, res) => {

    const code =
      req.query.code;

    if (!code) {

      return res.status(400).send(
        "Código de autorização não informado."
      );

    }

    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Eletromax</title>
        </head>
        <body>
          <h2>Autorização recebida!</h2>
          <p>O código OAuth foi recebido.</p>
          <p>A integração completa do token será configurada na próxima etapa.</p>
        </body>
      </html>
    `);

  }
);

// ==========================================
// MERCADO LIVRE - BUSCAR
// ==========================================

app.get(
  "/api/mercadolivre/buscar",
  async (req, res) => {

    const busca =
      String(
        req.query.q || ""
      ).trim();

    const limite =
      Math.min(
        Number(
          req.query.limit || 20
        ),
        50
      );

    if (!busca) {

      return res.status(400).json({

        success: false,

        message:
          "Informe o termo de busca."

      });

    }

    try {

      const resposta =
        await fetch(
          "https://api.mercadolibre.com/sites/MLB/search?q=" +
          encodeURIComponent(
            busca
          ) +
          "&limit=" +
          limite
        );

      if (
        !resposta.ok
      ) {

        throw new Error(
          "Mercado Livre retornou HTTP " +
          resposta.status
        );

      }

      const dados =
        await resposta.json();

      const produtos =
        (
          dados.results ||
          []
        )
          .map(
            function(item) {

              return {

                id:
                  item.id,

                nome:
                  item.title,

                preco:
                  item.price,

                link:
                  item.permalink,

                imagem:
                  item.thumbnail,

                plataforma:
                  "Mercado Livre"

              };

            }
          );

      res.json({

        success: true,

        produtos

      });

    } catch (erro) {

      console.error(
        "ERRO MERCADO LIVRE:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao consultar Mercado Livre."

      });

    }

  }
);

// ==========================================
// MERCADO LIVRE - BUSCAR E SALVAR
// ==========================================

app.post(
  "/api/mercadolivre/buscar-salvar",
  async (req, res) => {

    const busca =
      String(
        req.body.q || ""
      ).trim();

    const limite =
      Math.min(
        Number(
          req.body.limit || 20
        ),
        50
      );

    if (!busca) {

      return res.status(400).json({

        success: false,

        message:
          "Informe o termo de busca."

      });

    }

    try {

      const resposta =
        await fetch(
          "https://api.mercadolibre.com/sites/MLB/search?q=" +
          encodeURIComponent(
            busca
          ) +
          "&limit=" +
          limite
        );

      if (
        !resposta.ok
      ) {

        throw new Error(
          "Erro HTTP " +
          resposta.status
        );

      }

      const dados =
        await resposta.json();

      const produtos =
        dados.results ||
        [];

      let salvos =
        0;

      let duplicados =
        0;

      for (
        const produto
        of produtos
      ) {

        const link =
          produto.permalink;

        const existe =
          await pool.query(
            `
            SELECT id
            FROM ofertas
            WHERE link = $1
            LIMIT 1
            `,
            [
              link
            ]
          );

        if (
          existe.rowCount > 0
        ) {

          duplicados++;

          continue;

        }

        await pool.query(
          `
          INSERT INTO ofertas
          (
            nome,
            preco,
            link,
            plataforma,
            imagem
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          `,
          [

            produto.title,

            String(
              produto.price || ""
            ),

            link,

            "Mercado Livre",

            produto.thumbnail || ""

          ]
        );

        salvos++;

      }

      res.json({

        success: true,

        encontrados:
          produtos.length,

        salvos,

        duplicados

      });

    } catch (erro) {

      console.error(
        "ERRO BUSCAR E SALVAR ML:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar e salvar ofertas."

      });

    }

  }
);

// ==========================================
// ROTA PRINCIPAL
// ==========================================

app.get(
  "/api",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Eletromax V2 API funcionando!"

    });

  }
);

// ==========================================
// INICIAR SERVIDOR
// ==========================================

async function iniciarServidor() {

  const bancoOK =
    await inicializarBanco();

  if (!bancoOK) {

    console.error(
      "ATENÇÃO: Banco apresentou erro."
    );

  }

  app.listen(
    PORT,
    "0.0.0.0",
    function() {

      console.log(
        "================================="
      );

      console.log(
        "ELETROMAX V2 INICIADO"
      );

      console.log(
        "PORTA:",
        PORT
      );

      console.log(
        "BANCO:",
        bancoOK
          ? "CONECTADO"
          : "COM ERRO"
      );

      console.log(
        "================================="
      );

    }
  );

}

iniciarServidor();

