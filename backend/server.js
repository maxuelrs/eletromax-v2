// ==========================================
// ELETROMAX V2 - SERVER.JS
// VERSÃO CORRIGIDA - MERCADO LIVRE OAuth/API
// ==========================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// FRONTEND
// ==========================================

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  const indexPath = path.join(frontendPath, "index.html");

  res.sendFile(indexPath, (erro) => {
    if (erro && !res.headersSent) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Eletromax V2</title>
        </head>
        <body>
          <h1>⚡ Eletromax V2</h1>
          <p>Servidor funcionando corretamente.</p>
          <p><a href="/api">Abrir API</a></p>
          <p><a href="/api/status">Ver status</a></p>
          <p><a href="/health">Ver saúde do servidor</a></p>
        </body>
        </html>
      `);
    }
  });
});

// ==========================================
// POSTGRESQL
// ==========================================

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL não configurada.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,

  ssl: process.env.DATABASE_URL
    ? {
        rejectUnauthorized: false,
      }
    : false,
});

pool.on("error", (erro) => {
  console.error("ERRO INESPERADO NO POOL POSTGRES:", erro.message);
});

// ==========================================
// VARIÁVEIS MERCADO LIVRE
// ==========================================

let mercadoLivreAccessToken = process.env.ML_ACCESS_TOKEN || null;

let mercadoLivreRefreshToken = process.env.ML_REFRESH_TOKEN || null;

let mercadoLivreTokenExpiresAt = process.env.ML_TOKEN_EXPIRES_AT
  ? Number(process.env.ML_TOKEN_EXPIRES_AT)
  : null;

let mercadoLivreUserId = process.env.ML_USER_ID || null;

// Evita várias renovações simultâneas
let renovacaoTokenEmAndamento = null;

// ==========================================
// CONFIGURAÇÕES PADRÃO
// ==========================================

const CATEGORIAS_PADRAO = [
  {
    nome: "Casa e decoração",
    busca: "casa decoração",
  },
  {
    nome: "Automotivo",
    busca: "acessórios automotivos",
  },
  {
    nome: "Ferramentas e construção",
    busca: "ferramentas",
  },
  {
    nome: "Eletrônicos e acessórios",
    busca: "eletrônicos acessórios",
  },
  {
    nome: "Segurança",
    busca: "câmera segurança",
  },
  {
    nome: "Utilidades domésticas",
    busca: "utilidades domésticas",
  },
  {
    nome: "Informática",
    busca: "informática",
  },
  {
    nome: "Celulares e acessórios",
    busca: "celular acessórios",
  },
];

const FILTROS_PADRAO = {
  precoMinimo: 0,
  precoMaximo: 100000,
  avaliacaoMinima: 0,
  vendasMinimas: 0,
  limitePorCategoria: 20,
  pontuacaoMinima: 0,
};

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function numeroSeguro(valor, padrao = 0) {
  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : padrao;
}

function normalizarPreco(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return "";
  }

  return String(valor);
}

function extrairAvaliacao(produto) {
  return numeroSeguro(
    produto?.seller?.seller_reputation?.transactions?.ratings?.positive,
    0
  );
}

function extrairVendas(produto) {
  return numeroSeguro(produto?.sold_quantity, 0);
}

function mascararToken(token) {
  if (!token) {
    return null;
  }

  const texto = String(token);

  if (texto.length <= 10) {
    return "***";
  }

  return texto.substring(0, 5) + "..." + texto.substring(texto.length - 5);
}

function obterRedirectUri() {
  return (
    process.env.ML_REDIRECT_URI ||
    "https://eletromax-v2-2.onrender.com/oauth/callback"
  );
}

// ==========================================
// CALCULAR PONTUAÇÃO
// ==========================================

function calcularPontuacao(produto) {
  let pontos = 0;

  const vendas = extrairVendas(produto);
  const reputacao = extrairAvaliacao(produto);

  if (reputacao >= 0.95) {
    pontos += 30;
  } else if (reputacao >= 0.9) {
    pontos += 20;
  } else if (reputacao >= 0.8) {
    pontos += 10;
  }

  if (vendas >= 1000) {
    pontos += 30;
  } else if (vendas >= 500) {
    pontos += 25;
  } else if (vendas >= 100) {
    pontos += 15;
  } else if (vendas >= 20) {
    pontos += 5;
  }

  if (produto?.shipping?.free_shipping) {
    pontos += 15;
  }

  if (produto?.official_store_id) {
    pontos += 15;
  }

  return pontos;
}

// ==========================================
// INICIALIZAR BANCO
// ==========================================

async function inicializarBanco() {
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL não configurada.");

    return false;
  }

  try {
    await pool.query("SELECT 1");

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
        nome TEXT,
        preco TEXT,
        preco_anterior TEXT,
        link TEXT,
        plataforma TEXT,
        imagem TEXT,
        categoria TEXT,
        avaliacao NUMERIC DEFAULT 0,
        vendas INTEGER DEFAULT 0,
        pontuacao NUMERIC DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS nome TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS preco TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS preco_anterior TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS link TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS plataforma TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS imagem TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS categoria TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS avaliacao NUMERIC DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS vendas INTEGER DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS pontuacao NUMERIC DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      UPDATE ofertas
      SET nome = 'Produto'
      WHERE nome IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET preco = ''
      WHERE preco IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET link = ''
      WHERE link IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET plataforma = 'Mercado Livre'
      WHERE plataforma IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET imagem = ''
      WHERE imagem IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET categoria = ''
      WHERE categoria IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET avaliacao = 0
      WHERE avaliacao IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET vendas = 0
      WHERE vendas IS NULL
    `);

    await pool.query(`
      UPDATE ofertas
      SET pontuacao = 0
      WHERE pontuacao IS NULL
    `);

    await pool.query(`
      DELETE FROM ofertas
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM ofertas
        WHERE link IS NOT NULL
          AND link <> ''
        GROUP BY link
      )
      AND link IS NOT NULL
      AND link <> ''
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ofertas_link_unico
      ON ofertas(link)
      WHERE link IS NOT NULL
        AND link <> ''
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS filtros_ofertas (
        id INTEGER PRIMARY KEY,
        preco_minimo NUMERIC DEFAULT 0,
        preco_maximo NUMERIC DEFAULT 100000,
        avaliacao_minima NUMERIC DEFAULT 0,
        vendas_minimas INTEGER DEFAULT 0,
        limite_por_categoria INTEGER DEFAULT 20,
        pontuacao_minima NUMERIC DEFAULT 0,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO filtros_ofertas
      (
        id
      )
      VALUES
      (
        1
      )
      ON CONFLICT (id)
      DO NOTHING
    `);

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

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS expires_at BIGINT
    `);

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS refresh_token TEXT
    `);

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `);

    await carregarTokenMercadoLivre();

    console.log("=================================");
    console.log("✅ BANCO DE DADOS CONECTADO");
    console.log("✅ TABELA PRODUTOS PRONTA");
    console.log("✅ TABELA OFERTAS MIGRADA");
    console.log("✅ TABELA CONFIGURAÇÕES PRONTA");
    console.log("✅ TABELA FILTROS PRONTA");
    console.log("✅ TOKENS MERCADO LIVRE PRONTOS");
    console.log("=================================");

    return true;
  } catch (erro) {
    console.error("=================================");
    console.error("❌ ERRO AO INICIALIZAR BANCO:");
    console.error(erro.message);
    console.error("=================================");

    return false;
  }
}

// ==========================================
// SALVAR TOKEN MERCADO LIVRE
// ==========================================

async function salvarTokenMercadoLivre({ userId, accessToken, refreshToken, expiresAt, }) {
  if (!accessToken) {
    throw new Error("Access token do Mercado Livre não informado.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL não configurada. Não é possível salvar o token."
    );
  }

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
        COALESCE(
          EXCLUDED.user_id,
          mercadolivre_tokens.user_id
        ),

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
    [userId || null, accessToken, refreshToken || null, expiresAt || null]
  );

  mercadoLivreAccessToken = accessToken;

  if (refreshToken) {
    mercadoLivreRefreshToken = refreshToken;
  }

  mercadoLivreTokenExpiresAt = expiresAt || null;

  if (userId) {
    mercadoLivreUserId = String(userId);
  }

  console.log("✅ TOKEN MERCADO LIVRE SALVO NO BANCO");

  console.log("USER ID:", mercadoLivreUserId);

  console.log("ACCESS TOKEN:", mascararToken(mercadoLivreAccessToken));

  console.log("REFRESH TOKEN:", mascararToken(mercadoLivreRefreshToken));

  console.log(
    "EXPIRA EM:",
    mercadoLivreTokenExpiresAt
      ? new Date(mercadoLivreTokenExpiresAt).toISOString()
      : "não informado"
  );
}

// ==========================================
// CARREGAR TOKEN
// ==========================================

async function carregarTokenMercadoLivre() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const resultado = await pool.query(`
        SELECT
          user_id,
          access_token,
          refresh_token,
          expires_at
        FROM mercadolivre_tokens
        WHERE id = 1
        LIMIT 1
      `);

    if (resultado.rowCount === 0) {
      console.log("NENHUM TOKEN DO MERCADO LIVRE SALVO.");

      return;
    }

    const token = resultado.rows[0];

    mercadoLivreUserId = token.user_id || null;

    mercadoLivreAccessToken = token.access_token || null;

    mercadoLivreRefreshToken = token.refresh_token || null;

    mercadoLivreTokenExpiresAt = token.expires_at
      ? Number(token.expires_at)
      : null;

    console.log("✅ TOKEN MERCADO LIVRE CARREGADO DO BANCO");

    console.log("USER ID:", mercadoLivreUserId);

    console.log("ACCESS TOKEN:", mascararToken(mercadoLivreAccessToken));

    console.log(
      "EXPIRA EM:",
      mercadoLivreTokenExpiresAt
        ? new Date(mercadoLivreTokenExpiresAt).toISOString()
        : "não informado"
    );
  } catch (erro) {
    console.error("ERRO AO CARREGAR TOKEN ML:", erro.message);
  }
}

// ==========================================
// RENOVAR TOKEN
// ==========================================

async function renovarTokenMercadoLivre() {
  if (renovacaoTokenEmAndamento) {
    console.log("♻️ Renovação de token já em andamento.");

    return await renovacaoTokenEmAndamento;
  }

  renovacaoTokenEmAndamento = (async () => {
    if (!mercadoLivreRefreshToken) {
      throw new Error("Refresh token do Mercado Livre não disponível.");
    }

    if (!process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) {
      throw new Error("ML_CLIENT_ID ou ML_CLIENT_SECRET não configurados.");
    }

    console.log("=================================");

    console.log("🔄 RENOVANDO TOKEN MERCADO LIVRE...");

    console.log("CLIENT ID:", process.env.ML_CLIENT_ID);

    console.log("REFRESH TOKEN:", mascararToken(mercadoLivreRefreshToken));

    const resposta = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },

      body: new URLSearchParams({
        grant_type: "refresh_token",

        client_id: process.env.ML_CLIENT_ID,

        client_secret: process.env.ML_CLIENT_SECRET,

        refresh_token: mercadoLivreRefreshToken,
      }).toString(),
    });

    const texto = await resposta.text();

    let dados = {};

    try {
      dados = texto ? JSON.parse(texto) : {};
    } catch {
      dados = {
        raw: texto,
      };
    }

    if (!resposta.ok) {
      console.error("❌ ERRO AO RENOVAR TOKEN:", {
        status: resposta.status,

        statusText: resposta.statusText,

        dados,
      });

      throw new Error(
        dados.message ||
          dados.error_description ||
          dados.error ||
          `Erro ao renovar token do Mercado Livre (${resposta.status}).`
      );
    }

    if (!dados.access_token) {
      throw new Error("Mercado Livre não retornou um novo access_token.");
    }

    const expiresAt = dados.expires_in
      ? Date.now() + Number(dados.expires_in) * 1000
      : null;

    await salvarTokenMercadoLivre({
      userId: mercadoLivreUserId,

      accessToken: dados.access_token,

      refreshToken: dados.refresh_token || mercadoLivreRefreshToken,

      expiresAt,
    });

    console.log("✅ TOKEN MERCADO LIVRE RENOVADO COM SUCESSO");

    return dados.access_token;
  })();

  try {
    return await renovacaoTokenEmAndamento;
  } finally {
    renovacaoTokenEmAndamento = null;
  }
}

// ==========================================
// OBTER TOKEN VÁLIDO
// ==========================================

async function obterTokenMercadoLivre(forcarRenovacao = false) {
  if (!mercadoLivreAccessToken && process.env.DATABASE_URL) {
    await carregarTokenMercadoLivre();
  }

  if (!mercadoLivreAccessToken) {
    throw new Error("Mercado Livre não está conectado.");
  }

  const tokenPrestesAExpirar =
    mercadoLivreTokenExpiresAt &&
    Date.now() > mercadoLivreTokenExpiresAt - 5 * 60 * 1000;

  if (forcarRenovacao && mercadoLivreRefreshToken) {
    return await renovarTokenMercadoLivre();
  }

  if (tokenPrestesAExpirar && mercadoLivreRefreshToken) {
    return await renovarTokenMercadoLivre();
  }

  return mercadoLivreAccessToken;
}

// ==========================================
// CONSULTAR USUÁRIO DO MERCADO LIVRE
// ==========================================

async function consultarUsuarioMercadoLivre(token) {
  const resposta = await fetch("https://api.mercadolibre.com/users/me", {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,

      Accept: "application/json",
    },
  });

  const texto = await resposta.text();

  let dados = {};

  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    dados = {
      raw: texto,
    };
  }

  return {
    resposta,
    dados,
  };
}

```js
// ==========================================
// BUSCAR NO MERCADO LIVRE
// VERSÃO CORRIGIDA - BUSCA PÚBLICA
// ==========================================

async function buscarMercadoLivre(busca, limite = 20) {
  const termo = String(busca || "").trim();

  if (!termo) {
    const erro = new Error("Informe o termo de busca.");
    erro.status = 400;
    erro.code = "ML_SEARCH_INVALID";
    throw erro;
  }

  const quantidade = Math.min(
    Math.max(Number(limite) || 20, 1),
    50
  );

  // ========================================
  // URL DA BUSCA PÚBLICA
  // ========================================

  const url = new URL(
    "https://api.mercadolibre.com/sites/MLB/search"
  );

  url.searchParams.set("q", termo);
  url.searchParams.set("limit", String(quantidade));

  console.log("=================================");
  console.log("🔎 BUSCA PÚBLICA MERCADO LIVRE");
  console.log("TERMO:", termo);
  console.log("LIMITE:", quantidade);
  console.log("URL:", url.toString());
  console.log("=================================");

  // ========================================
  // IMPORTANTE:
  // A busca geral de produtos não depende
  // do OAuth do usuário.
  //
  // NÃO enviar Authorization aqui.
  // Isso evita que um token do seller seja
  // usado indevidamente em uma busca pública.
  // ========================================

  let resposta;

  try {
    resposta = await fetch(url.toString(), {
      method: "GET",

      headers: {
        Accept: "application/json",
        "User-Agent": "Eletromax-V2/2.0",
      },
    });
  } catch (erroFetch) {
    console.error(
      "❌ ERRO DE CONEXÃO COM MERCADO LIVRE:",
      erroFetch.message
    );

    const erro = new Error(
      "Não foi possível conectar à API do Mercado Livre."
    );

    erro.status = 502;
    erro.code = "ML_CONNECTION_ERROR";
    erro.dados = {
      message: erroFetch.message,
    };

    throw erro;
  }

  // ========================================
  // LER RESPOSTA
  // ========================================

  const textoResposta = await resposta.text();

  let dados = {};

  try {
    dados = textoResposta
      ? JSON.parse(textoResposta)
      : {};
  } catch {
    dados = {
      raw: textoResposta,
    };
  }

  console.log(
    "STATUS MERCADO LIVRE:",
    resposta.status
  );

  // ========================================
  // SUCESSO
  // ========================================

  if (resposta.ok) {
    const totalResultados = Array.isArray(dados.results)
      ? dados.results.length
      : 0;

    console.log(
      "✅ BUSCA MERCADO LIVRE REALIZADA COM SUCESSO"
    );

    console.log(
      "RESULTADOS RECEBIDOS:",
      totalResultados
    );

    return dados;
  }

  // ========================================
  // 403
  // ========================================

  if (resposta.status === 403) {
    console.error(
      "❌ MERCADO LIVRE RETORNOU 403 NA BUSCA PÚBLICA"
    );

    console.error(
      "RESPOSTA:",
      JSON.stringify(dados, null, 2)
    );

    const erro = new Error(
      dados.message ||
      dados.error_description ||
      dados.error ||
      "O Mercado Livre bloqueou a busca pública."
    );

    erro.status = 403;
    erro.code = "ML_FORBIDDEN";
    erro.dados = dados;

    throw erro;
  }

  // ========================================
  // 429 - RATE LIMIT
  // ========================================

  if (resposta.status === 429) {
    console.error(
      "⚠️ MERCADO LIVRE LIMITOU AS REQUISIÇÕES"
    );

    const erro = new Error(
      dados.message ||
      dados.error ||
      "Limite de requisições do Mercado Livre atingido."
    );

    erro.status = 429;
    erro.code = "ML_RATE_LIMIT";
    erro.dados = dados;

    throw erro;
  }

  // ========================================
  // OUTROS ERROS
  // ========================================

  const erro = new Error(
    dados.message ||
    dados.error_description ||
    dados.error ||
    `Erro na API do Mercado Livre (${resposta.status}).`
  );

  erro.status = resposta.status;
  erro.code = "ML_SEARCH_ERROR";
  erro.dados = dados;

  throw erro;
}
```


  // ========================================
  // OBTER TOKEN VÁLIDO
  // ========================================

  const token = await obterTokenMercadoLivre();

  if (!token) {
    const erro = new Error("Token do Mercado Livre não disponível.");

    erro.code = "ML_TOKEN_INVALID";

    erro.status = 401;

    throw erro;
  }

  // ========================================
  // URL DA BUSCA
  // ========================================

  const url = new URL("https://api.mercadolibre.com/sites/MLB/search");

  url.searchParams.set("q", termo);

  url.searchParams.set("limit", String(quantidade));

  // ========================================
  // EXECUTAR BUSCA
  // ========================================

  console.log("=================================");

  console.log("BUSCANDO NO MERCADO LIVRE");

  console.log("TERMO:", termo);

  console.log("LIMITE:", quantidade);

  console.log("URL:", url.toString());

  console.log("TOKEN DISPONÍVEL:", Boolean(token));

  console.log("=================================");

  const resposta = await fetch(url.toString(), {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,

      Accept: "application/json",

      "User-Agent": "Eletromax-V2/2.0",
    },
  });

  // ========================================
  // LER RESPOSTA
  // ========================================

  const textoResposta = await resposta.text();

  let dados = {};

  try {
    dados = textoResposta ? JSON.parse(textoResposta) : {};
  } catch (erroJson) {
    dados = {
      raw: textoResposta,
    };
  }

  console.log("STATUS MERCADO LIVRE:", resposta.status);

  // ========================================
  // RESPOSTA COM SUCESSO
  // ========================================

  if (resposta.ok) {
    console.log("✅ BUSCA MERCADO LIVRE REALIZADA COM SUCESSO");

    console.log(
      "RESULTADOS:",
      Array.isArray(dados.results) ? dados.results.length : 0
    );

    return dados;
  }

  // ========================================
  // TOKEN INVÁLIDO
  // ========================================

  if (resposta.status === 401) {
    console.error("❌ TOKEN MERCADO LIVRE INVÁLIDO OU EXPIRADO");

    // Tentar renovar automaticamente
    if (mercadoLivreRefreshToken) {
      try {
        console.log("🔄 TENTANDO RENOVAR TOKEN...");

        const novoToken = await renovarTokenMercadoLivre();

        if (novoToken) {
          console.log("🔄 REPETINDO BUSCA COM NOVO TOKEN...");

          const segundaResposta = await fetch(url.toString(), {
            method: "GET",

            headers: {
              Authorization: `Bearer ${novoToken}`,

              Accept: "application/json",

              "User-Agent": "Eletromax-V2/2.0",
            },
          });

          const segundaTexto = await segundaResposta.text();

          let segundaDados = {};

          try {
            segundaDados = segundaTexto ? JSON.parse(segundaTexto) : {};
          } catch (erroJson) {
            segundaDados = {
              raw: segundaTexto,
            };
          }

          if (segundaResposta.ok) {
            console.log("✅ BUSCA FUNCIONOU APÓS RENOVAÇÃO DO TOKEN");

            return segundaDados;
          }

          console.error(
            "❌ BUSCA CONTINUOU FALHANDO APÓS RENOVAÇÃO:",
            segundaResposta.status,
            segundaDados
          );
        }
      } catch (erroRenovacao) {
        console.error("❌ ERRO AO RENOVAR TOKEN:", erroRenovacao.message);
      }
    }

    const erro = new Error(
      dados.message ||
        dados.error_description ||
        dados.error ||
        "Token do Mercado Livre inválido ou expirado."
    );

    erro.status = 401;

    erro.code = "ML_TOKEN_INVALID";

    erro.dados = dados;

    throw erro;
  }

  // ========================================
  // ACESSO NEGADO
  // ========================================

  if (resposta.status === 403) {
    console.error("❌ MERCADO LIVRE RETORNOU 403 FORBIDDEN");

    console.error("RESPOSTA:", dados);

    const erro = new Error(
      dados.message ||
        dados.error_description ||
        dados.error ||
        "O Mercado Livre recusou o acesso à consulta."
    );

    erro.status = 403;

    erro.code = "ML_FORBIDDEN";

    erro.dados = dados;

    throw erro;
  }

  // ========================================
  // OUTROS ERROS DA API
  // ========================================

  const erro = new Error(
    dados.message ||
      dados.error_description ||
      dados.error ||
      `Erro na API do Mercado Livre (${resposta.status}).`
  );

  erro.status = resposta.status;

  erro.code = "ML_SEARCH_ERROR";

  erro.dados = dados;

  throw erro;
}

// ==========================================
// STATUS DO SISTEMA
// ==========================================

app.get("/api/status", async (req, res) => {
  try {
    let banco = "disconnected";

    if (process.env.DATABASE_URL) {
      await pool.query("SELECT NOW()");

      banco = "connected";
    }

    res.json({
      success: true,

      status: "online",

      database: banco,

      mercadolivre: mercadoLivreAccessToken ? "connected" : "not_connected",

      motorOfertas: "active",

      geradorPosts: "active",
    });
  } catch (erro) {
    res.status(500).json({
      success: false,

      status: "offline",

      database: "disconnected",

      message: erro.message,
    });
  }
});

// ==========================================
// DASHBOARD
// ==========================================

app.get("/api/dashboard", async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      success: false,

      message: "Banco de dados não configurado.",
    });
  }

  try {
    const produtos = await pool.query(`
          SELECT COUNT(*)::int AS total
          FROM produtos
        `);

    const ofertas = await pool.query(`
          SELECT COUNT(*)::int AS total
          FROM ofertas
        `);

    const mercadoLivre = await pool.query(`
          SELECT COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = 'Mercado Livre'
        `);

    const shopee = await pool.query(`
          SELECT COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = 'Shopee'
        `);

    res.json({
      success: true,

      totalProdutos: produtos.rows[0].total,

      totalOfertas: ofertas.rows[0].total,

      totalMercadoLivre: mercadoLivre.rows[0].total,

      totalShopee: shopee.rows[0].total,
    });
  } catch (erro) {
    res.status(500).json({
      success: false,

      message: "Erro ao carregar dashboard.",

      error: erro.message,
    });
  }
});

// ==========================================
// PRODUTOS - LISTAR
// ==========================================

app.get("/api/produtos", async (req, res) => {
  try {
    const resultado = await pool.query(`
          SELECT
            id,
            nome,
            preco,
            link,
            plataforma,
            criado_em
          FROM produtos
          ORDER BY id DESC
        `);

    res.json({
      success: true,

      produtos: resultado.rows,
    });
  } catch (erro) {
    res.status(500).json({
      success: false,

      message: "Erro ao buscar produtos.",

      error: erro.message,
    });
  }
});

// ==========================================
// PRODUTOS - CADASTRAR
// ==========================================

app.post("/api/produtos", async (req, res) => {
  try {
    const { nome, preco, link, plataforma } = req.body;

    if (!nome || !link || !plataforma) {
      return res.status(400).json({
        success: false,

        message: "Nome, link e plataforma são obrigatórios.",
      });
    }

    const nomeFinal = String(nome).trim();

    const linkFinal = String(link).trim();

    const plataformaFinal = String(plataforma).trim();

    if (!nomeFinal || !linkFinal || !plataformaFinal) {
      return res.status(400).json({
        success: false,

        message: "Os campos obrigatórios não podem estar vazios.",
      });
    }

    const resultado = await pool.query(
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
      [nomeFinal, normalizarPreco(preco), linkFinal, plataformaFinal]
    );

    res.status(201).json({
      success: true,

      message: "Produto salvo com sucesso!",

      produto: resultado.rows[0],
    });
  } catch (erro) {
    console.error("ERRO AO SALVAR PRODUTO:", erro.message);

    res.status(500).json({
      success: false,

      message: "Erro ao salvar produto.",

      error: erro.message,
    });
  }
});

// ==========================================
// PRODUTOS - EXCLUIR
// ==========================================

app.delete("/api/produtos/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,

        message: "ID inválido.",
      });
    }

    const resultado = await pool.query(
      `
          DELETE FROM produtos
          WHERE id = $1
          RETURNING id
          `,
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        success: false,

        message: "Produto não encontrado.",
      });
    }

    res.json({
      success: true,

      message: "Produto excluído com sucesso.",
    });
  } catch (erro) {
    res.status(500).json({
      success: false,

      message: "Erro ao excluir produto.",

      error: erro.message,
    });
  }
});

// ==========================================
// OFERTAS - LISTAR
// ==========================================

app.get("/api/ofertas", async (req, res) => {
  try {
    const resultado = await pool.query(`
          SELECT
            id,
            nome,
            preco,
            preco_anterior AS "precoAnterior",
            link,
            plataforma,
            imagem,
            categoria,
            avaliacao,
            vendas,
            pontuacao,
            criado_em
          FROM ofertas
          ORDER BY
            pontuacao DESC,
            id DESC
        `);

    res.json({
      success: true,

      ofertas: resultado.rows,
    });
  } catch (erro) {
    res.status(500).json({
      success: false,

      message: "Erro ao buscar ofertas.",

      error: erro.message,
    });
  }
});

// ==========================================
// FILTROS - BUSCAR
// ==========================================

app.get("/api/ofertas/filtros", async (req, res) => {
  try {
    const resultado = await pool.query(`
          SELECT
            preco_minimo AS "precoMinimo",
            preco_maximo AS "precoMaximo",
            avaliacao_minima AS "avaliacaoMinima",
            vendas_minimas AS "vendasMinimas",
            limite_por_categoria AS "limitePorCategoria",
            pontuacao_minima AS "pontuacaoMinima"
          FROM filtros_ofertas
          WHERE id = 1
          LIMIT 1
        `);

    res.json({
      success: true,

      filtros: resultado.rows[0] || FILTROS_PADRAO,
    });
  } catch (erro) {
    res.status(500).json({
      success: false,

      message: "Erro ao buscar filtros.",

      error: erro.message,
    });
  }
});

// ==========================================
// FILTROS - SALVAR
// ==========================================

app.put("/api/ofertas/filtros", async (req, res) => {
  try {
    const {
      precoMinimo,
      precoMaximo,
      avaliacaoMinima,
      vendasMinimas,
      limitePorCategoria,
      pontuacaoMinima,
    } = req.body;

    const minimo = numeroSeguro(precoMinimo, 0);

    const maximo = numeroSeguro(precoMaximo, 100000);

    const avaliacao = numeroSeguro(avaliacaoMinima, 0);

    const vendas = numeroSeguro(vendasMinimas, 0);

    const limite = Math.min(
      Math.max(Math.trunc(numeroSeguro(limitePorCategoria, 20)), 1),
      50
    );

    const pontuacao = numeroSeguro(pontuacaoMinima, 0);

    await pool.query(
      `
        INSERT INTO filtros_ofertas
        (
          id,
          preco_minimo,
          preco_maximo,
          avaliacao_minima,
          vendas_minimas,
          limite_por_categoria,
          pontuacao_minima,
          atualizado_em
        )
        VALUES
        (
          1,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id)
        DO UPDATE SET
          preco_minimo =
            EXCLUDED.preco_minimo,

          preco_maximo =
            EXCLUDED.preco_maximo,

          avaliacao_minima =
            EXCLUDED.avaliacao_minima,

          vendas_minimas =
            EXCLUDED.vendas_minimas,

          limite_por_categoria =
            EXCLUDED.limite_por_categoria,

          pontuacao_minima =
            EXCLUDED.pontuacao_minima,

          atualizado_em =
            CURRENT_TIMESTAMP
        `,
      [minimo, maximo, avaliacao, vendas, limite, pontuacao]
    );

    res.json({
      success: true,

      message: "Filtros salvos com sucesso.",

      filtros: {
        precoMinimo: minimo,

        precoMaximo: maximo,

        avaliacaoMinima: avaliacao,

        vendasMinimas: vendas,

        limitePorCategoria: limite,

        pontuacaoMinima: pontuacao,
      },
    });
  } catch (erro) {
    console.error("ERRO AO SALVAR FILTROS:", erro.message);

    res.status(500).json({
      success: false,

      message: "Erro ao salvar filtros.",

      error: erro.message,
    });
  }
});

// ==========================================
// OBTER FILTROS
// ==========================================

async function obterFiltros() {
  const resultado = await pool.query(`
      SELECT
        preco_minimo,
        preco_maximo,
        avaliacao_minima,
        vendas_minimas,
        limite_por_categoria,
        pontuacao_minima
      FROM filtros_ofertas
      WHERE id = 1
      LIMIT 1
    `);

  if (resultado.rowCount === 0) {
    return {
      ...FILTROS_PADRAO,
    };
  }

  const f = resultado.rows[0];

  return {
    precoMinimo: numeroSeguro(f.preco_minimo, 0),

    precoMaximo: numeroSeguro(f.preco_maximo, 100000),

    avaliacaoMinima: numeroSeguro(f.avaliacao_minima, 0),

    vendasMinimas: numeroSeguro(f.vendas_minimas, 0),

    limitePorCategoria: numeroSeguro(f.limite_por_categoria, 20),

    pontuacaoMinima: numeroSeguro(f.pontuacao_minima, 0),
  };
}

// ==========================================
// ANALISAR PRODUTO
// ==========================================

function analisarProduto(produto, categoria, filtros) {
  const preco = numeroSeguro(produto.price, 0);

  const vendas = extrairVendas(produto);

  const avaliacao = extrairAvaliacao(produto);

  const pontuacao = calcularPontuacao(produto);

  if (preco < filtros.precoMinimo) {
    return {
      aprovado: false,

      motivo: "Preço abaixo do mínimo.",
    };
  }

  if (preco > filtros.precoMaximo) {
    return {
      aprovado: false,

      motivo: "Preço acima do máximo.",
    };
  }

  if (avaliacao < filtros.avaliacaoMinima) {
    return {
      aprovado: false,

      motivo: "Avaliação abaixo do mínimo.",
    };
  }

  if (vendas < filtros.vendasMinimas) {
    return {
      aprovado: false,

      motivo: "Vendas abaixo do mínimo.",
    };
  }

  if (pontuacao < filtros.pontuacaoMinima) {
    return {
      aprovado: false,

      motivo: "Pontuação abaixo do mínimo.",
    };
  }

  return {
    aprovado: true,

    produto: {
      nome: produto.title || "Produto",

      preco: preco,

      precoAnterior: null,

      link: produto.permalink || "",

      imagem: produto.thumbnail || "",

      plataforma: "Mercado Livre",

      categoria: categoria.nome,

      avaliacao: avaliacao,

      vendas: vendas,

      pontuacao: pontuacao,
    },
  };
}

// ==========================================
// SALVAR OFERTA
// ==========================================

async function salvarOferta(oferta) {
  if (!oferta || !oferta.link) {
    return false;
  }

  const resultado = await pool.query(
    `
      INSERT INTO ofertas
      (
        nome,
        preco,
        preco_anterior,
        link,
        plataforma,
        imagem,
        categoria,
        avaliacao,
        vendas,
        pontuacao
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10
      )
      ON CONFLICT (link)
      DO UPDATE SET
        nome =
          EXCLUDED.nome,

        preco =
          EXCLUDED.preco,

        preco_anterior =
          COALESCE(
            EXCLUDED.preco_anterior,
            ofertas.preco_anterior
          ),

        imagem =
          EXCLUDED.imagem,

        categoria =
          EXCLUDED.categoria,

        avaliacao =
          EXCLUDED.avaliacao,

        vendas =
          EXCLUDED.vendas,

        pontuacao =
          EXCLUDED.pontuacao

      RETURNING id
      `,
    [
      oferta.nome || "Produto",

      normalizarPreco(oferta.preco),

      oferta.precoAnterior || null,

      oferta.link,

      oferta.plataforma || "Mercado Livre",

      oferta.imagem || "",

      oferta.categoria || "",

      numeroSeguro(oferta.avaliacao, 0),

      Math.trunc(numeroSeguro(oferta.vendas, 0)),

      numeroSeguro(oferta.pontuacao, 0),
    ]
  );

  return resultado.rowCount > 0;
}

// ==========================================
// OAUTH MERCADO LIVRE - CALLBACK
// ==========================================

app.get("/api/mercadolivre/callback", (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  return res.redirect(`/oauth/callback${query ? `?${query}` : ""}`);
});

app.get("/oauth/callback", async (req, res) => {
  try {
    const code = req.query.code;

    const error = req.query.error;

    if (error) {
      return res.status(400).send(`
          <h2>❌ Erro na autorização do Mercado Livre</h2>
          <p>Erro: ${String(error)}</p>
          <p>Descrição: ${String(
            req.query.error_description || "Não informado"
          )}</p>
        `);
    }

    if (!code) {
      return res.status(400).send("Código OAuth não recebido.");
    }

    if (!process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) {
      return res
        .status(500)
        .send("ML_CLIENT_ID ou ML_CLIENT_SECRET não configurados.");
    }

    const redirectUri = obterRedirectUri();

    console.log("=================================");

    console.log("🔐 CALLBACK OAUTH MERCADO LIVRE");

    console.log("CLIENT ID:", process.env.ML_CLIENT_ID);

    console.log("REDIRECT URI:", redirectUri);

    console.log("CODE RECEBIDO:", code ? "SIM" : "NÃO");

    console.log("=================================");

    const resposta = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded",

        Accept: "application/json",
      },

      body: new URLSearchParams({
        grant_type: "authorization_code",

        client_id: process.env.ML_CLIENT_ID,

        client_secret: process.env.ML_CLIENT_SECRET,

        code: code,

        redirect_uri: redirectUri,
      }).toString(),
    });

    const texto = await resposta.text();

    let dados = {};

    try {
      dados = texto ? JSON.parse(texto) : {};
    } catch {
      dados = {
        raw: texto,
      };
    }

    if (!resposta.ok) {
      console.error("❌ ERRO OAUTH ML:", {
        status: resposta.status,

        statusText: resposta.statusText,

        dados,
      });

      return res.status(resposta.status).send(`
          <h2>❌ Erro ao conectar Mercado Livre</h2>

          <p>Status: ${resposta.status}</p>

          <pre>${JSON.stringify(dados, null, 2)}</pre>

          <p>
            Confira ML_CLIENT_ID,
            ML_CLIENT_SECRET e ML_REDIRECT_URI.
          </p>
        `);
    }

    if (!dados.access_token) {
      return res.status(500).send("Mercado Livre não retornou access_token.");
    }

    await salvarTokenMercadoLivre({
      userId: dados.user_id,

      accessToken: dados.access_token,

      refreshToken: dados.refresh_token,

      expiresAt: dados.expires_in
        ? Date.now() + Number(dados.expires_in) * 1000
        : null,
    });

    // Validação imediata do token
    let validacao = null;

    try {
      validacao = await consultarUsuarioMercadoLivre(dados.access_token);

      console.log("VALIDAÇÃO TOKEN ML:", validacao.resposta.status);
    } catch (erroValidacao) {
      console.error("ERRO AO VALIDAR TOKEN:", erroValidacao.message);
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Mercado Livre conectado</title>
        </head>
        <body>
          <h2>✅ Mercado Livre conectado!</h2>

          <p>
            Usuário:
            ${dados.user_id || "não informado"}
          </p>

          <p>
            Token salvo com sucesso.
          </p>

          <p>
            Validação da API:
            ${validacao ? validacao.resposta.status : "não realizada"}
          </p>

          <p>
            Você já pode voltar ao painel Eletromax V2.
          </p>
        </body>
        </html>
      `);
  } catch (erro) {
    console.error("ERRO CALLBACK ML:", erro);

    res
      .status(500)
      .send("Erro interno ao conectar Mercado Livre: " + erro.message);
  }
});

// ==========================================
// STATUS MERCADO LIVRE
// ==========================================

app.get("/api/mercadolivre/login", (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = obterRedirectUri();

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      success: false,
      message: "ML_CLIENT_ID e ML_REDIRECT_URI precisam estar configurados.",
    });
  }

  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  return res.redirect(url.toString());
});

app.get("/api/mercadolivre/status", async (req, res) => {
  try {
    if (!mercadoLivreAccessToken && process.env.DATABASE_URL) {
      await carregarTokenMercadoLivre();
    }

    res.json({
      success: true,

      conectado: Boolean(mercadoLivreAccessToken),

      configurado: Boolean(
        process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET
      ),

      redirectUri: obterRedirectUri(),

      userId: mercadoLivreUserId || null,

      tokenExpiraEm: mercadoLivreTokenExpiresAt
        ? new Date(mercadoLivreTokenExpiresAt).toISOString()
        : null,

      temRefreshToken: Boolean(mercadoLivreRefreshToken),
    });
  } catch (erro) {
    console.error("ERRO STATUS MERCADO LIVRE:", erro.message);

    res.status(500).json({
      success: false,

      conectado: false,

      message: erro.message,
    });
  }
});

// ==========================================
// TESTAR TOKEN MERCADO LIVRE
// ==========================================

app.get("/api/mercadolivre/teste", async (req, res) => {
  try {
    let token = await obterTokenMercadoLivre();

    let resultado = await consultarUsuarioMercadoLivre(token);

    // Se o token foi rejeitado,
    // tenta renovar uma única vez.
    if (resultado.resposta.status === 401 && mercadoLivreRefreshToken) {
      console.warn("⚠️ TESTE ML: TOKEN 401. RENOVANDO...");

      token = await renovarTokenMercadoLivre();

      resultado = await consultarUsuarioMercadoLivre(token);
    }

    const resposta = resultado.resposta;

    const dados = resultado.dados;

    if (!resposta.ok) {
      return res.status(resposta.status).json({
        success: false,

        status: resposta.status,

        code:
          resposta.status === 401
            ? "ML_TOKEN_INVALID"
            : resposta.status === 403
            ? "ML_FORBIDDEN"
            : "ML_API_ERROR",

        message:
          dados.message || dados.error || "Mercado Livre recusou a requisição.",

        dados: dados,
      });
    }

    if (dados.id && !mercadoLivreUserId) {
      mercadoLivreUserId = String(dados.id);
    }

    res.json({
      success: true,

      status: resposta.status,

      conectado: true,

      userId: dados.id || mercadoLivreUserId || null,

      nickname: dados.nickname || null,

      dados: dados,
    });
  } catch (erro) {
    console.error("ERRO TESTE ML:", erro);

    res.status(erro.status || 500).json({
      success: false,

      code: erro.code || "ML_TEST_ERROR",

      erro: erro.message,

      detalhes: erro.mlResponse || null,
    });
  }
});

// ==========================================
// BUSCAR E SALVAR OFERTAS ML
// ==========================================

// ==========================================
// MERCADO LIVRE - BUSCAR E SALVAR (POST)
// ==========================================

app.post("/api/mercadolivre/buscar-salvar", async (req, res) => {
  const busca = String(req.body?.q || "").trim();
  const limite = Math.min(Math.max(Number(req.body?.limit || 20), 1), 50);

  if (!busca) {
    return res.status(400).json({
      success: false,
      message: "Informe o termo de busca.",
    });
  }

  try {
    const dados = await buscarMercadoLivre(busca, limite);
    const produtos = Array.isArray(dados?.results) ? dados.results : [];
    let salvos = 0;
    let atualizados = 0;

    for (const produto of produtos) {
      if (!produto?.permalink) continue;

      const oferta = {
        nome: produto.title || "Produto",
        preco: produto.price || 0,
        precoAnterior: null,
        link: produto.permalink,
        plataforma: "Mercado Livre",
        imagem: produto.thumbnail || "",
        categoria: "Busca manual",
        avaliacao: extrairAvaliacao(produto),
        vendas: extrairVendas(produto),
        pontuacao: calcularPontuacao(produto),
      };

      const antes = await pool.query(
        `SELECT id FROM ofertas WHERE link = $1 LIMIT 1`,
        [oferta.link]
      );

      const existia = antes.rowCount > 0;
      const salvo = await salvarOferta(oferta);

      if (salvo) {
        if (existia) atualizados++;
        else salvos++;
      }
    }

    return res.json({
      success: true,
      encontrados: produtos.length,
      salvos,
      atualizados,
      totalProcessados: salvos + atualizados,
      message: `${salvos} novas ofertas salvas e ${atualizados} ofertas atualizadas.`,
    });
  } catch (erro) {
    console.error("ERRO BUSCAR E SALVAR ML:", erro);
    return res.status(erro.status || 500).json({
      success: false,
      message: erro.message || "Erro ao buscar e salvar ofertas.",
      code: erro.code || "ML_SEARCH_ERROR",
      detalhes: erro.dados || erro.mlResponse || null,
    });
  }
});

// ==========================================
// MERCADO LIVRE - BUSCAR E SALVAR (GET)
// Compatibilidade com testes pelo navegador
// ==========================================

app.get("/api/mercadolivre/buscar-salvar", async (req, res) => {
  const busca = String(req.query?.q || "").trim();
  const limite = Math.min(Math.max(Number(req.query?.limit || 20), 1), 50);

  if (!busca) {
    return res.status(400).json({
      success: false,
      message: "Informe o termo de busca. Exemplo: ?q=camera",
    });
  }

  try {
    const dados = await buscarMercadoLivre(busca, limite);
    const produtos = Array.isArray(dados?.results) ? dados.results : [];
    let salvos = 0;
    let atualizados = 0;

    for (const produto of produtos) {
      if (!produto?.permalink) continue;

      const oferta = {
        nome: produto.title || "Produto",
        preco: produto.price || 0,
        precoAnterior: null,
        link: produto.permalink,
        plataforma: "Mercado Livre",
        imagem: produto.thumbnail || "",
        categoria: "Busca manual",
        avaliacao: extrairAvaliacao(produto),
        vendas: extrairVendas(produto),
        pontuacao: calcularPontuacao(produto),
      };

      const antes = await pool.query(
        `SELECT id FROM ofertas WHERE link = $1 LIMIT 1`,
        [oferta.link]
      );

      const existia = antes.rowCount > 0;
      const salvo = await salvarOferta(oferta);

      if (salvo) {
        if (existia) atualizados++;
        else salvos++;
      }
    }

    return res.json({
      success: true,
      encontrados: produtos.length,
      salvos,
      atualizados,
      totalProcessados: salvos + atualizados,
      message: `${salvos} novas ofertas salvas e ${atualizados} ofertas atualizadas.`,
      ofertas: produtos.map((produto) => ({
        id: produto.id || null,
        nome: produto.title || "Produto",
        preco: produto.price || 0,
        link: produto.permalink || "",
        imagem: produto.thumbnail || "",
        plataforma: "Mercado Livre",
        avaliacao: extrairAvaliacao(produto),
        vendas: extrairVendas(produto),
        pontuacao: calcularPontuacao(produto),
      })),
    });
  } catch (erro) {
    console.error("ERRO BUSCA GET MERCADO LIVRE:", erro);
    return res.status(erro.status || 500).json({
      success: false,
      message: erro.message || "Erro ao buscar ofertas no Mercado Livre.",
      code: erro.code || "ML_SEARCH_ERROR",
      detalhes: erro.dados || erro.mlResponse || null,
    });
  }
});

// ==========================================
// MOTOR AUTOMÁTICO
// ==========================================

app.post("/api/ofertas/buscar-automaticamente", async (req, res) => {
  try {
    const filtros = await obterFiltros();

    let encontrados = 0;

    let aprovados = 0;

    let salvos = 0;

    let atualizados = 0;

    const ofertas = [];

    for (const categoria of CATEGORIAS_PADRAO) {
      console.log("=================================");

      console.log("BUSCA AUTOMÁTICA:", categoria.nome);

      try {
        const dados = await buscarMercadoLivre(
          categoria.busca,
          Math.min(filtros.limitePorCategoria, 50)
        );

        const produtos = Array.isArray(dados.results) ? dados.results : [];

        encontrados += produtos.length;

        for (const produto of produtos) {
          const analise = analisarProduto(produto, categoria, filtros);

          if (!analise.aprovado) {
            continue;
          }

          aprovados++;

          const oferta = analise.produto;

          const antes = await pool.query(
            `
                SELECT id
                FROM ofertas
                WHERE link = $1
                LIMIT 1
                `,
            [oferta.link]
          );

          const existia = antes.rowCount > 0;

          const salvo = await salvarOferta(oferta);

          if (salvo) {
            if (existia) {
              atualizados++;
            } else {
              salvos++;
            }

            ofertas.push(oferta);
          }
        }
      } catch (erroCategoria) {
        console.error(
          "ERRO NA CATEGORIA:",
          categoria.nome,
          erroCategoria.message
        );

        // Se for erro de autenticação,
        // interrompe para não repetir o erro
        if (
          erroCategoria.code === "ML_TOKEN_INVALID" ||
          erroCategoria.code === "ML_FORBIDDEN"
        ) {
          throw erroCategoria;
        }
      }
    }

    ofertas.sort((a, b) => Number(b.pontuacao) - Number(a.pontuacao));

    res.json({
      success: true,

      message: "Busca automática concluída.",

      encontrados: encontrados,

      aprovados: aprovados,

      salvos: salvos,

      atualizados: atualizados,

      totalProcessados: salvos + atualizados,

      ofertas: ofertas,
    });
  } catch (erro) {
    console.error("ERRO MOTOR AUTOMÁTICO:", erro);

    res.status(erro.status || 500).json({
      success: false,

      message: erro.message || "Erro ao executar busca automática.",

      code: erro.code || "ML_AUTOMATIC_SEARCH_ERROR",

      detalhes: erro.mlResponse || null,
    });
  }
});

// ==========================================
// GERAR POST INDIVIDUAL
// ==========================================

app.post("/api/ofertas/gerar-post", async (req, res) => {
  try {
    const { nome, preco, precoAnterior, plataforma, link, categoria } =
      req.body;

    if (!nome) {
      return res.status(400).json({
        success: false,

        message: "Nome do produto é obrigatório.",
      });
    }

    const texto = `🔥 OFERTA IMPERDÍVEL!

📦 ${nome}

${categoria ? `🏷️ Categoria: ${categoria}\n` : ""}${
      precoAnterior ? `💸 De: ${precoAnterior}\n` : ""
    }💰 Por apenas: ${preco || "Consulte o preço"}

🛒 Compre aqui:
${link || "Link não informado"}

${plataforma ? `🛍️ Plataforma: ${plataforma}\n` : ""}
⚡ Eletromax
🔥 Ofertas selecionadas para você!`;

    res.json({
      success: true,

      texto: texto,
    });
  } catch (erro) {
    console.error("ERRO GERAR POST:", erro);

    res.status(500).json({
      success: false,

      message: "Erro ao gerar post.",

      error: erro.message,
    });
  }
});

// ==========================================
// MELHORES OFERTAS
// ==========================================

app.get("/api/ofertas/gerar-post-melhores", async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit || 10), 1), 20);

    const resultado = await pool.query(
      `
          SELECT
            nome,
            preco,
            preco_anterior AS "precoAnterior",
            link,
            plataforma,
            imagem,
            categoria,
            avaliacao,
            vendas,
            pontuacao
          FROM ofertas
          ORDER BY
            pontuacao DESC,
            vendas DESC,
            id DESC
          LIMIT $1
          `,
      [limite]
    );

    const ofertas = resultado.rows;

    if (ofertas.length === 0) {
      return res.json({
        success: true,

        quantidade: 0,

        texto: "Nenhuma oferta disponível para gerar o post.",

        ofertas: [],
      });
    }

    let texto = `🔥🔥 MELHORES OFERTAS ELETROMAX 🔥🔥

Selecionamos ofertas especiais para você! 👇

`;

    ofertas.forEach((oferta, index) => {
      texto += `${index + 1}️⃣ ${oferta.nome}

💰 Por: R$ ${oferta.preco}

${oferta.precoAnterior ? `💸 De: R$ ${oferta.precoAnterior}\n` : ""}🛒 Comprar:
${oferta.link}

`;
    });

    texto += `⚡ Eletromax
🔥 Ofertas e produtos selecionados!

📲 Aproveite enquanto durar o estoque e o preço!`;

    res.json({
      success: true,

      quantidade: ofertas.length,

      texto: texto,

      ofertas: ofertas,
    });
  } catch (erro) {
    console.error("ERRO GERAR MELHORES OFERTAS:", erro);

    res.status(500).json({
      success: false,

      message: "Erro ao gerar post das melhores ofertas.",

      error: erro.message,
    });
  }
});

// ==========================================
// CONFIGURAÇÕES - BUSCAR
// ==========================================

app.get("/api/configuracoes", async (req, res) => {
  try {
    const resultado = await pool.query(
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

    const config = resultado.rows[0] || {
      id: 1,

      nome_loja: "Eletromax",

      link_mercadolivre: "",

      link_shopee: "",

      link_whatsapp: "",
    };

    res.json({
      success: true,

      configuracoes: config,
    });
  } catch (erro) {
    console.error("ERRO CONFIGURAÇÕES:", erro);

    res.status(500).json({
      success: false,

      message: "Erro ao carregar configurações.",

      error: erro.message,
    });
  }
});

// ==========================================
// CONFIGURAÇÕES - SALVAR
// ==========================================

app.put("/api/configuracoes", async (req, res) => {
  try {
    const { nomeLoja, linkMercadoLivre, linkShopee, linkWhatsapp } = req.body;

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

        linkWhatsapp || "",
      ]
    );

    res.json({
      success: true,

      message: "Configurações salvas com sucesso.",
    });
  } catch (erro) {
    console.error("ERRO SALVAR CONFIGURAÇÕES:", erro);

    res.status(500).json({
      success: false,

      message: "Erro ao salvar configurações.",

      error: erro.message,
    });
  }
});

// ==========================================
// LINKS
// ==========================================

app.get("/api/links", async (req, res) => {
  try {
    const resultado = await pool.query(
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

    const config = resultado.rows[0] || {};

    res.json({
      success: true,

      whatsapp: config.link_whatsapp || "",

      shopee: config.link_shopee || "",

      mercadolivre: config.link_mercadolivre || "",
    });
  } catch (erro) {
    console.error("ERRO AO BUSCAR LINKS:", erro.message);

    res.status(500).json({
      success: false,

      message: "Erro ao buscar links.",

      error: erro.message,
    });
  }
});

// ==========================================
// API PRINCIPAL
// ==========================================

app.get("/api", (req, res) => {
  res.json({
    success: true,

    message: "Eletromax V2 API funcionando!",

    version: "2.0",

    mercadoLivre: mercadoLivreAccessToken ? "conectado" : "não conectado",

    banco: process.env.DATABASE_URL ? "configurado" : "não configurado",

    motorOfertas: "ativo",

    filtroAutomatico: "ativo",

    geradorPosts: "ativo",

    rotasPrincipais: [
      "/api/status",
      "/api/dashboard",
      "/api/produtos",
      "/api/ofertas",
      "/api/ofertas/filtros",
      "/api/mercadolivre/status",
      "/api/mercadolivre/teste",
      "/api/mercadolivre/buscar-salvar",
      "/api/ofertas/buscar-automaticamente",
      "/api/ofertas/gerar-post",
      "/api/ofertas/gerar-post-melhores",
      "/api/configuracoes",
      "/api/links",
    ],
  });
});

// ==========================================
// HEALTH
// ==========================================

app.get("/health", async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({
        success: false,

        status: "offline",

        database: "not_configured",

        mercadoLivre: mercadoLivreAccessToken ? "connected" : "not_connected",

        timestamp: new Date().toISOString(),
      });
    }

    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,

      status: "online",

      database: "connected",

      mercadoLivre: mercadoLivreAccessToken ? "connected" : "not_connected",

      timestamp: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("ERRO HEALTH CHECK:", erro.message);

    res.status(503).json({
      success: false,

      status: "offline",

      database: "disconnected",

      mercadoLivre: mercadoLivreAccessToken ? "connected" : "not_connected",

      error: erro.message,

      timestamp: new Date().toISOString(),
    });
  }
});
// ==========================================
// BUSCAR E SALVAR OFERTAS - GET
// Compatibilidade com testes pelo navegador
// ==========================================

// ==========================================
// 404 API
// ==========================================

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,

    message: "Rota da API não encontrada.",

    rota: req.originalUrl,
  });
});

// ==========================================
// 404 GERAL
// ==========================================

app.use((req, res) => {
  res.status(404).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >
        <title>Eletromax V2</title>
      </head>

      <body>
        <h1>⚡ Eletromax V2</h1>

        <p>
          Página não encontrada.
        </p>

        <a href="/">
          Voltar para o painel
        </a>
      </body>
      </html>
    `);
});

// ==========================================
// TRATAMENTO GLOBAL DE ERROS
// ==========================================

app.use((erro, req, res, next) => {
  console.error("=================================");

  console.error("ERRO GLOBAL DO SERVIDOR:");

  console.error(erro);

  console.error("=================================");

  if (res.headersSent) {
    return next(erro);
  }

  res.status(erro.status || 500).json({
    success: false,

    message: "Erro interno no servidor.",

    error: process.env.NODE_ENV === "production" ? undefined : erro.message,
  });
});

// ==========================================
// SERVIDOR
// ==========================================

let servidor = null;

// ==========================================
// ENCERRAMENTO SEGURO
// ==========================================

async function desligarServidor(sinal) {
  console.log(`Recebido ${sinal}. Encerrando Eletromax V2...`);

  try {
    if (servidor) {
      await new Promise((resolve) => {
        servidor.close(() => {
          console.log("Servidor HTTP encerrado.");

          resolve();
        });
      });
    }

    if (process.env.DATABASE_URL) {
      await pool.end();

      console.log("Banco de dados desconectado.");
    }

    console.log("Eletromax V2 encerrado com sucesso.");

    process.exit(0);
  } catch (erro) {
    console.error("ERRO AO ENCERRAR SERVIDOR:", erro.message);

    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  desligarServidor("SIGTERM");
});

process.on("SIGINT", () => {
  desligarServidor("SIGINT");
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function iniciarServidor() {
  console.log("=================================");

  console.log("INICIANDO ELETROMAX V2...");

  console.log("=================================");

  console.log("NODE VERSION:", process.version);

  console.log("PORTA:", PORT);

  console.log(
    "DATABASE_URL:",
    process.env.DATABASE_URL ? "CONFIGURADA" : "NÃO CONFIGURADA"
  );

  console.log(
    "ML_CLIENT_ID:",
    process.env.ML_CLIENT_ID ? "CONFIGURADO" : "NÃO CONFIGURADO"
  );

  console.log(
    "ML_CLIENT_SECRET:",
    process.env.ML_CLIENT_SECRET ? "CONFIGURADO" : "NÃO CONFIGURADO"
  );

  console.log("ML_REDIRECT_URI:", obterRedirectUri());

  try {
    const bancoOK = await inicializarBanco();

    if (!bancoOK) {
      console.error("⚠️ ATENÇÃO: O banco apresentou erro.");
    }

    servidor = app.listen(PORT, "0.0.0.0", () => {
      console.log("=================================");

      console.log("⚡ ELETROMAX V2 ONLINE");

      console.log("=================================");

      console.log("PORTA:", PORT);

      console.log("BANCO:", bancoOK ? "CONECTADO" : "COM ERRO");

      console.log(
        "MERCADO LIVRE:",
        mercadoLivreAccessToken ? "CONECTADO" : "NÃO CONECTADO"
      );

      console.log(
        "REFRESH TOKEN:",
        mercadoLivreRefreshToken ? "DISPONÍVEL" : "NÃO DISPONÍVEL"
      );

      console.log("MOTOR DE OFERTAS:", "ATIVO");

      console.log("FILTRO AUTOMÁTICO:", "ATIVO");

      console.log("GERADOR DE POSTS:", "ATIVO");

      console.log("=================================");

      console.log("API:", `http://localhost:${PORT}/api`);

      console.log(
        "STATUS ML:",
        `http://localhost:${PORT}/api/mercadolivre/status`
      );

      console.log(
        "TESTE ML:",
        `http://localhost:${PORT}/api/mercadolivre/teste`
      );

      console.log("HEALTH:", `http://localhost:${PORT}/health`);

      console.log("OAUTH CALLBACK:", `${obterRedirectUri()}`);

      console.log("=================================");

      console.log("ELETROMAX V2 PRONTO PARA USO!");

      console.log("=================================");
    });
  } catch (erro) {
    console.error("=================================");

    console.error("ERRO FATAL AO INICIAR ELETROMAX V2:");

    console.error(erro);

    console.error("=================================");

    process.exit(1);
  }
}

// ==========================================
// EXECUTAR
// ==========================================

iniciarServidor();
