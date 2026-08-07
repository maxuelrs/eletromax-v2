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
        rejectUnauthorized: false
      }
    : false
});

pool.on("error", (erro) => {
  console.error(
    "ERRO INESPERADO NO POOL POSTGRES:",
    erro.message
  );
});

// ==========================================
// VARIÁVEIS MERCADO LIVRE
// ==========================================

let mercadoLivreAccessToken =
  process.env.ML_ACCESS_TOKEN || null;

let mercadoLivreRefreshToken =
  process.env.ML_REFRESH_TOKEN || null;

let mercadoLivreTokenExpiresAt =
  process.env.ML_TOKEN_EXPIRES_AT
    ? Number(process.env.ML_TOKEN_EXPIRES_AT)
    : null;

let mercadoLivreUserId =
  process.env.ML_USER_ID || null;

// Evita várias renovações simultâneas
let renovacaoTokenEmAndamento = null;

// ==========================================
// CONFIGURAÇÕES PADRÃO
// ==========================================

const CATEGORIAS_PADRAO = [
  {
    nome: "Casa e decoração",
    busca: "casa decoração"
  },
  {
    nome: "Automotivo",
    busca: "acessórios automotivos"
  },
  {
    nome: "Ferramentas e construção",
    busca: "ferramentas"
  },
  {
    nome: "Eletrônicos e acessórios",
    busca: "eletrônicos acessórios"
  },
  {
    nome: "Segurança",
    busca: "câmera segurança"
  },
  {
    nome: "Utilidades domésticas",
    busca: "utilidades domésticas"
  },
  {
    nome: "Informática",
    busca: "informática"
  },
  {
    nome: "Celulares e acessórios",
    busca: "celular acessórios"
  }
];

const FILTROS_PADRAO = {
  precoMinimo: 0,
  precoMaximo: 100000,
  avaliacaoMinima: 0,
  vendasMinimas: 0,
  limitePorCategoria: 20,
  pontuacaoMinima: 0
};

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function numeroSeguro(valor, padrao = 0) {
  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : padrao;
}

function normalizarPreco(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
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
  return numeroSeguro(
    produto?.sold_quantity,
    0
  );
}

function mascararToken(token) {
  if (!token) {
    return null;
  }

  const texto = String(token);

  if (texto.length <= 10) {
    return "***";
  }

  return (
    texto.substring(0, 5) +
    "..." +
    texto.substring(texto.length - 5)
  );
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
  } else if (reputacao >= 0.90) {
    pontos += 20;
  } else if (reputacao >= 0.80) {
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
    console.warn(
      "⚠️ DATABASE_URL não configurada."
    );

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

    console.log("✅ Banco de dados inicializado.");

    return true;

  } catch (erro) {
    console.error(
      "❌ Erro ao inicializar banco:",
      erro.message
    );

    return false;
  }
}

// ==========================================
// MERCADO LIVRE - SALVAR TOKENS
// ==========================================

async function salvarTokensMercadoLivre(dados) {
  if (!dados) {
    return;
  }

  if (dados.access_token) {
    mercadoLivreAccessToken =
      dados.access_token;
  }

  if (dados.refresh_token) {
    mercadoLivreRefreshToken =
      dados.refresh_token;
  }

  if (dados.user_id) {
    mercadoLivreUserId =
      String(dados.user_id);
  }

  if (dados.expires_in) {
    mercadoLivreTokenExpiresAt =
      Date.now() +
      Number(dados.expires_in) * 1000;
  }

  console.log(
    "🔐 Tokens Mercado Livre atualizados:",
    {
      accessToken:
        mascararToken(
          mercadoLivreAccessToken
        ),
      refreshToken:
        mascararToken(
          mercadoLivreRefreshToken
        ),
      userId:
        mercadoLivreUserId,
      expiraEm:
        mercadoLivreTokenExpiresAt
          ? new Date(
              mercadoLivreTokenExpiresAt
            ).toISOString()
          : null
    }
  );
}

// ==========================================
// MERCADO LIVRE - RENOVAR TOKEN
// ==========================================

async function renovarTokenMercadoLivre() {
  if (renovacaoTokenEmAndamento) {
    return renovacaoTokenEmAndamento;
  }

  renovacaoTokenEmAndamento =
    (async () => {
      try {
        if (
          !mercadoLivreRefreshToken
        ) {
          throw new Error(
            "Refresh token do Mercado Livre não configurado."
          );
        }

        const clientId =
          process.env.ML_CLIENT_ID;

        const clientSecret =
          process.env.ML_CLIENT_SECRET;

        if (
          !clientId ||
          !clientSecret
        ) {
          throw new Error(
            "ML_CLIENT_ID ou ML_CLIENT_SECRET não configurado."
          );
        }

        console.log(
          "🔄 Renovando token Mercado Livre..."
        );

        const resposta =
          await fetch(
            "https://api.mercadolibre.com/oauth/token",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded",
                "Accept":
                  "application/json"
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

        const texto =
          await resposta.text();

        let dados = {};

        try {
          dados =
            JSON.parse(texto);
        } catch {
          dados = {
            raw: texto
          };
        }

        if (!resposta.ok) {
          console.error(
            "❌ Erro ao renovar token Mercado Livre:",
            resposta.status,
            dados
          );

          throw new Error(
            `Erro ao renovar token Mercado Livre: HTTP ${resposta.status}`
          );
        }

        await salvarTokensMercadoLivre(
          dados
        );

        console.log(
          "✅ Token Mercado Livre renovado."
        );

        return {
          success: true,
          dados
        };

      } catch (erro) {
        console.error(
          "❌ Falha na renovação do token:",
          erro.message
        );

        return {
          success: false,
          error: erro.message
        };

      } finally {
        renovacaoTokenEmAndamento =
          null;
      }
    })();

  return renovacaoTokenEmAndamento;
}

// ==========================================
// MERCADO LIVRE - OBTER TOKEN
// ==========================================

async function obterTokenMercadoLivre() {
  if (
    mercadoLivreAccessToken
  ) {
    const agora =
      Date.now();

    const expiraEm =
      mercadoLivreTokenExpiresAt;

    // Renova com antecedência de 5 minutos
    if (
      !expiraEm ||
      expiraEm - agora > 5 * 60 * 1000
    ) {
      return mercadoLivreAccessToken;
    }
  }

  if (
    mercadoLivreRefreshToken
  ) {
    const renovacao =
      await renovarTokenMercadoLivre();

    if (
      renovacao.success &&
      mercadoLivreAccessToken
    ) {
      return mercadoLivreAccessToken;
    }
  }

  if (
    mercadoLivreAccessToken
  ) {
    return mercadoLivreAccessToken;
  }

  throw new Error(
    "Token do Mercado Livre não configurado."
  );
}

// ==========================================
// MERCADO LIVRE - REQUISIÇÃO AUTENTICADA
// ==========================================

async function requisicaoMercadoLivre(
  url,
  opcoes = {},
  repetir403 = true
) {
  let token =
    await obterTokenMercadoLivre();

  const headers = {
    Accept:
      "application/json",

    ...(opcoes.headers || {}),

    Authorization:
      `Bearer ${token}`
  };

  let resposta =
    await fetch(
      url,
      {
        ...opcoes,
        headers
      }
    );

  // Token expirado/inválido
  if (
    (resposta.status === 401 ||
      resposta.status === 403) &&
    repetir403 &&
    mercadoLivreRefreshToken
  ) {
    console.warn(
      `⚠️ Mercado Livre respondeu ${resposta.status}. Tentando renovar token...`
    );

    const renovacao =
      await renovarTokenMercadoLivre();

    if (
      renovacao.success &&
      mercadoLivreAccessToken
    ) {
      token =
        mercadoLivreAccessToken;

      resposta =
        await fetch(
          url,
          {
            ...opcoes,

            headers: {
              Accept:
                "application/json",

              ...(opcoes.headers || {}),

              Authorization:
                `Bearer ${token}`
            }
          }
        );
    }
  }

  return resposta;
}

// ==========================================
// MERCADO LIVRE - PARSEAR RESPOSTA
// ==========================================

async function parsearRespostaMercadoLivre(
  resposta
) {
  const texto =
    await resposta.text();

  let dados = null;

  try {
    dados =
      texto
        ? JSON.parse(texto)
        : {};
  } catch {
    dados = {
      raw: texto
    };
  }

  return {
    status:
      resposta.status,

    ok:
      resposta.ok,

    dados
  };
}
  if (
    resposta.status === 403
  ) {

    console.error(
      "❌ MERCADO LIVRE RETORNOU 403 FORBIDDEN"
    );

    console.error(
      "RESPOSTA:",
      dados
    );

    const erro =
      new Error(
        dados.message ||
        dados.error_description ||
        "Mercado Livre recusou o acesso à API."
      );

    erro.status =
      403;

    erro.code =
      "ML_FORBIDDEN";

    erro.dados =
      dados;

    throw erro;
  }

  // ========================================
  // OUTROS ERROS DA API
  // ========================================

  const erro =
    new Error(
      dados.message ||
      dados.error_description ||
      dados.error ||
      `Erro Mercado Livre HTTP ${resposta.status}.`
    );

  erro.status =
    resposta.status;

  erro.code =
    dados.error ||
    "ML_API_ERROR";

  erro.dados =
    dados;

  throw erro;
}

// ==========================================
// TRANSFORMAR PRODUTO MERCADO LIVRE
// ==========================================

function transformarProdutoMercadoLivre(
  produto
) {

  const avaliacao =
    numeroSeguro(
      produto?.seller?.seller_reputation
        ?.transactions
        ?.ratings
        ?.positive,
      0
    );

  const vendas =
    numeroSeguro(
      produto?.sold_quantity,
      0
    );

  const pontuacao =
    calcularPontuacao(
      produto
    );

  let imagem =
    "";

  if (
    Array.isArray(
      produto?.thumbnail
    )
  ) {
    imagem =
      produto.thumbnail[0] ||
      "";
  } else {
    imagem =
      produto?.thumbnail ||
      produto?.pictures?.[0]?.url ||
      "";
  }

  return {
    id:
      produto?.id ||
      null,

    nome:
      produto?.title ||
      "Produto sem nome",

    preco:
      normalizarPreco(
        produto?.price
      ),

    precoAnterior:
      normalizarPreco(
        produto?.original_price
      ),

    link:
      produto?.permalink ||
      produto?.url ||
      "",

    plataforma:
      "Mercado Livre",

    imagem,

    categoria:
      produto?.category_id ||
      "",

    avaliacao,

    vendas,

    pontuacao,

    freteGratis:
      Boolean(
        produto?.shipping
          ?.free_shipping
      ),

    lojaOficial:
      Boolean(
        produto?.official_store_id
      ),

    produtoOriginal:
      produto
  };
}

// ==========================================
// SALVAR PRODUTO
// ==========================================

async function salvarProduto(
  produto
) {

  if (
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      "DATABASE_URL não configurada."
    );
  }

  if (
    !produto?.link
  ) {
    throw new Error(
      "Produto sem link válido."
    );
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
      ON CONFLICT DO NOTHING
      RETURNING *
      `,
      [
        produto.nome ||
          "Produto",

        produto.preco ||
          "",

        produto.link,

        produto.plataforma ||
          "Mercado Livre"
      ]
    );

  return (
    resultado.rows[0] ||
    null
  );
}

// ==========================================
// SALVAR OFERTA
// ==========================================

async function salvarOferta(
  produto
) {

  if (
    !process.env.DATABASE_URL
  ) {
    throw new Error(
      "DATABASE_URL não configurada."
    );
  }

  if (
    !produto?.link
  ) {
    throw new Error(
      "Oferta sem link válido."
    );
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
          EXCLUDED.preco_anterior,

        plataforma =
          EXCLUDED.plataforma,

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
      RETURNING *
      `,
      [
        produto.nome ||
          "Produto",

        produto.preco ||
          "",

        produto.precoAnterior ||
          "",

        produto.link,

        produto.plataforma ||
          "Mercado Livre",

        produto.imagem ||
          "",

        produto.categoria ||
          "",

        numeroSeguro(
          produto.avaliacao,
          0
        ),

        numeroSeguro(
          produto.vendas,
          0
        ),

        numeroSeguro(
          produto.pontuacao,
          0
        )
      ]
    );

  return (
    resultado.rows[0] ||
    null
  );
}

// ==========================================
// FILTROS DE OFERTAS
// ==========================================

async function obterFiltrosOfertas() {

  const padrao = {
    ...FILTROS_PADRAO
  };

  if (
    !process.env.DATABASE_URL
  ) {
    return padrao;
  }

  try {

    const resultado =
      await pool.query(`
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

    if (
      resultado.rowCount === 0
    ) {
      return padrao;
    }

    const dados =
      resultado.rows[0];

    return {
      precoMinimo:
        numeroSeguro(
          dados.preco_minimo,
          padrao.precoMinimo
        ),

      precoMaximo:
        numeroSeguro(
          dados.preco_maximo,
          padrao.precoMaximo
        ),

      avaliacaoMinima:
        numeroSeguro(
          dados.avaliacao_minima,
          padrao.avaliacaoMinima
        ),

      vendasMinimas:
        numeroSeguro(
          dados.vendas_minimas,
          padrao.vendasMinimas
        ),

      limitePorCategoria:
        numeroSeguro(
          dados.limite_por_categoria,
          padrao.limitePorCategoria
        ),

      pontuacaoMinima:
        numeroSeguro(
          dados.pontuacao_minima,
          padrao.pontuacaoMinima
        )
    };

  } catch (erro) {

    console.error(
      "ERRO AO OBTER FILTROS:",
      erro.message
    );

    return padrao;
  }
}

// ==========================================
// APLICAR FILTROS
// ==========================================

function produtoPassaFiltros(
  produto,
  filtros
) {

  const preco =
    Number(
      produto?.preco
    );

  if (
    Number.isFinite(preco)
  ) {

    if (
      preco <
      filtros.precoMinimo
    ) {
      return false;
    }

    if (
      preco >
      filtros.precoMaximo
    ) {
      return false;
    }
  }

  const avaliacao =
    numeroSeguro(
      produto?.avaliacao,
      0
    );

  if (
    avaliacao <
    filtros.avaliacaoMinima
  ) {
    return false;
  }

  const vendas =
    numeroSeguro(
      produto?.vendas,
      0
    );

  if (
    vendas <
    filtros.vendasMinimas
  ) {
    return false;
  }

  const pontuacao =
    numeroSeguro(
      produto?.pontuacao,
      0
    );

  if (
    pontuacao <
    filtros.pontuacaoMinima
  ) {
    return false;
  }

  return true;
}

// ==========================================
// GERAR TEXTO DO POST
// ==========================================

function gerarTextoOferta(
  oferta
) {

  const nome =
    oferta?.nome ||
    "Oferta especial";

  const preco =
    oferta?.preco ||
    "";

  const precoAnterior =
    oferta?.preco_anterior ||
    "";

  const link =
    oferta?.link ||
    "";

  let texto =
    `🔥 OFERTA ELETROMAX 🔥\n\n`;

  texto +=
    `${nome}\n\n`;

  if (
    precoAnterior
  ) {

    texto +=
      `💰 De: R$ ${precoAnterior}\n`;
  }

  if (
    preco
  ) {

    texto +=
      `🔥 Por: R$ ${preco}\n`;
  }

  if (
    oferta?.avaliacao
  ) {

    texto +=
      `⭐ Avaliação: ${oferta.avaliacao}\n`;
  }

  if (
    oferta?.vendas
  ) {

    texto +=
      `🛒 Vendas: ${oferta.vendas}\n`;
  }

  texto +=
    `\n👉 Compre aqui:\n${link}\n\n`;

  texto +=
    `⚡ Eletromax — ofertas e produtos selecionados.`;

  return texto;
}

// ==========================================
// STATUS GERAL
// ==========================================

app.get(
  "/api/status",
  async (req, res) => {

    let database =
      "disconnected";

    if (
      process.env.DATABASE_URL
    ) {

      try {

        await pool.query(
          "SELECT 1"
        );

        database =
          "connected";

      } catch {
        database =
          "error";
      }
    }

    res.json({
      success: true,

      status:
        "online",

      database,

      mercadoLivre:
        Boolean(
          mercadoLivreAccessToken
        ),

      motorOfertas:
        "active",

      filtroAutomatico:
        "active",

      geradorPosts:
        "active",

      timestamp:
        new Date().toISOString()
    });
  }
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
  "/health",
  async (req, res) => {

    let database =
      "disconnected";

    if (
      process.env.DATABASE_URL
    ) {

      try {

        await pool.query(
          "SELECT 1"
        );

        database =
          "connected";

      } catch {

        database =
          "error";
      }
    }

    res.json({
      success: true,

      status:
        "online",

      database,

      mercadoLivre:
        mercadoLivreAccessToken
          ? "connected"
          : "disconnected",

      motorOfertas:
        "active",

      geradorPosts:
        "active"
    });
  }
);

// ==========================================
// API ROOT
// ==========================================

app.get(
  "/api",
  (req, res) => {

    res.json({
      success: true,

      message:
        "Eletromax V2 API funcionando!",

      version:
        "2.0",

      mercadoLivre:
        mercadoLivreAccessToken
          ? "conectado"
          : "desconectado",

      banco:
        process.env.DATABASE_URL
          ? "configurado"
          : "não configurado",

      motorOfertas:
        "ativo",

      filtroAutomatico:
        "ativo",

      geradorPosts:
        "ativo",

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
        "/api/links"
      ]
    });
  }
);

// ==========================================
// DASHBOARD
// ==========================================

app.get(
  "/api/dashboard",
  async (req, res) => {

    try {

      if (
        !process.env.DATABASE_URL
      ) {

        return res.json({
          success: true,

          produtos: 0,

          ofertas: 0,

          ofertasHoje: 0,

          database:
            "not_configured"
        });
      }

      const produtos =
        await pool.query(
          "SELECT COUNT(*)::int AS total FROM produtos"
        );

      const ofertas =
        await pool.query(
          "SELECT COUNT(*)::int AS total FROM ofertas"
        );

      const ofertasHoje =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM ofertas
          WHERE criado_em >= CURRENT_DATE
          `
        );

      res.json({
        success: true,

        produtos:
          produtos.rows[0]?.total ||
          0,

        ofertas:
          ofertas.rows[0]?.total ||
          0,

        ofertasHoje:
          ofertasHoje.rows[0]?.total ||
          0,

        database:
          "connected",

        mercadoLivre:
          mercadoLivreAccessToken
            ? "connected"
            : "disconnected"
      });

    } catch (erro) {

      console.error(
        "ERRO DASHBOARD:",
        erro.message
      );

      res.status(500).json({
        success: false,

        message:
          "Erro ao carregar dashboard.",

        error:
          erro.message
      });
    }
  }
);
       avaliacao:
         avaliacao,

       vendas:
         vendas,

       pontuacao:
         pontuacao
     }
   };
}

// ==========================================
// MERCADO LIVRE - CONSULTAR USUÁRIO
// ==========================================

async function consultarUsuarioMercadoLivre(
  token
) {

  const resposta =
    await fetch(
      "https://api.mercadolibre.com/users/me",
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${token}`,

          Accept:
            "application/json",

          "User-Agent":
            "Eletromax-V2/2.0"
        }
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
  } catch {
    dados = {
      raw:
        texto
    };
  }

  return {
    resposta,
    dados
  };
}

// ==========================================
// BUSCAR PRODUTOS NO MERCADO LIVRE
// ==========================================

async function buscarMercadoLivre(
  termo,
  limite = 20
) {

  const busca =
    String(
      termo || ""
    ).trim();

  if (!busca) {
    throw new Error(
      "Informe um termo para busca."
    );
  }

  let token =
    await obterTokenMercadoLivre();

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
      Math.min(
        Math.max(
          Number(limite) || 20,
          1
        ),
        50
      )
    )
  );

  const resposta =
    await fetch(
      url.toString(),
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${token}`,

          Accept:
            "application/json",

          "User-Agent":
            "Eletromax-V2/2.0"
        }
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
  } catch {
    dados = {
      raw:
        texto
    };
  }

  // ========================================
  // TOKEN INVÁLIDO
  // ========================================

  if (
    resposta.status === 401
  ) {

    console.warn(
      "⚠️ TOKEN ML RETORNOU 401."
    );

    if (
      mercadoLivreRefreshToken
    ) {

      try {

        console.log(
          "🔄 TENTANDO RENOVAR TOKEN..."
        );

        const renovacao =
          await renovarTokenMercadoLivre();

        if (
          renovacao.success &&
          mercadoLivreAccessToken
        ) {

          const novoToken =
            mercadoLivreAccessToken;

          console.log(
            "🔄 REPETINDO BUSCA COM NOVO TOKEN..."
          );

          const segundaResposta =
            await fetch(
              url.toString(),
              {
                method:
                  "GET",

                headers: {
                  Authorization:
                    `Bearer ${novoToken}`,

                  Accept:
                    "application/json",

                  "User-Agent":
                    "Eletromax-V2/2.0"
                }
              }
            );

          const segundaTexto =
            await segundaResposta.text();

          let segundaDados =
            {};

          try {

            segundaDados =
              segundaTexto
                ? JSON.parse(
                    segundaTexto
                  )
                : {};

          } catch {

            segundaDados = {
              raw:
                segundaTexto
            };
          }

          if (
            segundaResposta.ok
          ) {

            console.log(
              "✅ BUSCA FUNCIONOU APÓS RENOVAÇÃO DO TOKEN"
            );

            return segundaDados;
          }

          console.error(
            "❌ BUSCA CONTINUOU FALHANDO APÓS RENOVAÇÃO:",
            segundaResposta.status,
            segundaDados
          );
        }

      } catch (
        erroRenovacao
      ) {

        console.error(
          "❌ ERRO AO RENOVAR TOKEN:",
          erroRenovacao.message
        );
      }
    }

    const erro =
      new Error(
        dados.message ||
        dados.error_description ||
        dados.error ||
        "Token do Mercado Livre inválido ou expirado."
      );

    erro.status =
      401;

    erro.code =
      "ML_TOKEN_INVALID";

    erro.dados =
      dados;

    throw erro;
  }

  // ========================================
  // ACESSO NEGADO
  // ========================================

  if (
    resposta.status === 403
  ) {

    console.error(
      "❌ MERCADO LIVRE RETORNOU 403 FORBIDDEN"
    );

    console.error(
      "RESPOSTA:",
      dados
    );

    const erro =
      new Error(
        dados.message ||
        dados.error_description ||
        dados.error ||
        "O Mercado Livre recusou o acesso à consulta."
      );

    erro.status =
      403;

    erro.code =
      "ML_FORBIDDEN";

    erro.dados =
      dados;

    throw erro;
  }

  // ========================================
  // OUTROS ERROS
  // ========================================

  if (
    !resposta.ok
  ) {

    const erro =
      new Error(
        dados.message ||
        dados.error_description ||
        dados.error ||
        `Erro na API do Mercado Livre (${resposta.status}).`
      );

    erro.status =
      resposta.status;

    erro.code =
      "ML_SEARCH_ERROR";

    erro.dados =
      dados;

    throw erro;
  }

  return dados;
}

// ==========================================
// MERCADO LIVRE - BUSCA PÚBLICA
// ==========================================

async function buscarMercadoLivrePublico(
  termo,
  limite = 20
) {

  const busca =
    String(
      termo || ""
    ).trim();

  if (!busca) {
    throw new Error(
      "Informe um termo para busca."
    );
  }

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
      Math.min(
        Math.max(
          Number(limite) || 20,
          1
        ),
        50
      )
    )
  );

  const resposta =
    await fetch(
      url.toString(),
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "Eletromax-V2/2.0"
        }
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

  } catch {

    dados = {
      raw:
        texto
    };
  }

  if (
    !resposta.ok
  ) {

    const erro =
      new Error(
        dados.message ||
        dados.error ||
        `Erro na busca pública (${resposta.status}).`
      );

    erro.status =
      resposta.status;

    erro.code =
      "ML_PUBLIC_SEARCH_ERROR";

    erro.dados =
      dados;

    throw erro;
  }

  return dados;
}

// ==========================================
// ROTA - STATUS MERCADO LIVRE
// ==========================================

app.get(
  "/api/mercadolivre/status",
  async (req, res) => {

    try {

      res.json({
        success:
          true,

        conectado:
          Boolean(
            mercadoLivreAccessToken
          ),

        configurado:
          Boolean(
            process.env.ML_CLIENT_ID &&
            process.env.ML_CLIENT_SECRET
          ),

        redirectUri:
          obterRedirectUri(),

        userId:
          mercadoLivreUserId ||
          null,

        tokenExpiraEm:
          mercadoLivreTokenExpiresAt
            ? new Date(
                mercadoLivreTokenExpiresAt
              ).toISOString()
            : null,

        temRefreshToken:
          Boolean(
            mercadoLivreRefreshToken
          )
      });

    } catch (erro) {

      console.error(
        "ERRO STATUS MERCADO LIVRE:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        conectado:
          false,

        message:
          erro.message
      });
    }
  }
);

// ==========================================
// ROTA - TESTAR MERCADO LIVRE
// ==========================================

app.get(
  "/api/mercadolivre/teste",
  async (req, res) => {

    try {

      let token =
        await obterTokenMercadoLivre();

      let resultado =
        await consultarUsuarioMercadoLivre(
          token
        );

      // Se o token foi rejeitado,
      // tenta renovar uma única vez.
      if (
        resultado.resposta.status ===
          401 &&
        mercadoLivreRefreshToken
      ) {

        console.warn(
          "⚠️ TESTE ML: TOKEN 401. RENOVANDO..."
        );

        const renovacao =
          await renovarTokenMercadoLivre();

        if (
          renovacao.success
        ) {

          token =
            mercadoLivreAccessToken;

          resultado =
            await consultarUsuarioMercadoLivre(
              token
            );
        }
      }

      const resposta =
        resultado.resposta;

      const dados =
        resultado.dados;

      if (
        !resposta.ok
      ) {

        return res.status(
          resposta.status
        ).json({

          success:
            false,

          status:
            resposta.status,

          code:
            resposta.status === 401
              ? "ML_TOKEN_INVALID"
              : resposta.status === 403
                ? "ML_FORBIDDEN"
                : "ML_API_ERROR",

          message:
            dados.message ||
            dados.error ||
            "Mercado Livre recusou a requisição.",

          dados:
            dados
        });
      }

      if (
        dados.id
      ) {

        mercadoLivreUserId =
          String(
            dados.id
          );
      }

      res.json({

        success:
          true,

        status:
          resposta.status,

        conectado:
          true,

        userId:
          dados.id ||
          mercadoLivreUserId ||
          null,

        nickname:
          dados.nickname ||
          null,

        dados:
          dados
      });

    } catch (erro) {

      console.error(
        "ERRO TESTE ML:",
        erro
      );

      res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        code:
          erro.code ||
          "ML_TEST_ERROR",

        message:
          erro.message,

        detalhes:
          erro.dados ||
          null
      });
    }
  }
);

// ==========================================
// BUSCAR E SALVAR OFERTAS ML
// ==========================================

app.post(
  "/api/mercadolivre/buscar-salvar",
  async (req, res) => {

    try {

      const busca =
        String(
          req.body?.q ||
          req.body?.query ||
          ""
        ).trim();

      if (!busca) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Informe o termo de busca em q."
        });
      }

      const limite =
        Math.min(
          Math.max(
            Number(
              req.body?.limit ||
              req.body?.limite ||
              20
            ),
            1
          ),
          50
        );

      console.log(
        `🔎 Buscando Mercado Livre: "${busca}" (${limite})`
      );

      const dados =
        await buscarMercadoLivre(
          busca,
          limite
        );

      const resultados =
        Array.isArray(
          dados.results
        )
          ? dados.results
          : [];

      const filtros =
        await obterFiltros();

      const salvos = [];

      for (
        const produto of resultados
      ) {

        const analise =
          analisarProduto(
            produto,
            {
              nome:
                busca
            },
            filtros
          );

        if (
          !analise.aprovado
        ) {
          continue;
        }

        const item =
          analise.produto;

        try {

          const salvo =
            await salvarOferta(
              {
                nome:
                  item.nome,

                preco:
                  item.preco,

                precoAnterior:
                  item.precoAnterior,

                link:
                  item.link,

                plataforma:
                  item.plataforma,

                imagem:
                  item.imagem,

                categoria:
                  item.categoria,

                avaliacao:
                  item.avaliacao,

                vendas:
                  item.vendas,

                pontuacao:
                  item.pontuacao
              }
            );

          if (
            salvo
          ) {
            salvos.push(
              salvo
            );
          }

        } catch (
          erroSalvar
        ) {

          console.error(
            "⚠️ ERRO AO SALVAR OFERTA:",
            erroSalvar.message
          );
        }
      }

      res.json({

        success:
          true,

        message:
          "Busca realizada com sucesso.",

        busca,

        encontrados:
          resultados.length,

        salvos:
          salvos.length,

        produtos:
          salvos
      });

    } catch (erro) {

      console.error(
        "❌ ERRO BUSCAR-SALVAR ML:",
        erro
      );

      res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        message:
          erro.code ===
            "ML_FORBIDDEN"
            ? "Mercado Livre recusou o acesso à busca."
            : erro.message,

        code:
          erro.code ||
          "ML_SEARCH_ERROR",

        status:
          erro.status ||
          500,

        detalhes:
          erro.dados ||
          null
      });
    }
  }
);

// ==========================================
// GET - BUSCAR E SALVAR
// Compatibilidade com teste pelo navegador
// ==========================================

app.get(
  "/api/mercadolivre/buscar-salvar",
  async (req, res) => {

    try {

      const busca =
        String(
          req.query?.q ||
          ""
        ).trim();

      if (!busca) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Informe ?q=termo na URL."
        });
      }

      const limite =
        Math.min(
          Math.max(
            Number(
              req.query?.limit ||
              20
            ),
            1
          ),
          50
        );

      console.log(
        `🔎 GET busca Mercado Livre: "${busca}"`
      );

      const dados =
        await buscarMercadoLivre(
          busca,
          limite
        );

      const resultados =
        Array.isArray(
          dados.results
        )
          ? dados.results
          : [];

      res.json({

        success:
          true,

        busca,

        encontrados:
          resultados.length,

        resultados
      });

    } catch (erro) {

      console.error(
        "❌ ERRO GET BUSCAR-SALVAR:",
        erro
      );

      res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        message:
          erro.message,

        code:
          erro.code ||
          "ML_SEARCH_ERROR",

        status:
          erro.status ||
          500,

        detalhes:
          erro.dados ||
          null
      });
    }
  }
);
    const tokenData = {
      userId:
        userId ||
        mercadoLivreUserId ||
        null,

      accessToken:
        accessToken,

      refreshToken:
        refreshToken ||
        mercadoLivreRefreshToken ||
        null,

      expiresAt:
        expiresAt ||
        mercadoLivreTokenExpiresAt ||
        null
    };

    mercadoLivreUserId =
      tokenData.userId
        ? String(tokenData.userId)
        : mercadoLivreUserId;

    mercadoLivreAccessToken =
      tokenData.accessToken;

    mercadoLivreRefreshToken =
      tokenData.refreshToken;

    mercadoLivreTokenExpiresAt =
      tokenData.expiresAt;

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
          EXCLUDED.refresh_token,

        expires_at =
          EXCLUDED.expires_at,

        atualizado_em =
          CURRENT_TIMESTAMP
      `,
      [
        tokenData.userId,
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.expiresAt
      ]
    );

    console.log(
      "✅ TOKEN MERCADO LIVRE SALVO NO BANCO."
    );

    return true;
  }

// ==========================================
// CARREGAR TOKEN DO BANCO
// ==========================================

async function carregarTokenMercadoLivre() {

  if (
    !process.env.DATABASE_URL
  ) {
    return false;
  }

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
        "ℹ️ Nenhum token ML salvo no banco."
      );

      return false;
    }

    const token =
      resultado.rows[0];

    if (
      token.access_token
    ) {
      mercadoLivreAccessToken =
        token.access_token;
    }

    if (
      token.refresh_token
    ) {
      mercadoLivreRefreshToken =
        token.refresh_token;
    }

    if (
      token.user_id
    ) {
      mercadoLivreUserId =
        String(
          token.user_id
        );
    }

    if (
      token.expires_at
    ) {
      mercadoLivreTokenExpiresAt =
        Number(
          token.expires_at
        );
    }

    console.log(
      "✅ TOKEN MERCADO LIVRE CARREGADO DO BANCO."
    );

    return true;

  } catch (erro) {

    console.error(
      "❌ ERRO AO CARREGAR TOKEN ML:",
      erro.message
    );

    return false;
  }
}

// ==========================================
// ATUALIZAR TOKEN EM MEMÓRIA E BANCO
// ==========================================

async function atualizarTokensMercadoLivre(
  dados
) {

  if (
    !dados ||
    !dados.access_token
  ) {
    return false;
  }

  const accessToken =
    dados.access_token;

  const refreshToken =
    dados.refresh_token ||
    mercadoLivreRefreshToken ||
    null;

  const expiresAt =
    dados.expires_in
      ? Date.now() +
        Number(
          dados.expires_in
        ) *
          1000
      : mercadoLivreTokenExpiresAt;

  const userId =
    dados.user_id ||
    mercadoLivreUserId ||
    null;

  await salvarTokenMercadoLivre({
    userId,
    accessToken,
    refreshToken,
    expiresAt
  });

  return true;
}

// ==========================================
// RENOVAÇÃO DE TOKEN
// ==========================================

async function renovarTokenMercadoLivre() {

  if (
    renovacaoTokenEmAndamento
  ) {
    return renovacaoTokenEmAndamento;
  }

  renovacaoTokenEmAndamento =
    (async () => {

      try {

        if (
          !mercadoLivreRefreshToken
        ) {

          return {
            success:
              false,

            message:
              "Refresh token do Mercado Livre não configurado."
          };
        }

        const clientId =
          process.env.ML_CLIENT_ID;

        const clientSecret =
          process.env.ML_CLIENT_SECRET;

        if (
          !clientId ||
          !clientSecret
        ) {

          return {
            success:
              false,

            message:
              "ML_CLIENT_ID ou ML_CLIENT_SECRET não configurado."
          };
        }

        console.log(
          "🔄 RENOVANDO TOKEN MERCADO LIVRE..."
        );

        const resposta =
          await fetch(
            "https://api.mercadolibre.com/oauth/token",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded",

                Accept:
                  "application/json"
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

        const texto =
          await resposta.text();

        let dados = {};

        try {

          dados =
            texto
              ? JSON.parse(texto)
              : {};

        } catch {

          dados = {
            raw:
              texto
          };
        }

        if (
          !resposta.ok
        ) {

          console.error(
            "❌ MERCADO LIVRE RECUSOU RENOVAÇÃO:",
            resposta.status,
            dados
          );

          return {
            success:
              false,

            status:
              resposta.status,

            message:
              dados.message ||
              dados.error_description ||
              dados.error ||
              "Erro ao renovar token.",

            dados
          };
        }

        await atualizarTokensMercadoLivre(
          dados
        );

        console.log(
          "✅ TOKEN MERCADO LIVRE RENOVADO COM SUCESSO."
        );

        return {
          success:
            true,

          status:
            resposta.status,

          dados
        };

      } catch (erro) {

        console.error(
          "❌ ERRO NA RENOVAÇÃO ML:",
          erro.message
        );

        return {
          success:
            false,

          message:
            erro.message
        };

      } finally {

        renovacaoTokenEmAndamento =
          null;
      }

    })();

  return renovacaoTokenEmAndamento;
}

// ==========================================
// OBTER TOKEN VÁLIDO
// ==========================================

async function obterTokenMercadoLivre() {

  if (
    mercadoLivreAccessToken
  ) {

    const agora =
      Date.now();

    const expiraEm =
      mercadoLivreTokenExpiresAt;

    if (
      !expiraEm ||
      expiraEm -
        agora >
        5 * 60 * 1000
    ) {

      return mercadoLivreAccessToken;
    }
  }

  if (
    mercadoLivreRefreshToken
  ) {

    const renovacao =
      await renovarTokenMercadoLivre();

    if (
      renovacao.success &&
      mercadoLivreAccessToken
    ) {

      return mercadoLivreAccessToken;
    }
  }

  if (
    mercadoLivreAccessToken
  ) {

    return mercadoLivreAccessToken;
  }

  throw new Error(
    "Token do Mercado Livre não configurado."
  );
}

// ==========================================
// REQUEST AUTENTICADO ML
// ==========================================

async function requisicaoMercadoLivre(
  url,
  opcoes = {},
  tentarRenovar = true
) {

  let token =
    await obterTokenMercadoLivre();

  const headers = {
    ...(opcoes.headers || {}),

    Authorization:
      `Bearer ${token}`,

    Accept:
      "application/json",

    "User-Agent":
      "Eletromax-V2/2.0"
  };

  let resposta =
    await fetch(
      url,
      {
        ...opcoes,

        headers
      }
    );

  if (
    (resposta.status === 401 ||
      resposta.status === 403) &&
    tentarRenovar &&
    mercadoLivreRefreshToken
  ) {

    console.warn(
      `⚠️ Mercado Livre retornou ${resposta.status}. Tentando renovar token...`
    );

    const renovacao =
      await renovarTokenMercadoLivre();

    if (
      renovacao.success &&
      mercadoLivreAccessToken
    ) {

      token =
        mercadoLivreAccessToken;

      resposta =
        await fetch(
          url,
          {
            ...opcoes,

            headers: {
              ...(opcoes.headers || {}),

              Authorization:
                `Bearer ${token}`,

              Accept:
                "application/json",

              "User-Agent":
                "Eletromax-V2/2.0"
            }
          }
        );
    }
  }

  return resposta;
}

// ==========================================
// PARSEAR RESPOSTA ML
// ==========================================

async function parsearRespostaMercadoLivre(
  resposta
) {

  const texto =
    await resposta.text();

  let dados = {};

  try {

    dados =
      texto
        ? JSON.parse(texto)
        : {};

  } catch {

    dados = {
      raw:
        texto
    };
  }

  return {
    status:
      resposta.status,

    ok:
      resposta.ok,

    dados
  };
}

// ==========================================
// OBTER FILTROS
// ==========================================

async function obterFiltros() {

  const padrao =
    {
      ...FILTROS_PADRAO
    };

  if (
    !process.env.DATABASE_URL
  ) {

    return padrao;
  }

  try {

    const resultado =
      await pool.query(
        `
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
        `
      );

    if (
      resultado.rowCount === 0
    ) {

      return padrao;
    }

    const dados =
      resultado.rows[0];

    return {

      precoMinimo:
        numeroSeguro(
          dados.preco_minimo,
          padrao.precoMinimo
        ),

      precoMaximo:
        numeroSeguro(
          dados.preco_maximo,
          padrao.precoMaximo
        ),

      avaliacaoMinima:
        numeroSeguro(
          dados.avaliacao_minima,
          padrao.avaliacaoMinima
        ),

      vendasMinimas:
        numeroSeguro(
          dados.vendas_minimas,
          padrao.vendasMinimas
        ),

      limitePorCategoria:
        numeroSeguro(
          dados.limite_por_categoria,
          padrao.limitePorCategoria
        ),

      pontuacaoMinima:
        numeroSeguro(
          dados.pontuacao_minima,
          padrao.pontuacaoMinima
        )
    };

  } catch (erro) {

    console.error(
      "❌ ERRO AO OBTER FILTROS:",
      erro.message
    );

    return padrao;
  }
}

// ==========================================
// ANALISAR PRODUTO
// ==========================================

function analisarProduto(
  produto,
  categoria,
  filtros
) {

  const item =
    transformarProdutoMercadoLivre(
      produto
    );

  const preco =
    Number(
      item.preco
    );

  let aprovado =
    true;

  if (
    Number.isFinite(preco)
  ) {

    if (
      preco <
      filtros.precoMinimo
    ) {

      aprovado =
        false;
    }

    if (
      preco >
      filtros.precoMaximo
    ) {

      aprovado =
        false;
    }
  }

  if (
    item.avaliacao <
    filtros.avaliacaoMinima
  ) {

    aprovado =
      false;
  }

  if (
    item.vendas <
    filtros.vendasMinimas
  ) {

    aprovado =
      false;
  }

  if (
    item.pontuacao <
    filtros.pontuacaoMinima
  ) {

    aprovado =
      false;
  }

  if (
    categoria &&
    categoria.nome
  ) {

    item.categoria =
      categoria.nome;
  }

  return {
    aprovado,

    produto:
      item
  };
}
// ==========================================
// FILTROS - SALVAR
// ==========================================

app.put(
  "/api/ofertas/filtros",
  async (req, res) => {
    try {

      const {
        precoMinimo,
        precoMaximo,
        avaliacaoMinima,
        vendasMinimas,
        limitePorCategoria,
        pontuacaoMinima
      } = req.body;

      const minimo =
        numeroSeguro(
          precoMinimo,
          0
        );

      const maximo =
        numeroSeguro(
          precoMaximo,
          999999
        );

      const avaliacao =
        numeroSeguro(
          avaliacaoMinima,
          0
        );

      const vendas =
        numeroSeguro(
          vendasMinimas,
          0
        );

      const limite =
        numeroSeguro(
          limitePorCategoria,
          10
        );

      const pontuacao =
        numeroSeguro(
          pontuacaoMinima,
          0
        );

      const resultado =
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
            pontuacao_minima
          )
          VALUES
          (
            1,
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
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
              EXCLUDED.pontuacao_minima

          RETURNING
            preco_minimo AS "precoMinimo",
            preco_maximo AS "precoMaximo",
            avaliacao_minima AS "avaliacaoMinima",
            vendas_minimas AS "vendasMinimas",
            limite_por_categoria AS "limitePorCategoria",
            pontuacao_minima AS "pontuacaoMinima"
          `,
          [
            minimo,
            maximo,
            avaliacao,
            vendas,
            limite,
            pontuacao
          ]
        );

      res.json({
        success:
          true,

        message:
          "Filtros salvos com sucesso.",

        filtros:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR FILTROS:",
        erro.message
      );

      res.status(500).json({
        success:
          false,

        message:
          "Erro ao salvar filtros.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// OFERTAS - EXCLUIR
// ==========================================

app.delete(
  "/api/ofertas/:id",
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "ID da oferta inválido."
        });
      }

      const resultado =
        await pool.query(
          `
          DELETE FROM ofertas
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Oferta não encontrada."
        });
      }

      res.json({

        success:
          true,

        message:
          "Oferta excluída com sucesso."
      });

    } catch (erro) {

      console.error(
        "ERRO AO EXCLUIR OFERTA:",
        erro.message
      );

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao excluir oferta.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// BUSCAR OFERTAS AUTOMATICAMENTE
// ==========================================

app.get(
  "/api/ofertas/buscar-automaticamente",
  async (req, res) => {

    try {

      const termo =
        String(
          req.query.q ||
          req.query.busca ||
          "ofertas"
        ).trim();

      const limite =
        Math.min(
          Math.max(
            Number(
              req.query.limit ||
              20
            ),
            1
          ),
          50
        );

      console.log(
        "================================="
      );

      console.log(
        "🤖 BUSCA AUTOMÁTICA DE OFERTAS"
      );

      console.log(
        "TERMO:",
        termo
      );

      console.log(
        "LIMITE:",
        limite
      );

      console.log(
        "================================="
      );

      const dados =
        await buscarMercadoLivre(
          termo,
          limite
        );

      const resultados =
        Array.isArray(
          dados.results
        )
          ? dados.results
          : [];

      const filtros =
        await obterFiltros();

      const analisados = [];

      const aprovados = [];

      for (
        const produto
        of resultados
      ) {

        const analise =
          analisarProduto(
            produto,
            {
              nome:
                termo
            },
            filtros
          );

        analisados.push(
          analise
        );

        if (
          analise.aprovado
        ) {

          aprovados.push(
            analise.produto
          );
        }
      }

      const salvos = [];

      for (
        const produto
        of aprovados
      ) {

        try {

          const salvo =
            await salvarOferta(
              produto
            );

          if (
            salvo
          ) {

            salvos.push(
              salvo
            );
          }

        } catch (
          erroSalvar
        ) {

          console.error(
            "⚠️ ERRO AO SALVAR OFERTA:",
            erroSalvar.message
          );
        }
      }

      res.json({

        success:
          true,

        message:
          "Busca automática concluída.",

        termo,

        encontrados:
          resultados.length,

        aprovados:
          aprovados.length,

        salvos:
          salvos.length,

        filtros,

        ofertas:
          salvos
      });

    } catch (erro) {

      console.error(
        "❌ ERRO NA BUSCA AUTOMÁTICA:",
        erro
      );

      res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        message:
          erro.message,

        code:
          erro.code ||
          "AUTO_SEARCH_ERROR",

        status:
          erro.status ||
          500,

        detalhes:
          erro.dados ||
          null
      });
    }
  }
);

// ==========================================
// GERAR POST DE UMA OFERTA
// ==========================================

app.post(
  "/api/ofertas/gerar-post",
  async (req, res) => {

    try {

      const id =
        Number(
          req.body?.id ||
          req.body?.ofertaId
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Informe um ID de oferta válido."
        });
      }

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
            categoria,
            avaliacao,
            vendas,
            pontuacao
          FROM ofertas
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Oferta não encontrada."
        });
      }

      const oferta =
        resultado.rows[0];

      const texto =
        gerarTextoOferta(
          oferta
        );

      res.json({

        success:
          true,

        oferta,

        post: {
          texto
        }
      });

    } catch (erro) {

      console.error(
        "ERRO AO GERAR POST:",
        erro.message
      );

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao gerar post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// GERAR POST DAS MELHORES OFERTAS
// ==========================================

app.get(
  "/api/ofertas/gerar-post-melhores",
  async (req, res) => {

    try {

      const limite =
        Math.min(
          Math.max(
            Number(
              req.query.limit ||
              5
            ),
            1
          ),
          20
        );

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
            categoria,
            avaliacao,
            vendas,
            pontuacao
          FROM ofertas
          ORDER BY
            pontuacao DESC,
            avaliacao DESC,
            vendas DESC,
            id DESC
          LIMIT $1
          `,
          [limite]
        );

      const ofertas =
        resultado.rows;

      const posts =
        ofertas.map(
          (
            oferta,
            indice
          ) => ({

            posicao:
              indice + 1,

            oferta,

            texto:
              gerarTextoOferta(
                oferta
              )
          })
        );

      res.json({

        success:
          true,

        quantidade:
          posts.length,

        posts
      });

    } catch (erro) {

      console.error(
        "ERRO AO GERAR MELHORES POSTS:",
        erro.message
      );

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao gerar posts das melhores ofertas.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// CONFIGURAÇÕES - CONSULTAR
// ==========================================

app.get(
  "/api/configuracoes",
  async (req, res) => {

    try {

      res.json({

        success:
          true,

        configuracoes: {

          mercadoLivre: {
            configurado:
              Boolean(
                process.env.ML_CLIENT_ID &&
                process.env.ML_CLIENT_SECRET
              ),

            conectado:
              Boolean(
                mercadoLivreAccessToken
              ),

            userId:
              mercadoLivreUserId ||
              null,

            redirectUri:
              obterRedirectUri()
          },

          banco: {
            configurado:
              Boolean(
                process.env.DATABASE_URL
              )
          },

          sistema: {
            motorOfertas:
              true,

            filtroAutomatico:
              true,

            geradorPosts:
              true
          }
        }
      });

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao carregar configurações.",

        error:
          erro.message
      });
    }
  }
);
// ==========================================
// PRODUTOS - LISTAR
// ==========================================

app.get(
  "/api/produtos",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
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

        success:
          true,

        produtos:
          resultado.rows
      });

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao buscar produtos.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// PRODUTOS - CADASTRAR
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

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Nome, link e plataforma são obrigatórios."
        });
      }

      const nomeFinal =
        String(
          nome
        ).trim();

      const linkFinal =
        String(
          link
        ).trim();

      const plataformaFinal =
        String(
          plataforma
        ).trim();

      if (
        !nomeFinal ||
        !linkFinal ||
        !plataformaFinal
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Os campos obrigatórios não podem estar vazios."
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
            nomeFinal,

            normalizarPreco(
              preco
            ),

            linkFinal,

            plataformaFinal
          ]
        );

      res.status(
        201
      ).json({

        success:
          true,

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

        success:
          false,

        message:
          "Erro ao salvar produto.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// PRODUTOS - EXCLUIR
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

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "ID inválido."
        });
      }

      const resultado =
        await pool.query(
          `
          DELETE FROM produtos
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Produto não encontrado."
        });
      }

      res.json({

        success:
          true,

        message:
          "Produto excluído com sucesso."
      });

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao excluir produto.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// OFERTAS - LISTAR
// ==========================================

app.get(
  "/api/ofertas",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
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

        success:
          true,

        ofertas:
          resultado.rows
      });

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao buscar ofertas.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// FILTROS - BUSCAR
// ==========================================

app.get(
  "/api/ofertas/filtros",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(`
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

        success:
          true,

        filtros:
          resultado.rows[0] ||
          FILTROS_PADRAO
      });

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao buscar filtros.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// FILTROS - SALVAR
// ==========================================

app.put(
  "/api/ofertas/filtros",
  async (req, res) => {

    try {

      const {
        precoMinimo,
        precoMaximo,
        avaliacaoMinima,
        vendasMinimas,
        limitePorCategoria,
        pontuacaoMinima
      } = req.body;

      const minimo =
        numeroSeguro(
          precoMinimo,
          0
        );

      const maximo =
        numeroSeguro(
          precoMaximo,
          999999
        );

      const avaliacao =
        numeroSeguro(
          avaliacaoMinima,
          0
        );

      const vendas =
        numeroSeguro(
          vendasMinimas,
          0
        );

      const limite =
        numeroSeguro(
          limitePorCategoria,
          10
        );

      const pontuacao =
        numeroSeguro(
          pontuacaoMinima,
          0
        );

      const resultado =
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
            pontuacao_minima
          )
          VALUES
          (
            1,
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
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
              EXCLUDED.pontuacao_minima

          RETURNING
            preco_minimo AS "precoMinimo",
            preco_maximo AS "precoMaximo",
            avaliacao_minima AS "avaliacaoMinima",
            vendas_minimas AS "vendasMinimas",
            limite_por_categoria AS "limitePorCategoria",
            pontuacao_minima AS "pontuacaoMinima"
          `,
          [
            minimo,
            maximo,
            avaliacao,
            vendas,
            limite,
            pontuacao
          ]
        );

      res.json({

        success:
          true,

        message:
          "Filtros salvos com sucesso.",

        filtros:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR FILTROS:",
        erro.message
      );

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao salvar filtros.",

        error:
          erro.message
      });
    }
  }
);
// ==========================================
// SALVAR OFERTA
// ==========================================

async function salvarOferta(
  produto
) {

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
      RETURNING *
      `,
      [
        produto.nome,
        produto.preco,
        produto.precoAnterior,
        produto.link,
        produto.plataforma,
        produto.imagem,
        produto.categoria,
        produto.avaliacao,
        produto.vendas,
        produto.pontuacao
      ]
    );

  return resultado.rows[0];
}

// ==========================================
// GERAR TEXTO DA OFERTA
// ==========================================

function gerarTextoOferta(
  oferta
) {

  const nome =
    oferta.nome ||
    "Produto";

  const preco =
    numeroSeguro(
      oferta.preco,
      0
    );

  const link =
    oferta.link ||
    "";

  const plataforma =
    oferta.plataforma ||
    "Mercado Livre";

  const avaliacao =
    numeroSeguro(
      oferta.avaliacao,
      0
    );

  const vendas =
    numeroSeguro(
      oferta.vendas,
      0
    );

  const precoFormatado =
    preco.toLocaleString(
      "pt-BR",
      {
        style:
          "currency",

        currency:
          "BRL"
      }
    );

  return [
    "🔥 OFERTA ENCONTRADA!",
    "",
    `📦 ${nome}`,
    "",
    `💰 Por apenas ${precoFormatado}`,
    "",
    `⭐ Avaliação: ${avaliacao.toFixed(1)}`,
    `🛒 Vendas: ${vendas}`,
    `🏪 ${plataforma}`,
    "",
    "👉 Confira aqui:",
    link,
    "",
    "⚡ Eletromax | Ofertas e novidades"
  ].join("\n");
}

// ==========================================
// ROTA - GERAR POST
// ==========================================

app.post(
  "/api/posts/gerar",
  async (req, res) => {

    try {

      const id =
        Number(
          req.body?.id ||
          req.body?.ofertaId
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Informe um ID de oferta válido."
        });
      }

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
            categoria,
            avaliacao,
            vendas,
            pontuacao
          FROM ofertas
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Oferta não encontrada."
        });
      }

      const oferta =
        resultado.rows[0];

      const texto =
        gerarTextoOferta(
          oferta
        );

      res.json({

        success:
          true,

        post: {
          texto,

          oferta
        }
      });

    } catch (erro) {

      console.error(
        "ERRO AO GERAR POST:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao gerar post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// POSTS - LISTAR
// ==========================================

app.get(
  "/api/posts",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            titulo,
            texto,
            imagem,
            plataforma,
            status,
            criado_em
          FROM posts
          ORDER BY
            id DESC
          `
        );

      res.json({

        success:
          true,

        posts:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "ERRO AO LISTAR POSTS:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao listar posts.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// POSTS - SALVAR
// ==========================================

app.post(
  "/api/posts",
  async (req, res) => {

    try {

      const {
        titulo,
        texto,
        imagem,
        plataforma,
        status
      } = req.body;

      if (
        !texto
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "O texto do post é obrigatório."
        });
      }

      const resultado =
        await pool.query(
          `
          INSERT INTO posts
          (
            titulo,
            texto,
            imagem,
            plataforma,
            status
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          RETURNING *
          `,
          [
            titulo ||
              "Oferta Eletromax",

            String(
              texto
            ).trim(),

            imagem ||
              null,

            plataforma ||
              "Instagram",

            status ||
              "rascunho"
          ]
        );

      res.status(
        201
      ).json({

        success:
          true,

        message:
          "Post salvo com sucesso.",

        post:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR POST:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao salvar post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// POSTS - EXCLUIR
// ==========================================

app.delete(
  "/api/posts/:id",
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "ID do post inválido."
        });
      }

      const resultado =
        await pool.query(
          `
          DELETE FROM posts
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Post não encontrado."
        });
      }

      res.json({

        success:
          true,

        message:
          "Post excluído com sucesso."
      });

    } catch (erro) {

      console.error(
        "ERRO AO EXCLUIR POST:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao excluir post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// MOTOR DE OFERTAS - STATUS
// ==========================================

app.get(
  "/api/motor-ofertas/status",
  async (req, res) => {

    try {

      const filtros =
        await obterFiltros();

      res.json({

        success:
          true,

        ativo:
          true,

        status:
          "active",

        filtros,

        mercadoLivre:
          Boolean(
            mercadoLivreAccessToken
          )
      });

    } catch (erro) {

      res.status(
        500
      ).json({

        success:
          false,

        ativo:
          false,

        message:
          erro.message
      });
    }
  }
);

// ==========================================
// GERADOR DE POSTS - STATUS
// ==========================================

app.get(
  "/api/gerador-posts/status",
  async (req, res) => {

    res.json({

      success:
        true,

      ativo:
        true,

      status:
        "active",

      plataforma:
        "Eletromax"
    });
  }
);
// ==========================================
// SALVAR OFERTA
// ==========================================

async function salvarOferta(
  produto
) {

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
      RETURNING *
      `,
      [
        produto.nome,
        produto.preco,
        produto.precoAnterior,
        produto.link,
        produto.plataforma,
        produto.imagem,
        produto.categoria,
        produto.avaliacao,
        produto.vendas,
        produto.pontuacao
      ]
    );

  return resultado.rows[0];
}

// ==========================================
// GERAR TEXTO DA OFERTA
// ==========================================

function gerarTextoOferta(
  oferta
) {

  const nome =
    oferta.nome ||
    "Produto";

  const preco =
    numeroSeguro(
      oferta.preco,
      0
    );

  const link =
    oferta.link ||
    "";

  const plataforma =
    oferta.plataforma ||
    "Mercado Livre";

  const avaliacao =
    numeroSeguro(
      oferta.avaliacao,
      0
    );

  const vendas =
    numeroSeguro(
      oferta.vendas,
      0
    );

  const precoFormatado =
    preco.toLocaleString(
      "pt-BR",
      {
        style:
          "currency",

        currency:
          "BRL"
      }
    );

  return [
    "🔥 OFERTA ENCONTRADA!",
    "",
    `📦 ${nome}`,
    "",
    `💰 Por apenas ${precoFormatado}`,
    "",
    `⭐ Avaliação: ${avaliacao.toFixed(1)}`,
    `🛒 Vendas: ${vendas}`,
    `🏪 ${plataforma}`,
    "",
    "👉 Confira aqui:",
    link,
    "",
    "⚡ Eletromax | Ofertas e novidades"
  ].join("\n");
}

// ==========================================
// ROTA - GERAR POST
// ==========================================

app.post(
  "/api/posts/gerar",
  async (req, res) => {

    try {

      const id =
        Number(
          req.body?.id ||
          req.body?.ofertaId
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Informe um ID de oferta válido."
        });
      }

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
            categoria,
            avaliacao,
            vendas,
            pontuacao
          FROM ofertas
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Oferta não encontrada."
        });
      }

      const oferta =
        resultado.rows[0];

      const texto =
        gerarTextoOferta(
          oferta
        );

      res.json({

        success:
          true,

        post: {
          texto,

          oferta
        }
      });

    } catch (erro) {

      console.error(
        "ERRO AO GERAR POST:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao gerar post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// POSTS - LISTAR
// ==========================================

app.get(
  "/api/posts",
  async (req, res) => {

    try {

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            titulo,
            texto,
            imagem,
            plataforma,
            status,
            criado_em
          FROM posts
          ORDER BY
            id DESC
          `
        );

      res.json({

        success:
          true,

        posts:
          resultado.rows
      });

    } catch (erro) {

      console.error(
        "ERRO AO LISTAR POSTS:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao listar posts.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// POSTS - SALVAR
// ==========================================

app.post(
  "/api/posts",
  async (req, res) => {

    try {

      const {
        titulo,
        texto,
        imagem,
        plataforma,
        status
      } = req.body;

      if (
        !texto
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "O texto do post é obrigatório."
        });
      }

      const resultado =
        await pool.query(
          `
          INSERT INTO posts
          (
            titulo,
            texto,
            imagem,
            plataforma,
            status
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          RETURNING *
          `,
          [
            titulo ||
              "Oferta Eletromax",

            String(
              texto
            ).trim(),

            imagem ||
              null,

            plataforma ||
              "Instagram",

            status ||
              "rascunho"
          ]
        );

      res.status(
        201
      ).json({

        success:
          true,

        message:
          "Post salvo com sucesso.",

        post:
          resultado.rows[0]
      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR POST:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao salvar post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// POSTS - EXCLUIR
// ==========================================

app.delete(
  "/api/posts/:id",
  async (req, res) => {

    try {

      const id =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(id)
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "ID do post inválido."
        });
      }

      const resultado =
        await pool.query(
          `
          DELETE FROM posts
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

      if (
        resultado.rowCount === 0
      ) {

        return res.status(
          404
        ).json({

          success:
            false,

          message:
            "Post não encontrado."
        });
      }

      res.json({

        success:
          true,

        message:
          "Post excluído com sucesso."
      });

    } catch (erro) {

      console.error(
        "ERRO AO EXCLUIR POST:",
        erro.message
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao excluir post.",

        error:
          erro.message
      });
    }
  }
);

// ==========================================
// MOTOR DE OFERTAS - STATUS
// ==========================================

app.get(
  "/api/motor-ofertas/status",
  async (req, res) => {

    try {

      const filtros =
        await obterFiltros();

      res.json({

        success:
          true,

        ativo:
          true,

        status:
          "active",

        filtros,

        mercadoLivre:
          Boolean(
            mercadoLivreAccessToken
          )
      });

    } catch (erro) {

      res.status(
        500
      ).json({

        success:
          false,

        ativo:
          false,

        message:
          erro.message
      });
    }
  }
);

// ==========================================
// GERADOR DE POSTS - STATUS
// ==========================================

app.get(
  "/api/gerador-posts/status",
  async (req, res) => {

    res.json({

      success:
        true,

      ativo:
        true,

      status:
        "active",

      plataforma:
        "Eletromax"
    });
  }
);
// ==========================================
// CONTINUAÇÃO - TESTE MERCADO LIVRE
// ==========================================

      const resposta =
        resultado.resposta;

      const dados =
        resultado.dados;

      if (!resposta.ok) {

        return res.status(
          resposta.status
        ).json({

          success:
            false,

          status:
            resposta.status,

          code:
            resposta.status === 401
              ? "ML_TOKEN_INVALID"
              : resposta.status === 403
                ? "ML_FORBIDDEN"
                : "ML_API_ERROR",

          message:
            dados.message ||
            dados.error ||
            "Mercado Livre recusou a requisição.",

          dados:
            dados
        });
      }

      res.json({

        success:
          true,

        status:
          resposta.status,

        conectado:
          true,

        userId:
          dados.id ||
          mercadoLivreUserId ||
          null,

        nickname:
          dados.nickname ||
          null,

        dados:
          dados
      });

    } catch (erro) {

      console.error(
        "ERRO TESTE ML:",
        erro
      );

      res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        code:
          erro.code ||
          "ML_TEST_ERROR",

        erro:
          erro.message,

        detalhes:
          erro.mlResponse ||
          null
      });
    }
  }
);

// ==========================================
// MERCADO LIVRE - BUSCAR E SALVAR (POST)
// ==========================================

app.post(
  "/api/mercadolivre/buscar-salvar",
  async (req, res) => {

    const busca =
      String(
        req.body?.q ||
        ""
      ).trim();

    const limite =
      Math.min(
        Math.max(
          Number(
            req.body?.limit ||
            20
          ),
          1
        ),
        50
      );

    if (!busca) {

      return res.status(
        400
      ).json({

        success:
          false,

        message:
          "Informe o termo de busca."
      });
    }

    try {

      const dados =
        await buscarMercadoLivre(
          busca,
          limite
        );

      const produtos =
        Array.isArray(
          dados?.results
        )
          ? dados.results
          : [];

      let salvos = 0;
      let atualizados = 0;

      for (
        const produto
        of produtos
      ) {

        if (
          !produto?.permalink
        ) {
          continue;
        }

        const oferta = {

          nome:
            produto.title ||
            "Produto",

          preco:
            produto.price ||
            0,

          precoAnterior:
            null,

          link:
            produto.permalink,

          plataforma:
            "Mercado Livre",

          imagem:
            produto.thumbnail ||
            "",

          categoria:
            "Busca manual",

          avaliacao:
            extrairAvaliacao(
              produto
            ),

          vendas:
            extrairVendas(
              produto
            ),

          pontuacao:
            calcularPontuacao(
              produto
            )
        };

        const antes =
          await pool.query(
            `
            SELECT id
            FROM ofertas
            WHERE link = $1
            LIMIT 1
            `,
            [
              oferta.link
            ]
          );

        const existia =
          antes.rowCount >
          0;

        const salvo =
          await salvarOferta(
            oferta
          );

        if (salvo) {

          if (existia) {

            atualizados++;

          } else {

            salvos++;
          }
        }
      }

      return res.json({

        success:
          true,

        encontrados:
          produtos.length,

        salvos,

        atualizados,

        totalProcessados:
          salvos +
          atualizados,

        message:
          `${salvos} novas ofertas salvas e ${atualizados} ofertas atualizadas.`
      });

    } catch (erro) {

      console.error(
        "ERRO BUSCAR E SALVAR ML:",
        erro
      );

      return res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        message:
          erro.message ||
          "Erro ao buscar e salvar ofertas.",

        code:
          erro.code ||
          "ML_SEARCH_ERROR",

        detalhes:
          erro.dados ||
          erro.mlResponse ||
          null
      });
    }
  }
);

// ==========================================
// MERCADO LIVRE - BUSCAR E SALVAR (GET)
// Compatibilidade com testes pelo navegador
// ==========================================

app.get(
  "/api/mercadolivre/buscar-salvar",
  async (req, res) => {

    const busca =
      String(
        req.query?.q ||
        ""
      ).trim();

    const limite =
      Math.min(
        Math.max(
          Number(
            req.query?.limit ||
            20
          ),
          1
        ),
        50
      );

    if (!busca) {

      return res.status(
        400
      ).json({

        success:
          false,

        message:
          "Informe o termo de busca. Exemplo: ?q=camera"
      });
    }

    try {

      console.log(
        "🔎 BUSCA ML:",
        busca
      );

      const dados =
        await buscarMercadoLivre(
          busca,
          limite
        );

      const produtos =
        Array.isArray(
          dados?.results
        )
          ? dados.results
          : [];

      let salvos = 0;
      let atualizados = 0;

      for (
        const produto
        of produtos
      ) {

        if (
          !produto?.permalink
        ) {
          continue;
        }

        const oferta = {

          nome:
            produto.title ||
            "Produto",

          preco:
            produto.price ||
            0,

          precoAnterior:
            null,

          link:
            produto.permalink,

          plataforma:
            "Mercado Livre",

          imagem:
            produto.thumbnail ||
            "",

          categoria:
            "Busca manual",

          avaliacao:
            extrairAvaliacao(
              produto
            ),

          vendas:
            extrairVendas(
              produto
            ),

          pontuacao:
            calcularPontuacao(
              produto
            )
        };

        const antes =
          await pool.query(
            `
            SELECT id
            FROM ofertas
            WHERE link = $1
            LIMIT 1
            `,
            [
              oferta.link
            ]
          );

        const existia =
          antes.rowCount >
          0;

        const salvo =
          await salvarOferta(
            oferta
          );

        if (salvo) {

          if (existia) {

            atualizados++;

          } else {

            salvos++;
          }
        }
      }

      return res.json({

        success:
          true,

        encontrados:
          produtos.length,

        salvos,

        atualizados,

        totalProcessados:
          salvos +
          atualizados,

        message:
          `${salvos} novas ofertas salvas e ${atualizados} ofertas atualizadas.`,

        ofertas:
          produtos.map(
            (
              produto
            ) => ({

              id:
                produto.id ||
                null,

              nome:
                produto.title ||
                "Produto",

              preco:
                produto.price ||
                0,

              link:
                produto.permalink ||
                "",

              imagem:
                produto.thumbnail ||
                "",

              plataforma:
                "Mercado Livre",

              avaliacao:
                extrairAvaliacao(
                  produto
                ),

              vendas:
                extrairVendas(
                  produto
                ),

              pontuacao:
                calcularPontuacao(
                  produto
                )
            })
          )
      });

    } catch (erro) {

      console.error(
        "ERRO BUSCA GET MERCADO LIVRE:",
        erro
      );

      return res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        message:
          erro.message ||
          "Erro ao buscar ofertas no Mercado Livre.",

        code:
          erro.code ||
          "ML_SEARCH_ERROR",

        detalhes:
          erro.dados ||
          erro.mlResponse ||
          null
      });
    }
  }
);

// ==========================================
// MOTOR AUTOMÁTICO
// ==========================================

app.post(
  "/api/ofertas/buscar-automaticamente",
  async (req, res) => {

    try {

      const filtros =
        await obterFiltros();

      let encontrados =
        0;

      let aprovados =
        0;

      let salvos =
        0;

      let atualizados =
        0;

      const ofertas =
        [];

      for (
        const categoria
        of CATEGORIAS_PADRAO
      ) {

        console.log(
          "================================="
        );

        console.log(
          "BUSCA AUTOMÁTICA:",
          categoria.nome
        );

        try {

          const dados =
            await buscarMercadoLivre(
              categoria.busca,
              Math.min(
                filtros.limitePorCategoria,
                50
              )
            );

          const produtos =
            Array.isArray(
              dados.results
            )
              ? dados.results
              : [];

          encontrados +=
            produtos.length;

          for (
            const produto
            of produtos
          ) {

            const analise =
              analisarProduto(
                produto,
                categoria,
                filtros
              );

            if (
              !analise.aprovado
            ) {

              continue;
            }

            aprovados++;

            const oferta =
              analise.produto;

            const antes =
              await pool.query(
                `
                SELECT id
                FROM ofertas
                WHERE link = $1
                LIMIT 1
                `,
                [
                  oferta.link
                ]
              );

            const existia =
              antes.rowCount >
              0;

            const salvo =
              await salvarOferta(
                oferta
              );

            if (
              salvo
            ) {

              ofertas.push(
                salvo
              );

              if (
                existia
              ) {

                atualizados++;

              } else {

                salvos++;
              }
            }
          }

        } catch (
          erroCategoria
        ) {

          console.error(
            "❌ ERRO NA CATEGORIA:",
            categoria.nome,

            erroCategoria.message
          );
        }
      }

      return res.json({

        success:
          true,

        encontrados,

        aprovados,

        salvos,

        atualizados,

        totalProcessados:
          salvos +
          atualizados,

        ofertas
      });

    } catch (erro) {

      console.error(
        "❌ ERRO MOTOR AUTOMÁTICO:",
        erro
      );

      return res.status(
        erro.status ||
        500
      ).json({

        success:
          false,

        message:
          erro.message ||
          "Erro no motor automático.",

        code:
          erro.code ||
          "AUTO_SEARCH_ERROR",

        detalhes:
          erro.dados ||
          erro.mlResponse ||
          null
      });
    }
  }
);
// ==========================================
// CONTINUAÇÃO DA INICIALIZAÇÃO
// ==========================================

          console.log(
            "REFRESH TOKEN:",
            mercadoLivreRefreshToken
              ? "DISPONÍVEL"
              : "NÃO DISPONÍVEL"
          );

          console.log(
            "MOTOR DE OFERTAS:",
            "ATIVO"
          );

          console.log(
            "FILTRO AUTOMÁTICO:",
            "ATIVO"
          );

          console.log(
            "GERADOR DE POSTS:",
            "ATIVO"
          );

          console.log(
            "================================="
          );

          console.log(
            "API:",
            `http://localhost:${PORT}/api`
          );

          console.log(
            "STATUS ML:",
            `http://localhost:${PORT}/api/mercadolivre/status`
          );

          console.log(
            "TESTE ML:",
            `http://localhost:${PORT}/api/mercadolivre/teste`
          );

          console.log(
            "HEALTH:",
            `http://localhost:${PORT}/health`
          );

          console.log(
            "OAUTH CALLBACK:",
            `${obterRedirectUri()}`
          );

          console.log(
            "================================="
          );

          console.log(
            "ELETROMAX V2 PRONTO PARA USO!"
          );

          console.log(
            "================================="
          );
        }
      );

  } catch (erro) {

    console.error(
      "================================="
    );

    console.error(
      "ERRO FATAL AO INICIAR ELETROMAX V2:"
    );

    console.error(
      erro
    );

    console.error(
      "================================="
    );

    process.exit(
      1
    );
  }
}

// ==========================================
// EXECUTAR
// ==========================================

iniciarServidor();
