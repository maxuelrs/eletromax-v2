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
  res.sendFile(
    path.join(frontendPath, "index.html"),
    (erro) => {
      if (erro && !res.headersSent) {
        res.status(200).send(`
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
            <p>Servidor funcionando corretamente.</p>
            <p>
              API:
              <a href="/api">Abrir API</a>
            </p>
            <p>
              Status:
              <a href="/api/status">
                Ver status
              </a>
            </p>
            <p>
              Health:
              <a href="/health">
                Ver saúde do servidor
              </a>
            </p>
          </body>
          </html>
        `);
      }
    }
  );
});

// ==========================================
// POSTGRESQL
// ==========================================

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️ DATABASE_URL não configurada."
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

pool.on(
  "error",
  (erro) => {
    console.error(
      "ERRO INESPERADO NO POOL POSTGRES:",
      erro.message
    );
  }
);

// ==========================================
// VARIÁVEIS MERCADO LIVRE
// ==========================================

let mercadoLivreAccessToken =
  process.env.ML_ACCESS_TOKEN ||
  null;

let mercadoLivreRefreshToken =
  process.env.ML_REFRESH_TOKEN ||
  null;

let mercadoLivreTokenExpiresAt =
  process.env.ML_TOKEN_EXPIRES_AT
    ? Number(
        process.env.ML_TOKEN_EXPIRES_AT
      )
    : null;

let mercadoLivreUserId =
  process.env.ML_USER_ID ||
  null;

// ==========================================
// CONFIGURAÇÕES PADRÃO
// ==========================================

const CATEGORIAS_PADRAO = [

  {
    nome:
      "Casa e decoração",

    busca:
      "casa decoração"
  },

  {
    nome:
      "Automotivo",

    busca:
      "acessórios automotivos"
  },

  {
    nome:
      "Ferramentas e construção",

    busca:
      "ferramentas"
  },

  {
    nome:
      "Eletrônicos e acessórios",

    busca:
      "eletrônicos acessórios"
  },

  {
    nome:
      "Segurança",

    busca:
      "câmera segurança"
  },

  {
    nome:
      "Utilidades domésticas",

    busca:
      "utilidades domésticas"
  },

  {
    nome:
      "Informática",

    busca:
      "informática"
  },

  {
    nome:
      "Celulares e acessórios",

    busca:
      "celular acessórios"
  }

];

const FILTROS_PADRAO = {

  precoMinimo:
    0,

  precoMaximo:
    100000,

  avaliacaoMinima:
    0,

  vendasMinimas:
    0,

  limitePorCategoria:
    20,

  pontuacaoMinima:
    0

};

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function numeroSeguro(
  valor,
  padrao = 0
) {

  const numero =
    Number(valor);

  return Number.isFinite(
    numero
  )
    ? numero
    : padrao;

}

function normalizarPreco(
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return "";

  }

  return String(
    valor
  );

}

function extrairAvaliacao(
  produto
) {

  return numeroSeguro(

    produto
      ?.seller
      ?.seller_reputation
      ?.transactions
      ?.ratings
      ?.positive,

    0

  );

}

function extrairVendas(
  produto
) {

  return numeroSeguro(

    produto
      ?.sold_quantity,

    0

  );

}

// ==========================================
// CALCULAR PONTUAÇÃO
// ==========================================

function calcularPontuacao(
  produto
) {

  let pontos = 0;

  const vendas =
    extrairVendas(
      produto
    );

  const reputacao =
    extrairAvaliacao(
      produto
    );

  if (
    reputacao >= 0.95
  ) {

    pontos += 30;

  } else if (
    reputacao >= 0.90
  ) {

    pontos += 20;

  } else if (
    reputacao >= 0.80
  ) {

    pontos += 10;

  }

  if (
    vendas >= 1000
  ) {

    pontos += 30;

  } else if (
    vendas >= 500
  ) {

    pontos += 25;

  } else if (
    vendas >= 100
  ) {

    pontos += 15;

  } else if (
    vendas >= 20
  ) {

    pontos += 5;

  }

  if (
    produto
      ?.shipping
      ?.free_shipping
  ) {

    pontos += 15;

  }

  if (
    produto
      ?.official_store_id
  ) {

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

    // ========================================
    // TESTAR CONEXÃO
    // ========================================

    await pool.query(
      "SELECT 1"
    );


    // ========================================
    // TABELA PRODUTOS
    // ========================================

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


    // ========================================
    // TABELA OFERTAS
    // ========================================

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


    // ========================================
    // MIGRAÇÃO AUTOMÁTICA DA TABELA OFERTAS
    // ========================================

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


    // ========================================
    // CORRIGIR VALORES NULOS
    // ========================================

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


    // ========================================
    // ÍNDICE ÚNICO DO LINK
    // ========================================

    // Criar índice somente se não houver
    // links vazios duplicados.

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


    // ========================================
    // TABELA CONFIGURAÇÕES
    // ========================================

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


    // ========================================
    // TABELA FILTROS
    // ========================================

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


    // ========================================
    // TABELA TOKENS MERCADO LIVRE
    // ========================================

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


    // ========================================
    // GARANTIR COLUNAS DOS TOKENS
    // ========================================

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


    // ========================================
    // CARREGAR TOKEN MERCADO LIVRE
    // ========================================

    await carregarTokenMercadoLivre();


    // ========================================
    // CONFIRMAÇÃO
    // ========================================

    console.log(
      "================================="
    );

    console.log(
      "✅ BANCO DE DADOS CONECTADO"
    );

    console.log(
      "✅ TABELA PRODUTOS PRONTA"
    );

    console.log(
      "✅ TABELA OFERTAS MIGRADA"
    );

    console.log(
      "✅ COLUNA 'nome' GARANTIDA"
    );

    console.log(
      "✅ TABELA CONFIGURAÇÕES PRONTA"
    );

    console.log(
      "✅ TABELA FILTROS PRONTA"
    );

    console.log(
      "✅ TOKENS MERCADO LIVRE PRONTOS"
    );

    console.log(
      "================================="
    );


    return true;

  } catch (
    erro
  ) {

    console.error(
      "================================="
    );

    console.error(
      "❌ ERRO AO INICIALIZAR BANCO:"
    );

    console.error(
      erro.message
    );

    console.error(
      "================================="
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

      userId ||
        null,

      accessToken,

      refreshToken ||
        null,

      expiresAt ||
        null

    ]

  );

  mercadoLivreAccessToken =
    accessToken;

  if (
    refreshToken
  ) {

    mercadoLivreRefreshToken =
      refreshToken;

  }

  mercadoLivreTokenExpiresAt =
    expiresAt ||
    null;

  mercadoLivreUserId =
    userId ||
    null;

  console.log(
    "TOKEN MERCADO LIVRE SALVO NO BANCO"
  );

}

// ==========================================
// CARREGAR TOKEN
// ==========================================

async function carregarTokenMercadoLivre() {

  if (
    !process.env.DATABASE_URL
  ) {

    return;

  }

  try {

    const resultado =
      await pool.query(`
        SELECT
          user_id,
          access_token,
          refresh_token,
          expires_at
        FROM mercadolivre_tokens
        WHERE id = 1
        LIMIT 1
      `);

    if (
      resultado.rowCount === 0
    ) {

      console.log(
        "NENHUM TOKEN DO MERCADO LIVRE SALVO."
      );

      return;

    }

    const token =
      resultado.rows[0];

    mercadoLivreUserId =
      token.user_id ||
      null;

    mercadoLivreAccessToken =
      token.access_token ||
      null;

    mercadoLivreRefreshToken =
      token.refresh_token ||
      null;

    mercadoLivreTokenExpiresAt =
      token.expires_at
        ? Number(
            token.expires_at
          )
        : null;

    console.log(
      "TOKEN MERCADO LIVRE CARREGADO DO BANCO"
    );

  } catch (
    erro
  ) {

    console.error(
      "ERRO AO CARREGAR TOKEN ML:",
      erro.message
    );

  }

}

// ==========================================
// RENOVAR TOKEN
// ==========================================

async function renovarTokenMercadoLivre() {

  if (
    !mercadoLivreRefreshToken
  ) {

    throw new Error(
      "Refresh token do Mercado Livre não disponível."
    );

  }

  if (
    !process.env.ML_CLIENT_ID ||
    !process.env.ML_CLIENT_SECRET
  ) {

    throw new Error(
      "ML_CLIENT_ID ou ML_CLIENT_SECRET não configurados."
    );

  }

  console.log(
    "RENOVANDO TOKEN MERCADO LIVRE..."
  );

  const resposta =
    await fetch(
      "https://api.mercadolibre.com/oauth/token",
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded"

        },

        body:
          new URLSearchParams({

            grant_type:
              "refresh_token",

            client_id:
              process.env.ML_CLIENT_ID,

            client_secret:
              process.env.ML_CLIENT_SECRET,

            refresh_token:
              mercadoLivreRefreshToken

          }).toString()

      }
    );

  const dados =
    await resposta
      .json()
      .catch(
        () => ({})
      );

  if (
    !resposta.ok
  ) {

    console.error(
      "ERRO AO RENOVAR TOKEN:",
      dados
    );

    throw new Error(

      dados.message ||

      dados.error_description ||

      "Erro ao renovar token do Mercado Livre."

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

  await salvarTokenMercadoLivre({

    userId:
      mercadoLivreUserId,

    accessToken:
      dados.access_token,

    refreshToken:
      dados.refresh_token ||
      mercadoLivreRefreshToken,

    expiresAt

  });

  console.log(
    "TOKEN MERCADO LIVRE RENOVADO"
  );

  return dados.access_token;

}

// ==========================================
// OBTER TOKEN VÁLIDO
// ==========================================

async function obterTokenMercadoLivre() {

  if (
    !mercadoLivreAccessToken &&
    process.env.DATABASE_URL
  ) {

    await carregarTokenMercadoLivre();

  }

  if (
    !mercadoLivreAccessToken
  ) {

    throw new Error(
      "Mercado Livre não está conectado."
    );

  }

  const tokenPrestesAExpirar =

    mercadoLivreTokenExpiresAt &&

    Date.now() >

      mercadoLivreTokenExpiresAt -

      5 *
      60 *
      1000;

  if (
    tokenPrestesAExpirar &&
    mercadoLivreRefreshToken
  ) {

    return await renovarTokenMercadoLivre();

  }

  return mercadoLivreAccessToken;

}

// ==========================================
// BUSCAR NO MERCADO LIVRE
// ==========================================

async function buscarMercadoLivre(
  busca,
  limite = 20
) {

  const termo =
    String(
      busca ||
      ""
    ).trim();

  if (
    !termo
  ) {

    throw new Error(
      "Informe o termo de busca."
    );

  }

  const quantidade =
    Math.min(

      Math.max(

        Number(
          limite
        ) ||
        20,

        1

      ),

      50

    );

  const token =
    await obterTokenMercadoLivre();

  const url =
    new URL(
      "https://api.mercadolibre.com/sites/MLB/search"
    );

  url.searchParams.set(
    "q",
    termo
  );

  url.searchParams.set(
    "limit",
    String(
      quantidade
    )
  );

  const resposta =
    await fetch(
      url,
      {

        headers: {

          Authorization:
            `Bearer ${token}`,

          Accept:
            "application/json"

        }

      }
    );

  const dados =
    await resposta
      .json()
      .catch(
        () => ({})
      );

  if (
    !resposta.ok
  ) {

    const erro =
      new Error(

        dados.message ||

        dados.error ||

        `Erro na API do Mercado Livre (${resposta.status}).`

      );

    erro.status =
      resposta.status;

    erro.code =
      "ML_SEARCH_ERROR";

    if (
      resposta.status ===
      401
    ) {

      erro.code =
        "ML_TOKEN_INVALID";

    }

    if (
      resposta.status ===
      403
    ) {

      erro.code =
        "ML_FORBIDDEN";

    }

    throw erro;

  }

  return dados;

}
// ==========================================
// STATUS DO SISTEMA
// ==========================================

app.get(
  "/api/status",
  async (req, res) => {

    try {

      let banco =
        "disconnected";

      if (
        process.env.DATABASE_URL
      ) {

        await pool.query(
          "SELECT NOW()"
        );

        banco =
          "connected";

      }

      res.json({

        success:
          true,

        status:
          "online",

        database:
          banco,

        mercadolivre:
          mercadoLivreAccessToken
            ? "connected"
            : "not_connected",

        motorOfertas:
          "active",

        geradorPosts:
          "active"

      });

    } catch (
      erro
    ) {

      res.status(
        500
      ).json({

        success:
          false,

        status:
          "offline",

        database:
          "disconnected",

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
        await pool.query(`
          SELECT
            COUNT(*)::int AS total
          FROM produtos
        `);

      const ofertas =
        await pool.query(`
          SELECT
            COUNT(*)::int AS total
          FROM ofertas
        `);

      const mercadoLivre =
        await pool.query(`
          SELECT
            COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = 'Mercado Livre'
        `);

      const shopee =
        await pool.query(`
          SELECT
            COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = 'Shopee'
        `);

      res.json({

        success:
          true,

        totalProdutos:
          produtos.rows[0].total,

        totalOfertas:
          ofertas.rows[0].total,

        totalMercadoLivre:
          mercadoLivre.rows[0].total,

        totalShopee:
          shopee.rows[0].total

      });

    } catch (
      erro
    ) {

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao carregar dashboard.",

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
          ORDER BY
            id DESC
        `);

      res.json({

        success:
          true,

        produtos:
          resultado.rows

      });

    } catch (
      erro
    ) {

      res.status(
        500
      ).json({

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

    } catch (
      erro
    ) {

      console.error(
        "ERRO AO SALVAR PRODUTO:",
        erro.message
      );

      res.status(
        500
      ).json({

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
        !Number.isInteger(
          id
        )
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

          [
            id
          ]

        );

      if (
        resultado.rowCount ===
        0
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

    } catch (
      erro
    ) {

      res.status(
        500
      ).json({

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

            preco_anterior
              AS "precoAnterior",

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

    } catch (
      erro
    ) {

      res.status(
        500
      ).json({

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

            preco_minimo
              AS "precoMinimo",

            preco_maximo
              AS "precoMaximo",

            avaliacao_minima
              AS "avaliacaoMinima",

            vendas_minimas
              AS "vendasMinimas",

            limite_por_categoria
              AS "limitePorCategoria",

            pontuacao_minima
              AS "pontuacaoMinima"

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

    } catch (
      erro
    ) {

      res.status(
        500
      ).json({

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
          100000
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
        Math.min(

          Math.max(

            Math.trunc(

              numeroSeguro(
                limitePorCategoria,
                20
              )

            ),

            1

          ),

          50

        );

      const pontuacao =
        numeroSeguro(
          pontuacaoMinima,
          0
        );

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

        filtros: {

          precoMinimo:
            minimo,

          precoMaximo:
            maximo,

          avaliacaoMinima:
            avaliacao,

          vendasMinimas:
            vendas,

          limitePorCategoria:
            limite,

          pontuacaoMinima:
            pontuacao

        }

      });

    } catch (
      erro
    ) {

      console.error(
        "ERRO AO SALVAR FILTROS:",
        erro.message
      );

      res.status(
        500
      ).json({

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
// OBTER FILTROS
// ==========================================

async function obterFiltros() {

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
    resultado.rowCount ===
    0
  ) {

    return {

      ...FILTROS_PADRAO

    };

  }

  const f =
    resultado.rows[0];

  return {

    precoMinimo:
      numeroSeguro(
        f.preco_minimo,
        0
      ),

    precoMaximo:
      numeroSeguro(
        f.preco_maximo,
        100000
      ),

    avaliacaoMinima:
      numeroSeguro(
        f.avaliacao_minima,
        0
      ),

    vendasMinimas:
      numeroSeguro(
        f.vendas_minimas,
        0
      ),

    limitePorCategoria:
      numeroSeguro(
        f.limite_por_categoria,
        20
      ),

    pontuacaoMinima:
      numeroSeguro(
        f.pontuacao_minima,
        0
      )

  };

}

// ==========================================
// ANALISAR PRODUTO
// ==========================================

function analisarProduto(

  produto,

  categoria,

  filtros

) {

  const preco =
    numeroSeguro(
      produto.price,
      0
    );

  const vendas =
    extrairVendas(
      produto
    );

  const avaliacao =
    extrairAvaliacao(
      produto
    );

  const pontuacao =
    calcularPontuacao(
      produto
    );

  if (
    preco <
    filtros.precoMinimo
  ) {

    return {

      aprovado:
        false,

      motivo:
        "Preço abaixo do mínimo."

    };

  }

  if (
    preco >
    filtros.precoMaximo
  ) {

    return {

      aprovado:
        false,

      motivo:
        "Preço acima do máximo."

    };

  }

  if (
    avaliacao <
    filtros.avaliacaoMinima
  ) {

    return {

      aprovado:
        false,

      motivo:
        "Avaliação abaixo do mínimo."

    };

  }

  if (
    vendas <
    filtros.vendasMinimas
  ) {

    return {

      aprovado:
        false,

      motivo:
        "Vendas abaixo do mínimo."

    };

  }

  if (
    pontuacao <
    filtros.pontuacaoMinima
  ) {

    return {

      aprovado:
        false,

      motivo:
        "Pontuação abaixo do mínimo."

    };

  }

  return {

    aprovado:
      true,

    produto: {

      nome:
        produto.title ||
        "Produto",

      preco:
        preco,

      precoAnterior:
        null,

      link:
        produto.permalink ||
        "",

      imagem:
        produto.thumbnail ||
        "",

      plataforma:
        "Mercado Livre",

      categoria:
        categoria.nome,

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
// SALVAR OFERTA
// ==========================================

async function salvarOferta(
  oferta
) {

  if (
    !oferta ||
    !oferta.link
  ) {

    return false;

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

        oferta.nome ||
          "Produto",

        normalizarPreco(
          oferta.preco
        ),

        oferta.precoAnterior ||
          null,

        oferta.link,

        oferta.plataforma ||
          "Mercado Livre",

        oferta.imagem ||
          "",

        oferta.categoria ||
          "",

        numeroSeguro(
          oferta.avaliacao,
          0
        ),

        Math.trunc(

          numeroSeguro(
            oferta.vendas,
            0
          )

        ),

        numeroSeguro(
          oferta.pontuacao,
          0
        )

      ]

    );

  return (
    resultado.rowCount >
    0
  );

}
// ==========================================
// STATUS MERCADO LIVRE
// ==========================================

app.get(
  "/api/mercadolivre/status",
  async (req, res) => {

    try {

      if (
        !mercadoLivreAccessToken &&
        process.env.DATABASE_URL
      ) {

        await carregarTokenMercadoLivre();

      }

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

            process.env.ML_CLIENT_SECRET &&

            process.env.ML_REDIRECT_URI

          ),

        userId:
          mercadoLivreUserId ||
          null

      });

    } catch (
      erro
    ) {

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
// BUSCAR E SALVAR OFERTAS DO MERCADO LIVRE
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

    if (
      !busca
    ) {

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

      console.log(
        "================================="
      );

      console.log(
        "BUSCAR E SALVAR MERCADO LIVRE:"
      );

      console.log(
        busca
      );

      console.log(
        "================================="
      );

      const dados =
        await buscarMercadoLivre(

          busca,

          limite

        );

      const produtos =
        Array.isArray(
          dados.results
        )

          ? dados.results

          : [];

      let salvos =
        0;

      let atualizados =
        0;

      for (
        const produto
        of produtos
      ) {

        if (
          !produto.permalink
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

        if (
          salvo
        ) {

          if (
            existia
          ) {

            atualizados++;

          } else {

            salvos++;

          }

        }

      }

      res.json({

        success:
          true,

        encontrados:
          produtos.length,

        salvos:
          salvos,

        atualizados:
          atualizados,

        totalProcessados:
          salvos +
          atualizados,

        message:

          `${salvos} novas ofertas salvas e ${atualizados} ofertas atualizadas.`

      });

    } catch (
      erro
    ) {

      console.error(
        "ERRO BUSCAR E SALVAR:",
        erro
      );

      res.status(
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
          "ML_SEARCH_ERROR"

      });

    }

  }
);

// ==========================================
// MOTOR AUTOMÁTICO DE OFERTAS
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

      const ofertas = [];

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

        console.log(
          "TERMO:",
          categoria.busca
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

              if (
                existia
              ) {

                atualizados++;

              } else {

                salvos++;

              }

              ofertas.push(
                oferta
              );

            }

          }

        } catch (
          erroCategoria
        ) {

          console.error(

            "ERRO NA CATEGORIA:",

            categoria.nome,

            erroCategoria.message

          );

        }

      }

      ofertas.sort(

        (
          a,
          b
        ) =>

          Number(
            b.pontuacao
          ) -

          Number(
            a.pontuacao
          )

      );

      res.json({

        success:
          true,

        message:
          "Busca automática concluída.",

        encontrados:
          encontrados,

        aprovados:
          aprovados,

        salvos:
          salvos,

        atualizados:
          atualizados,

        totalProcessados:
          salvos +
          atualizados,

        ofertas:
          ofertas

      });

    } catch (
      erro
    ) {

      console.error(
        "ERRO MOTOR AUTOMÁTICO:",
        erro
      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao executar busca automática.",

        error:
          erro.message

      });

    }

  }
);

// ==========================================
// GERAR POST INDIVIDUAL
// ==========================================

app.post(
  "/api/ofertas/gerar-post",
  async (req, res) => {

    try {

      const {

        nome,

        preco,

        precoAnterior,

        plataforma,

        link,

        categoria

      } = req.body;

      if (
        !nome
      ) {

        return res.status(
          400
        ).json({

          success:
            false,

          message:
            "Nome do produto é obrigatório."

        });

      }

      const texto =

`🔥 OFERTA IMPERDÍVEL!

📦 ${nome}

${
  categoria
    ? `🏷️ Categoria: ${categoria}\n`
    : ""
}${
  precoAnterior
    ? `💸 De: ${precoAnterior}\n`
    : ""
}💰 Por apenas: ${
  preco ||
  "Consulte o preço"
}

🛒 Compre aqui:
${
  link ||
  "Link não informado"
}

${
  plataforma
    ? `🛍️ Plataforma: ${plataforma}\n`
    : ""
}
⚡ Eletromax
🔥 Ofertas selecionadas para você!`;

      res.json({

        success:
          true,

        texto:
          texto

      });

    } catch (
      erro
    ) {

      console.error(
        "ERRO GERAR POST:",
        erro
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
// GERAR POST COM AS MELHORES OFERTAS
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
              10
            ),

            1

          ),

          20

        );

      const resultado =
        await pool.query(

          `
          SELECT

            nome,

            preco,

            preco_anterior
              AS "precoAnterior",

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

          [
            limite
          ]

        );

      const ofertas =
        resultado.rows;

      if (
        ofertas.length ===
        0
      ) {

        return res.json({

          success:
            true,

          quantidade:
            0,

          texto:
            "Nenhuma oferta disponível para gerar o post.",

          ofertas:
            []

        });

      }

      let texto =

`🔥🔥 MELHORES OFERTAS ELETROMAX 🔥🔥

Selecionamos ofertas especiais para você! 👇

`;

      ofertas.forEach(

        (
          oferta,
          index
        ) => {

          texto +=

`${index + 1}️⃣ ${oferta.nome}

💰 Por: R$ ${oferta.preco}

${
  oferta.precoAnterior
    ? `💸 De: R$ ${oferta.precoAnterior}\n`
    : ""
}🛒 Comprar:
${oferta.link}

`;

        }

      );

      texto +=

`⚡ Eletromax
🔥 Ofertas e produtos selecionados!

📲 Aproveite enquanto durar o estoque e o preço!`;

      res.json({

        success:
          true,

        quantidade:
          ofertas.length,

        texto:
          texto,

        ofertas:
          ofertas

      });

    } catch (
      erro
    ) {

      console.error(

        "ERRO GERAR MELHORES OFERTAS:",

        erro

      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao gerar post das melhores ofertas.",

        error:
          erro.message

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

      const config =
        resultado.rows[0] ||
        {

          id:
            1,

          nome_loja:
            "Eletromax",

          link_mercadolivre:
            "",

          link_shopee:
            "",

          link_whatsapp:
            ""

        };

      res.json({

        success:
          true,

        configuracoes:
          config

      });

    } catch (
      erro
    ) {

      console.error(

        "ERRO CONFIGURAÇÕES:",

        erro

      );

      res.status(
        500
      ).json({

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

          nomeLoja ||
            "Eletromax",

          linkMercadoLivre ||
            "",

          linkShopee ||
            "",

          linkWhatsapp ||
            ""

        ]

      );

      res.json({

        success:
          true,

        message:
          "Configurações salvas com sucesso."

      });

    } catch (
      erro
    ) {

      console.error(

        "ERRO SALVAR CONFIGURAÇÕES:",

        erro

      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao salvar configurações.",

        error:
          erro.message

      });

    }

  }
);

// ==========================================
// LINKS DAS REDES
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
        resultado.rows[0] ||
        {};

      res.json({

        success:
          true,

        whatsapp:
          config.link_whatsapp ||
          "",

        shopee:
          config.link_shopee ||
          "",

        mercadolivre:
          config.link_mercadolivre ||
          ""

      });

    } catch (
      erro
    ) {

      console.error(

        "ERRO AO BUSCAR LINKS:",

        erro.message

      );

      res.status(
        500
      ).json({

        success:
          false,

        message:
          "Erro ao buscar links.",

        error:
          erro.message

      });

    }

  }
);

// ==========================================
// API PRINCIPAL
// ==========================================

app.get(
  "/api",
  (req, res) => {

    res.json({

      success:
        true,

      message:
        "Eletromax V2 API funcionando!",

      version:
        "2.0",

      mercadoLivre:
        mercadoLivreAccessToken
          ? "conectado"
          : "não conectado",

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
// ROTA DE SAÚDE DO SERVIDOR
// ==========================================

app.get(
  "/health",
  async (req, res) => {

    try {

      await pool.query(
        "SELECT 1"
      );

      res.status(200).json({

        success:
          true,

        status:
          "online",

        database:
          "connected",

        mercadoLivre:
          mercadoLivreAccessToken
            ? "connected"
            : "not_connected",

        timestamp:
          new Date().toISOString()

      });

    } catch (erro) {

      console.error(
        "ERRO HEALTH CHECK:",
        erro.message
      );

      res.status(503).json({

        success:
          false,

        status:
          "offline",

        database:
          "disconnected",

        mercadoLivre:
          mercadoLivreAccessToken
            ? "connected"
            : "not_connected",

        error:
          erro.message,

        timestamp:
          new Date().toISOString()

      });

    }

  }
);


// ==========================================
// ROTA 404 DA API
// ==========================================

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({

      success:
        false,

      message:
        "Rota da API não encontrada.",

      rota:
        req.originalUrl

    });

  }
);


// ==========================================
// ROTA 404 GERAL
// ==========================================

app.use(
  (req, res) => {

    res.status(404).send(

      `
      <!DOCTYPE html>

      <html lang="pt-BR">

      <head>

        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>
          Eletromax V2
        </title>

        <style>

          body {

            font-family:
              Arial,
              sans-serif;

            background:
              #f5f5f5;

            display:
              flex;

            align-items:
              center;

            justify-content:
              center;

            min-height:
              100vh;

            margin:
              0;

          }

          .box {

            background:
              white;

            padding:
              40px;

            border-radius:
              12px;

            text-align:
              center;

            box-shadow:
              0 4px 20px
              rgba(
                0,
                0,
                0,
                0.1
              );

          }

          h1 {

            margin-top:
              0;

          }

          a {

            display:
              inline-block;

            margin-top:
              20px;

            padding:
              12px 20px;

            background:
              #111;

            color:
              white;

            text-decoration:
              none;

            border-radius:
              8px;

          }

        </style>

      </head>

      <body>

        <div class="box">

          <h1>
            ⚡ Eletromax V2
          </h1>

          <p>
            Página não encontrada.
          </p>

          <a href="/">
            Voltar para o painel
          </a>

        </div>

      </body>

      </html>
      `

    );

  }
);


// ==========================================
// TRATAMENTO GLOBAL DE ERROS
// ==========================================

app.use(
  (
    erro,
    req,
    res,
    next
  ) => {

    console.error(
      "================================="
    );

    console.error(
      "ERRO GLOBAL DO SERVIDOR:"
    );

    console.error(
      erro
    );

    console.error(
      "================================="
    );

    if (
      res.headersSent
    ) {

      return next(
        erro
      );

    }

    res.status(
      erro.status ||
      500
    ).json({

      success:
        false,

      message:
        "Erro interno no servidor.",

      error:

        process.env.NODE_ENV ===
        "production"

          ? undefined

          : erro.message

    });

  }
);


// ==========================================
// VARIÁVEL DO SERVIDOR
// ==========================================

let servidor =
  null;


// ==========================================
// ENCERRAMENTO SEGURO
// ==========================================

async function desligarServidor(
  sinal
) {

  console.log(
    `Recebido ${sinal}. Encerrando Eletromax V2...`
  );

  try {

    if (
      servidor
    ) {

      await new Promise(
        (
          resolve
        ) => {

          servidor.close(
            () => {

              console.log(
                "Servidor HTTP encerrado."
              );

              resolve();

            }
          );

        }
      );

    }

    await pool.end();

    console.log(
      "Banco de dados desconectado."
    );

    console.log(
      "Eletromax V2 encerrado com sucesso."
    );

    process.exit(
      0
    );

  } catch (
    erro
  ) {

    console.error(
      "ERRO AO ENCERRAR SERVIDOR:",
      erro.message
    );

    process.exit(
      1
    );

  }

}


process.on(
  "SIGTERM",
  () => {

    desligarServidor(
      "SIGTERM"
    );

  }
);


process.on(
  "SIGINT",
  () => {

    desligarServidor(
      "SIGINT"
    );

  }
);


// ==========================================
// INICIALIZAÇÃO ÚNICA DO ELETROMAX V2
// ==========================================

async function iniciarServidor() {

  console.log(
    "================================="
  );

  console.log(
    "INICIANDO ELETROMAX V2..."
  );

  console.log(
    "================================="
  );

  try {

    const bancoOK =
      await inicializarBanco();

    if (
      !bancoOK
    ) {

      console.error(
        "⚠️ ATENÇÃO: O banco apresentou erro."
      );

    }

    servidor =
      app.listen(

        PORT,

        "0.0.0.0",

        () => {

          console.log(
            "================================="
          );

          console.log(
            "⚡ ELETROMAX V2 ONLINE"
          );

          console.log(
            "================================="
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
            "MERCADO LIVRE:",
            mercadoLivreAccessToken
              ? "CONECTADO"
              : "NÃO CONECTADO"
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
            "WHATSAPP:",
            "PREPARADO"
          );

          console.log(
            "REDES SOCIAIS:",
            "PREPARADO"
          );

          console.log(
            "================================="
          );

          console.log(
            "API:",
            `http://localhost:${PORT}/api`
          );

          console.log(
            "HEALTH:",
            `http://localhost:${PORT}/health`
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

  } catch (
    erro
  ) {

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
// EXECUTAR SERVIDOR
// ==========================================

iniciarServidor();
