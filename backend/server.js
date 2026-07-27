
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT) || 10000;

const FRONTEND_PATH = path.join(
  __dirname,
  "..",
  "frontend"
);

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const MERCADOLIVRE_CLIENT_ID =
  process.env.MERCADOLIVRE_CLIENT_ID || "";

const MERCADOLIVRE_CLIENT_SECRET =
  process.env.MERCADOLIVRE_CLIENT_SECRET || "";

const MERCADOLIVRE_REDIRECT_URI =
  process.env.MERCADOLIVRE_REDIRECT_URI ||
  "https://eletromax-v2-2.onrender.com/api/mercadolivre/callback";

const LINK_MERCADO_LIVRE =
  process.env.LINK_MERCADO_LIVRE ||
  "https://meli.la/33A3HdG";

const LINK_SHOPEE =
  process.env.LINK_SHOPEE ||
  "https://s.shopee.com.br/6VMYjYBtKZ";

const LINK_WHATSAPP =
  process.env.LINK_WHATSAPP ||
  "https://chat.whatsapp.com/Je7ddU2rbdBKDxEidcBiuU?s=cl&p=a&ilr=1";

// ======================================================
// MIDDLEWARES
// ======================================================

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

// ======================================================
// POSTGRESQL
// ======================================================

if (!process.env.DATABASE_URL) {
  console.error(
    "ATENÇÃO: DATABASE_URL não configurada."
  );
}

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

// ======================================================
// FUNÇÕES DE BANCO
// ======================================================

async function testarBanco() {
  try {
    await pool.query(
      "SELECT NOW()"
    );

    return true;

  } catch (erro) {

    console.error(
      "ERRO POSTGRESQL:",
      erro.message
    );

    return false;
  }
}

async function inicializarBanco() {

  try {

    await pool.query(
      "CREATE TABLE IF NOT EXISTS produtos (" +
      "id SERIAL PRIMARY KEY, " +
      "nome TEXT NOT NULL, " +
      "preco TEXT, " +
      "link TEXT NOT NULL, " +
      "plataforma TEXT NOT NULL, " +
      "criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log(
      "Tabela produtos OK"
    );

    await pool.query(
      "CREATE TABLE IF NOT EXISTS ofertas (" +
      "id SERIAL PRIMARY KEY, " +
      "nome TEXT NOT NULL, " +
      "preco TEXT, " +
      "preco_anterior TEXT, " +
      "link TEXT NOT NULL, " +
      "plataforma TEXT NOT NULL, " +
      "imagem TEXT, " +
      "descricao TEXT, " +
      "criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log(
      "Tabela ofertas OK"
    );

    await pool.query(
      "CREATE TABLE IF NOT EXISTS configuracoes (" +
      "id INTEGER PRIMARY KEY, " +
      "nome_loja TEXT, " +
      "link_mercadolivre TEXT, " +
      "link_shopee TEXT, " +
      "link_whatsapp TEXT, " +
      "atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log(
      "Tabela configuracoes OK"
    );

    await pool.query(
      "CREATE TABLE IF NOT EXISTS mercadolivre_tokens (" +
      "id INTEGER PRIMARY KEY, " +
      "access_token TEXT NOT NULL, " +
      "refresh_token TEXT, " +
      "user_id TEXT, " +
      "expires_in INTEGER, " +
      "criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
      "atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );

    console.log(
      "Tabela mercadolivre_tokens OK"
    );

    await pool.query(
      "INSERT INTO configuracoes " +
      "(id, nome_loja, link_mercadolivre, link_shopee, link_whatsapp) " +
      "VALUES (1, 'Eletromax', $1, $2, $3) " +
      "ON CONFLICT (id) DO NOTHING",
      [
        LINK_MERCADO_LIVRE,
        LINK_SHOPEE,
        LINK_WHATSAPP
      ]
    );

    console.log(
      "TABELAS DO ELETROMAX PRONTAS"
    );

    return true;

  } catch (erro) {

    console.error(
      "ERRO AO CRIAR TABELAS:",
      erro.message
    );

    return false;
  }
}

// ======================================================
// FRONTEND
// ======================================================

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        FRONTEND_PATH,
        "index.html"
      ),
      (erro) => {

        if (erro) {

          console.error(
            "ERRO INDEX:",
            erro.message
          );

          if (!res.headersSent) {

            res
              .status(500)
              .send(
                "Erro: frontend/index.html não foi encontrado."
              );
          }
        }
      }
    );
  }
);

app.use(
  express.static(
    FRONTEND_PATH
  )
);

// ======================================================
// STATUS
// ======================================================

app.get(
  "/api/status",
  async (req, res) => {

    const banco =
      await testarBanco();

    res.json({

      success: true,

      status: "online",

      database:
        banco
          ? "connected"
          : "disconnected",

      mercadolivre:
        MERCADOLIVRE_CLIENT_ID
          ? "configured"
          : "not_configured"
    });
  }
);

// ======================================================
// DASHBOARD
// ======================================================

app.get(
  "/api/dashboard",
  async (req, res) => {

    try {

      const produtos =
        await pool.query(
          "SELECT COUNT(*) FROM produtos"
        );

      const ofertas =
        await pool.query(
          "SELECT COUNT(*) FROM ofertas"
        );

      const mercadoLivre =
        await pool.query(
          "SELECT COUNT(*) FROM produtos " +
          "WHERE LOWER(plataforma) LIKE '%mercado%'"
        );

      const shopee =
        await pool.query(
          "SELECT COUNT(*) FROM produtos " +
          "WHERE LOWER(plataforma) LIKE '%shopee%'"
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
        "ERRO DASHBOARD:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao carregar dashboard.",

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
  "/api/produtos",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          "SELECT * FROM produtos " +
          "ORDER BY id DESC"
        );

      res.json({

        success: true,

        produtos:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "ERRO PRODUTOS:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar produtos.",

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

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Nome, link e plataforma são obrigatórios."
          });
      }

      const resultado =
        await pool.query(

          "INSERT INTO produtos " +
          "(nome, preco, link, plataforma) " +
          "VALUES ($1, $2, $3, $4) " +
          "RETURNING *",

          [
            String(nome).trim(),

            preco
              ? String(preco).trim()
              : "",

            String(link).trim(),

            String(plataforma).trim()
          ]
        );

      res
        .status(201)
        .json({

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

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao salvar produto.",

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// PRODUTOS - EXCLUIR
// ======================================================

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

        return res
          .status(400)
          .json({

            success: false,

            message:
              "ID inválido."
          });
      }

      const resultado =
        await pool.query(

          "DELETE FROM produtos " +
          "WHERE id = $1 " +
          "RETURNING *",

          [id]
        );

      if (
        resultado.rows.length === 0
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Produto não encontrado."
          });
      }

      res.json({

        success: true,

        message:
          "Produto excluído!",

        produto:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "ERRO AO EXCLUIR PRODUTO:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao excluir produto.",

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
  "/api/ofertas",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(

          "SELECT " +
          "id, " +
          "nome, " +
          "preco, " +
          "preco_anterior AS \"precoAnterior\", " +
          "link, " +
          "plataforma, " +
          "imagem, " +
          "descricao, " +
          "criado_em AS \"criadoEm\" " +
          "FROM ofertas " +
          "ORDER BY id DESC"
        );

      res.json({

        success: true,

        ofertas:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "ERRO AO LISTAR OFERTAS:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar ofertas.",

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// OFERTA - SALVAR
// ======================================================

app.post(
  "/api/ofertas",
  async (req, res) => {

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

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Nome, link e plataforma são obrigatórios."
          });
      }

      const resultado =
        await pool.query(

          "INSERT INTO ofertas " +
          "(nome, preco, preco_anterior, link, plataforma, imagem, descricao) " +
          "VALUES ($1, $2, $3, $4, $5, $6, $7) " +
          "RETURNING *",

          [
            String(nome).trim(),

            preco
              ? String(preco).trim()
              : "",

            precoAnterior
              ? String(precoAnterior).trim()
              : "",

            String(link).trim(),

            String(plataforma).trim(),

            imagem
              ? String(imagem).trim()
              : "",

            descricao
              ? String(descricao).trim()
              : ""
          ]
        );

      res
        .status(201)
        .json({

          success: true,

          message:
            "Oferta salva com sucesso!",

          oferta:
            resultado.rows[0]
        });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR OFERTA:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao salvar oferta.",

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// CENTRAL DE OFERTAS
// ======================================================

app.get(
  "/api/central-ofertas",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(

          "SELECT " +
          "id, " +
          "nome, " +
          "preco, " +
          "preco_anterior AS \"precoAnterior\", " +
          "link, " +
          "plataforma, " +
          "imagem, " +
          "descricao, " +
          "criado_em AS \"criadoEm\" " +
          "FROM ofertas " +
          "ORDER BY id DESC"
        );

      res.json({

        success: true,

        total:
          resultado.rows.length,

        ofertas:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "ERRO CENTRAL OFERTAS:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao carregar Central de Ofertas.",

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// MERCADO LIVRE - OBTER TOKEN
// ======================================================

async function obterTokenMercadoLivre() {

  const resultado =
    await pool.query(

      "SELECT " +
      "access_token, " +
      "refresh_token, " +
      "user_id, " +
      "expires_in, " +
      "atualizado_em " +
      "FROM mercadolivre_tokens " +
      "WHERE id = 1 " +
      "LIMIT 1"
    );

  if (
    resultado.rows.length === 0
  ) {

    const erro =
      new Error(
        "Conta do Mercado Livre não autorizada."
      );

    erro.status = 401;

    throw erro;
  }

  const token =
    resultado.rows[0];

  return token;
}

// ======================================================
// MERCADO LIVRE - RENOVAR TOKEN
// ======================================================

async function renovarTokenMercadoLivre(
  refreshToken
) {

  if (
    !MERCADOLIVRE_CLIENT_ID ||
    !MERCADOLIVRE_CLIENT_SECRET
  ) {

    const erro =
      new Error(
        "MERCADOLIVRE_CLIENT_ID ou MERCADOLIVRE_CLIENT_SECRET não configurado."
      );

    erro.status = 500;

    throw erro;
  }

  if (
    !refreshToken
  ) {

    const erro =
      new Error(
        "Refresh token do Mercado Livre não disponível."
      );

    erro.status = 401;

    throw erro;
  }

  console.log(
    "Renovando token do Mercado Livre..."
  );

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
              MERCADOLIVRE_CLIENT_ID,

            client_secret:
              MERCADOLIVRE_CLIENT_SECRET,

            refresh_token:
              refreshToken
          })
      }
    );

  const texto =
    await resposta.text();

  let dados = {};

  try {

    dados =
      texto
        ? JSON.parse(texto)
        : {};

  } catch (erro) {

    dados = {
      raw:
        texto
    };
  }

  if (
    !resposta.ok
  ) {

    console.error(
      "ERRO AO RENOVAR TOKEN ML:",
      resposta.status,
      dados
    );

    const erro =
      new Error(
        "Não foi possível renovar o token do Mercado Livre."
      );

    erro.status =
      resposta.status;

    erro.detalhe =
      dados;

    throw erro;
  }

  await pool.query(

    "UPDATE mercadolivre_tokens " +
    "SET access_token = $1, " +
    "refresh_token = $2, " +
    "user_id = $3, " +
    "expires_in = $4, " +
    "atualizado_em = CURRENT_TIMESTAMP " +
    "WHERE id = 1",

    [

      dados.access_token,

      dados.refresh_token ||
        refreshToken,

      dados.user_id
        ? String(
            dados.user_id
          )
        : null,

      dados.expires_in ||
        0
    ]
  );

  console.log(
    "Token do Mercado Livre renovado com sucesso."
  );

  return {

    access_token:
      dados.access_token,

    refresh_token:
      dados.refresh_token ||
      refreshToken,

    user_id:
      dados.user_id,

    expires_in:
      dados.expires_in
  };
}

// ======================================================
// MERCADO LIVRE - GARANTIR TOKEN VÁLIDO
// ======================================================

async function obterTokenValidoMercadoLivre() {

  let token =
    await obterTokenMercadoLivre();

  const atualizadoEm =
    token.atualizado_em
      ? new Date(
          token.atualizado_em
        ).getTime()
      : 0;

  const agora =
    Date.now();

  const idade =
    agora -
    atualizadoEm;

  const seisHoras =
    6 *
    60 *
    60 *
    1000;

  if (
    !token.access_token
  ) {

    token =
      await renovarTokenMercadoLivre(
        token.refresh_token
      );

    return token;
  }

  if (
    idade >
    seisHoras
  ) {

    try {

      token =
        await renovarTokenMercadoLivre(
          token.refresh_token
        );

    } catch (erro) {

      console.warn(
        "Não foi possível renovar token antigo. Tentando token atual."
      );
    }
  }

  return token;
}

// ======================================================
// MERCADO LIVRE - LOGIN
// ======================================================

app.get(
  "/api/mercadolivre/login",
  (req, res) => {

    if (
      !MERCADOLIVRE_CLIENT_ID
    ) {

      return res
        .status(500)
        .send(
          "MERCADOLIVRE_CLIENT_ID não configurado no Render."
        );
    }

    const url =
      "https://auth.mercadolivre.com.br/authorization" +
      "?response_type=code" +
      "&client_id=" +
      encodeURIComponent(
        MERCADOLIVRE_CLIENT_ID
      ) +
      "&redirect_uri=" +
      encodeURIComponent(
        MERCADOLIVRE_REDIRECT_URI
      );

    res.redirect(
      url
    );
  }
);

// ======================================================
// MERCADO LIVRE - CALLBACK OAUTH
// ======================================================

app.get(
  "/api/mercadolivre/callback",
  async (req, res) => {

    try {

      const code =
        req.query.code;

      if (
        !code
      ) {

        return res
          .status(400)
          .send(
            "Código de autorização não recebido."
          );
      }

      if (
        !MERCADOLIVRE_CLIENT_ID ||
        !MERCADOLIVRE_CLIENT_SECRET
      ) {

        return res
          .status(500)
          .send(
            "Credenciais do Mercado Livre não configuradas."
          );
      }

      const resposta =
        await fetch(
          "https://api.mercadolibre.com/oauth/token",
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/x-www-form-urlencoded",

              Accept:
                "application/json"
            },

            body:
              new URLSearchParams({

                grant_type:
                  "authorization_code",

                client_id:
                  MERCADOLIVRE_CLIENT_ID,

                client_secret:
                  MERCADOLIVRE_CLIENT_SECRET,

                code:
                  code,

                redirect_uri:
                  MERCADOLIVRE_REDIRECT_URI
              })
          }
        );

      const texto =
        await resposta.text();

      let dados = {};

      try {

        dados =
          texto
            ? JSON.parse(texto)
            : {};

      } catch (erro) {

        dados = {
          raw:
            texto
        };
      }

      if (
        !resposta.ok
      ) {

        console.error(
          "ERRO OAUTH ML:",
          resposta.status,
          dados
        );

        return res
          .status(500)
          .json({

            success: false,

            message:
              "Erro ao obter autorização do Mercado Livre.",

            status:
              resposta.status,

            detalhe:
              dados
          });
      }

      await pool.query(

        "INSERT INTO mercadolivre_tokens " +
        "(id, access_token, refresh_token, user_id, expires_in, atualizado_em) " +
        "VALUES (1, $1, $2, $3, $4, CURRENT_TIMESTAMP) " +
        "ON CONFLICT (id) " +
        "DO UPDATE SET " +
        "access_token = EXCLUDED.access_token, " +
        "refresh_token = EXCLUDED.refresh_token, " +
        "user_id = EXCLUDED.user_id, " +
        "expires_in = EXCLUDED.expires_in, " +
        "atualizado_em = CURRENT_TIMESTAMP",

        [

          dados.access_token,

          dados.refresh_token ||
            "",

          dados.user_id
            ? String(
                dados.user_id
              )
            : "",

          dados.expires_in ||
            0
        ]
      );

      res.send(

        "<!DOCTYPE html>" +
        "<html lang='pt-BR'>" +
        "<head>" +
        "<meta charset='UTF-8'>" +
        "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
        "<title>Mercado Livre conectado</title>" +
        "<style>" +
        "body{font-family:Arial;text-align:center;padding:50px;background:#f4f6f8}" +
        ".box{background:white;padding:30px;border-radius:15px;max-width:500px;margin:auto;box-shadow:0 4px 20px rgba(0,0,0,.1)}" +
        "</style>" +
        "</head>" +
        "<body>" +
        "<div class='box'>" +
        "<h1>✅ Mercado Livre conectado!</h1>" +
        "<p>A autorização foi concluída com sucesso.</p>" +
        "<p>Agora você pode voltar ao Eletromax.</p>" +
        "</div>" +
        "</body>" +
        "</html>"
      );

    } catch (erro) {

      console.error(
        "ERRO CALLBACK ML:",
        erro.message
      );

      res
        .status(500)
        .send(
          "Erro ao conectar Mercado Livre: " +
          erro.message
        );
    }
  }
);

// ======================================================
// MERCADO LIVRE - STATUS
// ======================================================

app.get(
  "/api/mercadolivre/status",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(

          "SELECT " +
          "user_id, " +
          "expires_in, " +
          "atualizado_em " +
          "FROM mercadolivre_tokens " +
          "WHERE id = 1 " +
          "LIMIT 1"
        );

      if (
        resultado.rows.length === 0
      ) {

        return res.json({

          success: true,

          conectado: false
        });
      }

      const token =
        resultado.rows[0];

      res.json({

        success: true,

        conectado: true,

        userId:
          token.user_id,

        expiresIn:
          token.expires_in,

        atualizadoEm:
          token.atualizado_em
      });

    } catch (erro) {

      console.error(
        "ERRO STATUS ML:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          conectado: false,

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// FUNÇÃO LIMITE
// ======================================================

function normalizarLimite(
  valor
) {

  let limite =
    Number(
      valor
    );

  if (
    !Number.isFinite(
      limite
    ) ||
    limite < 1
  ) {

    limite = 20;
  }

  return Math.min(
    Math.floor(
      limite
    ),
    50
  );
}

// ======================================================
// MERCADO LIVRE - CONSULTA AUTENTICADA
// ======================================================

async function consultarMercadoLivreAutenticado(
  busca,
  limite
) {

  let token =
    await obterTokenValidoMercadoLivre();

  const url =
    new URL(
      "https://api.mercadolibre.com/sites/MLB/search"
    );

  url.searchParams.set(
    "q",
    busca
  );

  url.searchParams.set(
    "limit",
    String(
      limite
    )
  );

  async function fazerConsulta(
    accessToken
  ) {

    return fetch(
      url.toString(),
      {

        method: "GET",

        headers: {

          Accept:
            "application/json",

          Authorization:
            "Bearer " +
            accessToken,

          "User-Agent":
            "Eletromax-V2/1.0"
        }
      }
    );
  }

  let resposta =
    await fazerConsulta(
      token.access_token
    );

  if (
    resposta.status === 401
  ) {

    console.log(
      "Token ML expirado. Tentando renovar..."
    );

    token =
      await renovarTokenMercadoLivre(
        token.refresh_token
      );

    resposta =
      await fazerConsulta(
        token.access_token
      );
  }

  const texto =
    await resposta.text();

  let dados = {};

  try {

    dados =
      texto
        ? JSON.parse(
            texto
          )
        : {};

  } catch (erro) {

    dados = {
      raw:
        texto
    };
  }

  if (
    resposta.status === 403
  ) {

    const erro =
      new Error(
        "Mercado Livre bloqueou a consulta (403 Forbidden)."
      );

    erro.status =
      403;

    erro.detalhe =
      dados;

    throw erro;
  }

  if (
    resposta.status === 401
  ) {

    const erro =
      new Error(
        "Token do Mercado Livre inválido ou expirado."
      );

    erro.status =
      401;

    erro.detalhe =
      dados;

    throw erro;
  }

  if (
    !resposta.ok
  ) {

    const erro =
      new Error(
        "Mercado Livre recusou a consulta."
      );

    erro.status =
      resposta.status;

    erro.detalhe =
      dados;

    throw erro;
  }

  return dados;
}

// ======================================================
// MERCADO LIVRE - BUSCAR
// ======================================================

app.get(
  "/api/mercadolivre/buscar",
  async (req, res) => {

    try {

      const busca =
        String(
          req.query.q ||
          "ofertas"
        ).trim();

      const limite =
        normalizarLimite(
          req.query.limit
        );

      const dados =
        await consultarMercadoLivreAutenticado(
          busca,
          limite
        );

      const produtos =
        Array.isArray(
          dados.results
        )
          ? dados.results.map(
              (produto) => ({

                id:
                  produto.id,

                nome:
                  produto.title,

                preco:
                  produto.price,

                moeda:
                  produto.currency_id,

                link:
                  produto.permalink,

                imagem:
                  produto.thumbnail,

                plataforma:
                  "Mercado Livre"
              })
            )
          : [];

      res.json({

        success: true,

        busca,

        total:
          produtos.length,

        produtos
      });

    } catch (erro) {

      console.error(
        "ERRO BUSCA ML:",
        erro
      );

      let mensagem =
        "Erro ao buscar produtos no Mercado Livre.";

      if (
        erro.status === 403
      ) {

        mensagem =
          "Mercado Livre bloqueou a consulta (403 Forbidden).";
      }

      if (
        erro.status === 401
      ) {

        mensagem =
          "Autorização do Mercado Livre inválida ou expirada.";
      }

      res
        .status(
          erro.status ||
          500
        )
        .json({

          success: false,

          message:
            mensagem,

          error:
            erro.message,

          status:
            erro.status ||
            500,

          detalhe:
            erro.detalhe ||
            null
        });
    }
  }
);

// ======================================================
// MERCADO LIVRE - BUSCAR E SALVAR
// ======================================================

app.post(
  "/api/mercadolivre/buscar-salvar",
  async (req, res) => {

    try {

      const busca =
        String(
          req.body.q ||
          "ofertas"
        ).trim();

      const limite =
        normalizarLimite(
          req.body.limit
        );

      const dados =
        await consultarMercadoLivreAutenticado(
          busca,
          limite
        );

      const produtos =
        Array.isArray(
          dados.results
        )
          ? dados.results
          : [];

      let salvos = 0;

      let duplicados = 0;

      for (
        const produto
        of produtos
      ) {

        if (
          !produto.title ||
          !produto.permalink
        ) {

          continue;
        }

        const preco =
          produto.price !== undefined &&
          produto.price !== null

            ? "R$ " +
              Number(
                produto.price
              )
                .toFixed(
                  2
                )
                .replace(
                  ".",
                  ","
                )

            : "";

        const imagem =
          produto.thumbnail ||
          (
            produto.pictures &&
            produto.pictures[0] &&
            produto.pictures[0].url
          ) ||
          "";

        const existente =
          await pool.query(

            "SELECT id " +
            "FROM ofertas " +
            "WHERE link = $1 " +
            "LIMIT 1",

            [
              produto.permalink
            ]
          );

        if (
          existente.rows.length > 0
        ) {

          duplicados++;

          continue;
        }

        await pool.query(

          "INSERT INTO ofertas " +
          "(nome, preco, preco_anterior, link, plataforma, imagem, descricao) " +
          "VALUES ($1, $2, $3, $4, $5, $6, $7)",

          [

            produto.title,

            preco,

            "",

            produto.permalink,

            "Mercado Livre",

            imagem,

            "Oferta encontrada automaticamente pelo Eletromax."
          ]
        );

        salvos++;
      }

      res.json({

        success: true,

        message:
          "Busca concluída com sucesso!",

        busca,

        encontrados:
          produtos.length,

        salvos,

        duplicados
      });

    } catch (erro) {

      console.error(
        "ERRO BUSCAR E SALVAR ML:",
        erro
      );

      let mensagem =
        "Erro ao consultar Mercado Livre.";

      if (
        erro.status === 403
      ) {

        mensagem =
          "Mercado Livre bloqueou a consulta (403 Forbidden).";
      }

      if (
        erro.status === 401
      ) {

        mensagem =
          "Autorização do Mercado Livre inválida ou expirada.";
      }

      res
        .status(
          erro.status ||
          500
        )
        .json({

          success: false,

          message:
            mensagem,

          error:
            erro.message,

          status:
            erro.status ||
            500,

          detalhe:
            erro.detalhe ||
            null
        });
    }
  }
);

// ======================================================
// LINKS
// ======================================================

app.get(
  "/api/links",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(

          "SELECT " +
          "link_mercadolivre, " +
          "link_shopee, " +
          "link_whatsapp " +
          "FROM configuracoes " +
          "WHERE id = 1 " +
          "LIMIT 1"
        );

      const config =
        resultado.rows[0] ||
        {};

      res.json({

        success: true,

        mercadoLivre:
          config.link_mercadolivre ||
          LINK_MERCADO_LIVRE,

        shopee:
          config.link_shopee ||
          LINK_SHOPEE,

        whatsapp:
          config.link_whatsapp ||
          LINK_WHATSAPP
      });

    } catch (erro) {

      console.error(
        "ERRO LINKS:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar links.",

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// CONFIGURAÇÕES - LISTAR
// ======================================================

app.get(
  "/api/configuracoes",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(

          "SELECT * " +
          "FROM configuracoes " +
          "WHERE id = 1 " +
          "LIMIT 1"
        );

      res.json({

        success: true,

        configuracoes:
          resultado.rows[0] || {

            nome_loja:
              "Eletromax",

            link_mercadolivre:
              LINK_MERCADO_LIVRE,

            link_shopee:
              LINK_SHOPEE,

            link_whatsapp:
              LINK_WHATSAPP
          }
      });

    } catch (erro) {

      console.error(
        "ERRO CONFIGURAÇÕES:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar configurações.",

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
  "/api/configuracoes",
  async (req, res) => {

    try {

      const {
        nomeLoja,
        linkMercadoLivre,
        linkShopee,
        linkWhatsapp
      } = req.body;

      const resultado =
        await pool.query(

          "INSERT INTO configuracoes " +
          "(id, nome_loja, link_mercadolivre, link_shopee, link_whatsapp, atualizado_em) " +
          "VALUES (1, $1, $2, $3, $4, CURRENT_TIMESTAMP) " +
          "ON CONFLICT (id) " +
          "DO UPDATE SET " +
          "nome_loja = EXCLUDED.nome_loja, " +
          "link_mercadolivre = EXCLUDED.link_mercadolivre, " +
          "link_shopee = EXCLUDED.link_shopee, " +
          "link_whatsapp = EXCLUDED.link_whatsapp, " +
          "atualizado_em = CURRENT_TIMESTAMP " +
          "RETURNING *",

          [

            nomeLoja ||
              "Eletromax",

            linkMercadoLivre ||
              LINK_MERCADO_LIVRE,

            linkShopee ||
              LINK_SHOPEE,

            linkWhatsapp ||
              LINK_WHATSAPP
          ]
        );

      res.json({

        success: true,

        message:
          "Configurações salvas!",

        configuracoes:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "ERRO CONFIGURAÇÕES:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao salvar configurações.",

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
  "/api/ofertas/gerar-post",
  async (req, res) => {

    try {

      const {
        nome,
        preco,
        precoAnterior,
        plataforma,
        link
      } = req.body;

      if (
        !nome
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Nome do produto obrigatório."
          });
      }

      const configResult =
        await pool.query(

          "SELECT * " +
          "FROM configuracoes " +
          "WHERE id = 1 " +
          "LIMIT 1"
        );

      const config =
        configResult.rows[0] ||
        {};

      const whatsapp =
        config.link_whatsapp ||
        LINK_WHATSAPP;

      let texto = "";

      texto +=
        "🔥 OFERTA IMPERDÍVEL 🔥\n\n";

      texto +=
        "📦 " +
        nome +
        "\n\n";

      if (
        precoAnterior
      ) {

        texto +=
          "❌ De: " +
          precoAnterior +
          "\n";
      }

      if (
        preco
      ) {

        texto +=
          "💰 Por apenas: " +
          preco +
          "\n\n";
      }

      texto +=
        "🛒 " +
        (
          plataforma ||
          "Oferta"
        ) +
        "\n\n";

      if (
        link
      ) {

        texto +=
          "🔗 COMPRE AQUI:\n" +
          link +
          "\n\n";
      }

      texto +=
        "⚡ Aproveite enquanto durar!\n\n";

      texto +=
        "📲 Entre no nosso grupo de ofertas:\n" +
        whatsapp;

      res.json({

        success: true,

        texto
      });

    } catch (erro) {

      console.error(
        "ERRO GERAR POST:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          message:
            "Erro ao gerar post.",

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// TESTE GERAL
// ======================================================

app.get(
  "/api/teste",
  async (req, res) => {

    try {

      const banco =
        await testarBanco();

      const produtos =
        await pool.query(
          "SELECT COUNT(*) FROM produtos"
        );

      const ofertas =
        await pool.query(
          "SELECT COUNT(*) FROM ofertas"
        );

      const tokens =
        await pool.query(
          "SELECT COUNT(*) FROM mercadolivre_tokens"
        );

      res.json({

        success:
          banco,

        sistema:
          "Eletromax V2",

        banco:
          banco
            ? "PostgreSQL conectado"
            : "Erro PostgreSQL",

        produtos:
          Number(
            produtos.rows[0].count
          ),

        ofertas:
          Number(
            ofertas.rows[0].count
          ),

        mercadoLivre:
          MERCADOLIVRE_CLIENT_ID
            ? "Client ID configurado"
            : "Client ID não configurado",

        autorizacao:
          Number(
            tokens.rows[0].count
          ) > 0
            ? "Conta autorizada"
            : "Aguardando autorização"
      });

    } catch (erro) {

      console.error(
        "ERRO TESTE:",
        erro.message
      );

      res
        .status(500)
        .json({

          success: false,

          error:
            erro.message
        });
    }
  }
);

// ======================================================
// 404 API
// ======================================================

app.use(
  "/api",
  (req, res) => {

    res
      .status(404)
      .json({

        success: false,

        message:
          "Rota API não encontrada.",

        rota:
          req.originalUrl
      });
  }
);

// ======================================================
// ERROS
// ======================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      "ERRO INTERNO:",
      err
    );

    if (
      res.headersSent
    ) {

      return next(
        err
      );
    }

    res
      .status(500)
      .json({

        success: false,

        message:
          "Erro interno do servidor."
      });
  }
);

// ======================================================
// INICIAR SERVIDOR
// ======================================================

async function iniciarServidor() {

  console.log(
    "======================================"
  );

  console.log(
    "⚡ ELETROMAX V2"
  );

  console.log(
    "======================================"
  );

  const bancoOK =
    await inicializarBanco();

  app.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        "Servidor iniciado."
      );

      console.log(
        "Porta:",
        PORT
      );

      console.log(
        "PostgreSQL:",
        bancoOK
          ? "CONECTADO"
          : "ERRO"
      );

      console.log(
        "Mercado Livre Client ID:",
        MERCADOLIVRE_CLIENT_ID
          ? "CONFIGURADO"
          : "NÃO CONFIGURADO"
      );

      console.log(
        "======================================"
      );
    }
  );
}

iniciarServidor();

