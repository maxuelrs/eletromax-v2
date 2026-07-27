
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

// ==========================================
// FRONTEND
// ==========================================

app.use(
  express.static(
    path.join(
      __dirname,
      "../frontend"
    )
  )
);

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "../frontend/index.html"
      )
    );
  }
);

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
// TOKENS MERCADO LIVRE
// ==========================================

let mercadoLivreAccessToken =
  process.env.ML_ACCESS_TOKEN || null;

let mercadoLivreRefreshToken =
  process.env.ML_REFRESH_TOKEN || null;

let mercadoLivreTokenExpiresAt =
  process.env.ML_TOKEN_EXPIRES_AT
    ? Number(
        process.env.ML_TOKEN_EXPIRES_AT
      )
    : null;

let mercadoLivreUserId =
  process.env.ML_USER_ID || null;

// ==========================================
// INICIALIZAR BANCO
// ==========================================

async function inicializarBanco() {

  try {

    // --------------------------------------
    // TABELA PRODUTOS
    // --------------------------------------

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

    // --------------------------------------
    // TABELA OFERTAS
    // --------------------------------------

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

    // --------------------------------------
    // TABELA CONFIGURAÇÕES
    // --------------------------------------

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

    // --------------------------------------
    // CONFIGURAÇÃO PADRÃO
    // --------------------------------------

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

    // --------------------------------------
    // TABELA TOKENS MERCADO LIVRE
    // --------------------------------------

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mercadolivre_tokens (
        id INTEGER PRIMARY KEY,
        user_id TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at BIGINT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
      "TABELA TOKENS ML PRONTA"
    );

    console.log(
      "================================="
    );

    // --------------------------------------
    // CARREGAR TOKEN DO BANCO
    // --------------------------------------

    await carregarTokenMercadoLivre();

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
// SALVAR TOKEN MERCADO LIVRE
// ==========================================

async function salvarTokenMercadoLivre({
  userId,
  accessToken,
  refreshToken,
  expiresAt
}) {

  try {

    await pool.query(
      `
      INSERT INTO mercadolivre_tokens
      (
        id,
        user_id,
        access_token,
        refresh_token,
        expires_at,
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
        user_id =
          EXCLUDED.user_id,

        access_token =
          EXCLUDED.access_token,

        refresh_token =
          COALESCE(
            EXCLUDED.refresh_token,
            mercadolivre_tokens.refresh_token
          ),

        expires_at =
          EXCLUDED.expires_at,

        atualizado_em =
          CURRENT_TIMESTAMP
      `,
      [
        userId
          ? String(userId)
          : null,

        accessToken,

        refreshToken
          ? refreshToken
          : null,

        expiresAt
          ? Number(expiresAt)
          : null
      ]
    );

    console.log(
      "TOKEN MERCADO LIVRE SALVO NO BANCO"
    );

  } catch (erro) {

    console.error(
      "ERRO AO SALVAR TOKEN ML:",
      erro.message
    );

    throw erro;

  }

}

// ==========================================
// CARREGAR TOKEN MERCADO LIVRE
// ==========================================

async function carregarTokenMercadoLivre() {

  try {

    const resultado =
      await pool.query(
        `
        SELECT
          user_id,
          access_token,
          refresh_token,
          expires_at
        FROM mercadolivre_tokens
        WHERE id = 1
        LIMIT 1
        `
      );

    if (
      resultado.rowCount === 0
    ) {

      console.log(
        "NENHUM TOKEN ML SALVO NO BANCO."
      );

      return;

    }

    const token =
      resultado.rows[0];

    mercadoLivreUserId =
      token.user_id || null;

    mercadoLivreAccessToken =
      token.access_token || null;

    mercadoLivreRefreshToken =
      token.refresh_token || null;

    mercadoLivreTokenExpiresAt =
      token.expires_at
        ? Number(
            token.expires_at
          )
        : null;

    console.log(
      "================================="
    );

    console.log(
      "TOKEN ML CARREGADO DO BANCO"
    );

    console.log(
      "USER ID:",
      mercadoLivreUserId ||
        "não informado"
    );

    console.log(
      "TOKEN:",
      mercadoLivreAccessToken
        ? "CARREGADO"
        : "NÃO ENCONTRADO"
    );

    console.log(
      "REFRESH TOKEN:",
      mercadoLivreRefreshToken
        ? "CARREGADO"
        : "NÃO ENCONTRADO"
    );

    console.log(
      "================================="
    );

  } catch (erro) {

    console.error(
      "ERRO AO CARREGAR TOKEN ML:",
      erro.message
    );

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
          process.env.ML_CLIENT_ID &&
          process.env.ML_CLIENT_SECRET &&
          process.env.ML_REDIRECT_URI
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
          nome_loja =
            EXCLUDED.nome_loja,

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

      console.error(
        "ERRO AO GERAR POST:",
        erro.message
      );

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
  async (req, res) => {

    try {

      const configurado =
        Boolean(
          process.env.ML_CLIENT_ID &&
          process.env.ML_CLIENT_SECRET &&
          process.env.ML_REDIRECT_URI
        );

      let conectado =
        Boolean(
          mercadoLivreAccessToken
        );

      // ------------------------------------
      // SE NÃO ESTÁ EM MEMÓRIA,
      // TENTA BUSCAR NO BANCO
      // ------------------------------------

      if (
        !conectado
      ) {

        await carregarTokenMercadoLivre();

        conectado =
          Boolean(
            mercadoLivreAccessToken
          );

      }

      res.json({

        success: true,

        conectado,

        configurado,

        userId:
          mercadoLivreUserId || null,

        tokenExpiraEm:
          mercadoLivreTokenExpiresAt
            ? new Date(
                mercadoLivreTokenExpiresAt
              ).toISOString()
            : null

      });

    } catch (erro) {

      console.error(
        "ERRO STATUS ML:",
        erro.message
      );

      res.status(500).json({

        success: false,

        conectado: false,

        configurado: false,

        message:
          erro.message

      });

    }

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
// MERCADO LIVRE - CALLBACK OAUTH
// ==========================================

app.get(
  "/api/mercadolivre/callback",
  async (req, res) => {

    const code =
      req.query.code;

    const error =
      req.query.error;

    const errorDescription =
      req.query.error_description;

    // --------------------------------------
    // ERRO OAUTH
    // --------------------------------------

    if (
      error
    ) {

      console.error(
        "ERRO OAUTH MERCADO LIVRE:",
        error,
        errorDescription || ""
      );

      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Eletromax - Erro OAuth</title>
        </head>
        <body>
          <h2>Erro ao conectar Mercado Livre</h2>
          <p>${error}</p>
          <p>${errorDescription || ""}</p>
        </body>
        </html>
      `);

    }

    // --------------------------------------
    // VERIFICAR CODE
    // --------------------------------------

    if (
      !code
    ) {

      return res.status(400).send(
        "Código de autorização não informado."
      );

    }

    const clientId =
      process.env.ML_CLIENT_ID;

    const clientSecret =
      process.env.ML_CLIENT_SECRET;

    const redirectUri =
      process.env.ML_REDIRECT_URI;

    if (
      !clientId ||
      !clientSecret ||
      !redirectUri
    ) {

      return res.status(500).send(`
        <h2>Configuração incompleta</h2>
        <p>
          Configure ML_CLIENT_ID,
          ML_CLIENT_SECRET e
          ML_REDIRECT_URI.
        </p>
      `);

    }

    try {

      console.log(
        "CÓDIGO OAUTH RECEBIDO."
      );

      // ------------------------------------
      // TROCAR CODE POR TOKEN
      // ------------------------------------

      const resposta =
        await fetch(
          "https://api.mercadolibre.com/oauth/token",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              new URLSearchParams({

                grant_type:
                  "authorization_code",

                client_id:
                  clientId,

                client_secret:
                  clientSecret,

                code:
                  code,

                redirect_uri:
                  redirectUri

              }).toString()

          }
        );

      const dados =
        await resposta.json();

      if (
        !resposta.ok
      ) {

        console.error(
          "ERRO AO OBTER TOKEN ML:",
          dados
        );

        return res.status(500).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <title>Eletromax - Erro</title>
          </head>
          <body>
            <h2>
              Erro ao conectar Mercado Livre
            </h2>

            <p>
              Não foi possível obter
              o token de acesso.
            </p>

            <p>
              ${
                dados.message ||
                "Erro desconhecido."
              }
            </p>

          </body>
          </html>
        `);

      }

      // ------------------------------------
      // CALCULAR EXPIRAÇÃO
      // ------------------------------------

      const expiresAt =
        dados.expires_in
          ? Date.now() +
            Number(
              dados.expires_in
            ) *
            1000
          : null;

      // ------------------------------------
      // ATUALIZAR MEMÓRIA
      // ------------------------------------

      mercadoLivreAccessToken =
        dados.access_token || null;

      mercadoLivreRefreshToken =
        dados.refresh_token || null;

      mercadoLivreTokenExpiresAt =
        expiresAt;

      mercadoLivreUserId =
        dados.user_id
          ? String(
              dados.user_id
            )
          : null;

      // ------------------------------------
      // SALVAR NO POSTGRESQL
      // ------------------------------------

      await salvarTokenMercadoLivre({

        userId:
          mercadoLivreUserId,

        accessToken:
          mercadoLivreAccessToken,

        refreshToken:
          mercadoLivreRefreshToken,

        expiresAt:
          mercadoLivreTokenExpiresAt

      });

      console.log(
        "================================="
      );

      console.log(
        "MERCADO LIVRE CONECTADO"
      );

      console.log(
        "TOKEN SALVO NO POSTGRESQL"
      );

      console.log(
        "USER ID:",
        mercadoLivreUserId ||
          "não informado"
      );

      console.log(
        "================================="
      );

      // ------------------------------------
      // SUCESSO
      // ------------------------------------

      res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">

        <head>

          <meta charset="UTF-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >

          <title>
            Eletromax - Mercado Livre conectado
          </title>

          <style>

            body {

              font-family:
                Arial,
                sans-serif;

              text-align:
                center;

              padding:
                40px 20px;

              background:
                #f5f5f5;

            }

            .box {

              max-width:
                500px;

              margin:
                auto;

              background:
                white;

              padding:
                30px;

              border-radius:
                15px;

              box-shadow:
                0 5px 20px
                rgba(
                  0,
                  0,
                  0,
                  0.10
                );

            }

            h2 {

              color:
                #16a34a;

            }

            p {

              color:
                #444;

              line-height:
                1.6;

            }

          </style>

        </head>

        <body>

          <div class="box">

            <h2>
              ✅ Mercado Livre conectado!
            </h2>

            <p>
              A autorização foi concluída
              com sucesso.
            </p>

            <p>
              O token foi salvo
              permanentemente no banco
              de dados do Eletromax.
            </p>

            <p>
              Mesmo se o servidor reiniciar,
              o Eletromax poderá recuperar
              a conexão.
            </p>

            <p>
              Agora você pode voltar
              ao painel Eletromax.
            </p>

          </div>

        </body>

        </html>
      `);

    } catch (erro) {

      console.error(
        "ERRO NO CALLBACK OAUTH:",
        erro.message
      );

      res.status(500).send(`
        <!DOCTYPE html>

        <html lang="pt-BR">

        <head>

          <meta charset="UTF-8">

          <title>
            Eletromax - Erro
          </title>

        </head>

        <body>

          <h2>
            Erro ao conectar Mercado Livre
          </h2>

          <p>
            ${erro.message}
          </p>

        </body>

        </html>
      `);

    }

  }
);

// ==========================================
// RENOVAR TOKEN MERCADO LIVRE
// ==========================================

async function renovarTokenMercadoLivre() {

  if (
    !mercadoLivreRefreshToken
  ) {

    throw new Error(
      "Refresh token do Mercado Livre não disponível."
    );

  }

  const clientId =
    process.env.ML_CLIENT_ID;

  const clientSecret =
    process.env.ML_CLIENT_SECRET;

  const resposta =
    await fetch(
      "https://api.mercadolibre.com/oauth/token",
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded"

        },

        body:
          new URLSearchParams({

            grant_type:
              "refresh_token",

            client_id:
              clientId,

            client_secret:
              clientSecret,

            refresh_token:
              mercadoLivreRefreshToken

          }).toString()

      }
    );

  const dados =
    await resposta.json();

  if (
    !resposta.ok
  ) {

    console.error(
      "ERRO AO RENOVAR TOKEN ML:",
      dados
    );

    throw new Error(
      dados.message ||
      "Erro ao renovar token."
    );

  }

  const expiresAt =
    dados.expires_in
      ? Date.now() +
        Number(
          dados.expires_in
        ) *
        1000
      : null;

  // --------------------------------------
  // ATUALIZAR MEMÓRIA
  // --------------------------------------

  mercadoLivreAccessToken =
    dados.access_token;

  if (
    dados.refresh_token
  ) {

    mercadoLivreRefreshToken =
      dados.refresh_token;

  }

  mercadoLivreTokenExpiresAt =
    expiresAt;

  // --------------------------------------
  // ATUALIZAR BANCO
  // --------------------------------------

  await salvarTokenMercadoLivre({

    userId:
      mercadoLivreUserId,

    accessToken:
      mercadoLivreAccessToken,

    refreshToken:
      mercadoLivreRefreshToken,

    expiresAt:
      mercadoLivreTokenExpiresAt

  });

  console.log(
    "TOKEN MERCADO LIVRE RENOVADO E SALVO."
  );

  return mercadoLivreAccessToken;

}

// ==========================================
// OBTER TOKEN VÁLIDO
// ==========================================

async function obterTokenMercadoLivre() {

  // --------------------------------------
  // SE NÃO TEM TOKEN EM MEMÓRIA,
  // CARREGAR DO BANCO
  // --------------------------------------

  if (
    !mercadoLivreAccessToken
  ) {

    await carregarTokenMercadoLivre();

  }

  // --------------------------------------
  // VERIFICAR TOKEN
  // --------------------------------------

  if (
    !mercadoLivreAccessToken
  ) {

    throw new Error(
      "Mercado Livre não está conectado."
    );

  }

  // --------------------------------------
  // RENOVAR SE ESTIVER PRÓXIMO DE EXPIRAR
  // --------------------------------------

  if (
    mercadoLivreTokenExpiresAt &&
    Date.now() >
      mercadoLivreTokenExpiresAt -
        5 *
        60 *
        1000
  ) {

    console.log(
      "TOKEN ML PRÓXIMO DE EXPIRAR."
    );

    return await renovarTokenMercadoLivre();

  }

  return mercadoLivreAccessToken;

}

// ==========================================
// MERCADO LIVRE - DADOS DA CONTA
// ==========================================

app.get(
  "/api/mercadolivre/me",
  async (req, res) => {

    try {

      const token =
        await obterTokenMercadoLivre();

      const resposta =
        await fetch(
          "https://api.mercadolibre.com/users/me",
          {

            headers: {

              Authorization:
                "Bearer " +
                token

            }

          }
        );

      const dados =
        await resposta.json();

      if (
        !resposta.ok
      ) {

        return res.status(
          resposta.status
        ).json({

          success: false,

          message:
            "Erro ao consultar conta Mercado Livre.",

          error:
            dados

        });

      }

      // Atualizar user_id caso necessário

      if (
        dados.id
      ) {

        mercadoLivreUserId =
          String(
            dados.id
          );

        await pool.query(
          `
          UPDATE mercadolivre_tokens
          SET
            user_id = $1,
            atualizado_em =
              CURRENT_TIMESTAMP
          WHERE id = 1
          `,
          [
            mercadoLivreUserId
          ]
        );

      }

      res.json({

        success: true,

        usuario:
          dados

      });

    } catch (erro) {

      console.error(
        "ERRO AO CONSULTAR CONTA ML:",
        erro.message
      );

      res.status(401).json({

        success: false,

        message:
          erro.message

      });

    }

  }
);

// ==========================================
// MERCADO LIVRE - BUSCAR PRODUTOS
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
        Math.max(
          Number(
            req.query.limit || 20
          ),
          1
        ),
        50
      );

    if (
      !busca
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Informe o termo de busca."

      });

    }

    try {

      // Garantir que o token
      // esteja carregado e válido

      await obterTokenMercadoLivre();

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
          "Erro ao consultar Mercado Livre.",

        error:
          erro.message

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
        Math.max(
          Number(
            req.body.limit || 20
          ),
          1
        ),
        50
      );

    if (
      !busca
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Informe o termo de busca."

      });

    }

    try {

      await obterTokenMercadoLivre();

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

        if (
          !link
        ) {

          continue;

        }

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

            produto.title ||
              "Produto",

            String(
              produto.price ||
              ""
            ),

            link,

            "Mercado Livre",

            produto.thumbnail ||
              ""

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
          "Erro ao buscar e salvar ofertas.",

        error:
          erro.message

      });

    }

  }
);

// ==========================================
// ROTA API PRINCIPAL
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
// ROTA 404 DA API
// ==========================================

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({

      success: false,

      message:
        "Rota da API não encontrada."

    });

  }
);

// ==========================================
// INICIAR SERVIDOR
// ==========================================

async function iniciarServidor() {

  const bancoOK =
    await inicializarBanco();

  if (
    !bancoOK
  ) {

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
        "FRONTEND:",
        "ATIVO"
      );

      console.log(
        "MERCADO LIVRE:",
        mercadoLivreAccessToken
          ? "CONECTADO"
          : "NÃO CONECTADO"
      );

      console.log(
        "================================="
      );

    }
  );

}

iniciarServidor();

