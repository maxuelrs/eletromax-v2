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
app.use(express.urlencoded({ extended: true }));

// ==========================================
// FRONTEND
// ==========================================

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ==========================================
// POSTGRESQL
// ==========================================

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL não configurada.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
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
        categoria TEXT,
        avaliacao NUMERIC DEFAULT 0,
        vendas INTEGER DEFAULT 0,
        pontuacao NUMERIC DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Corrige bancos antigos que não possuem as colunas
    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS preco_anterior TEXT
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
      CREATE UNIQUE INDEX IF NOT EXISTS ofertas_link_unico
      ON ofertas(link)
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
      INSERT INTO configuracoes (id, nome_loja)
      VALUES (1, 'Eletromax')
      ON CONFLICT (id) DO NOTHING
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
      INSERT INTO filtros_ofertas (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `);

    // IMPORTANTE:
    // A coluna expires_at é criada aqui.
    // Isso corrige o erro:
    // column "expires_at" does not exist

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

    // Corrige bancos antigos criados sem expires_at
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

    console.log("=================================");
    console.log("BANCO DE DADOS CONECTADO");
    console.log("TABELAS DO ELETROMAX PRONTAS");
    console.log("=================================");

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
      user_id = EXCLUDED.user_id,

      access_token = EXCLUDED.access_token,

      refresh_token =
        COALESCE(
          EXCLUDED.refresh_token,
          mercadolivre_tokens.refresh_token
        ),

      expires_at = EXCLUDED.expires_at,

      atualizado_em = CURRENT_TIMESTAMP
    `,
    [
      userId || null,
      accessToken,
      refreshToken || null,
      expiresAt || null
    ]
  );

  mercadoLivreAccessToken = accessToken;

  if (refreshToken) {
    mercadoLivreRefreshToken = refreshToken;
  }

  mercadoLivreTokenExpiresAt =
    expiresAt || null;

  mercadoLivreUserId =
    userId || null;

  console.log(
    "TOKEN MERCADO LIVRE SALVO NO BANCO"
  );
}

// ==========================================
// CARREGAR TOKEN MERCADO LIVRE
// ==========================================

async function carregarTokenMercadoLivre() {
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
      console.log(
        "NENHUM TOKEN DO MERCADO LIVRE SALVO."
      );

      return;
    }

    const token = resultado.rows[0];

    mercadoLivreUserId =
      token.user_id || null;

    mercadoLivreAccessToken =
      token.access_token || null;

    mercadoLivreRefreshToken =
      token.refresh_token || null;

    mercadoLivreTokenExpiresAt =
      token.expires_at
        ? Number(token.expires_at)
        : null;

    console.log(
      "TOKEN MERCADO LIVRE CARREGADO DO BANCO"
    );
  } catch (erro) {
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
  if (!mercadoLivreRefreshToken) {
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

  const resposta = await fetch(
    "https://api.mercadolibre.com/oauth/token",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({
        grant_type: "refresh_token",

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
    await resposta.json();

  if (!resposta.ok) {
    console.error(
      "ERRO AO RENOVAR TOKEN:",
      dados
    );

    throw new Error(
      dados.message ||
      "Erro ao renovar token do Mercado Livre."
    );
  }

  const expiresAt =
    dados.expires_in
      ? Date.now() +
        Number(dados.expires_in) *
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
  if (!mercadoLivreAccessToken) {
    await carregarTokenMercadoLivre();
  }

  if (!mercadoLivreAccessToken) {
    throw new Error(
      "Mercado Livre não está conectado."
    );
  }

  const tokenPrestesAExpirar =
    mercadoLivreTokenExpiresAt &&
    Date.now() >
      mercadoLivreTokenExpiresAt -
      5 * 60 * 1000;

  if (tokenPrestesAExpirar) {
    return await renovarTokenMercadoLivre();
  }

  return mercadoLivreAccessToken;
}
// ==========================================
// STATUS DO SISTEMA
// ==========================================

app.get("/api/status", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");

    res.json({
      success: true,
      status: "online",
      database: "connected",
      mercadolivre: mercadoLivreAccessToken
        ? "connected"
        : "not_connected"
    });
  } catch (erro) {
    res.status(500).json({
      success: false,
      status: "offline",
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
    res.status(500).json({
      success: false,
      message: erro.message
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
      produtos: resultado.rows
    });
  } catch (erro) {
    res.status(500).json({
      success: false,
      message: "Erro ao buscar produtos.",
      error: erro.message
    });
  }
});

// ==========================================
// PRODUTOS - CADASTRAR
// ==========================================

app.post("/api/produtos", async (req, res) => {
  try {
    const {
      nome,
      preco,
      link,
      plataforma
    } = req.body;

    if (!nome || !link || !plataforma) {
      return res.status(400).json({
        success: false,
        message:
          "Nome, link e plataforma são obrigatórios."
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
      [
        String(nome).trim(),

        preco !== undefined &&
        preco !== null
          ? String(preco).trim()
          : "",

        String(link).trim(),

        String(plataforma).trim()
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
    res.status(500).json({
      success: false,
      message:
        "Erro ao salvar produto.",
      error:
        erro.message
    });
  }
});

// ==========================================
// PRODUTOS - EXCLUIR
// ==========================================

app.delete(
  "/api/produtos/:id",
  async (req, res) => {
    try {
      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          success: false,
          message: "ID inválido."
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
      res.status(500).json({
        success: false,
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

app.get("/api/ofertas", async (req, res) => {
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
      success: true,
      ofertas:
        resultado.rows
    });
  } catch (erro) {
    res.status(500).json({
      success: false,
      message:
        "Erro ao buscar ofertas.",
      error:
        erro.message
    });
  }
});

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
        success: true,
        filtros:
          resultado.rows[0] ||
          FILTROS_PADRAO
      });
    } catch (erro) {
      res.status(500).json({
        success: false,
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
        Number(precoMinimo);

      const maximo =
        Number(precoMaximo);

      const avaliacao =
        Number(avaliacaoMinima);

      const vendas =
        Number(vendasMinimas);

      const limite =
        Number(limitePorCategoria);

      const pontuacao =
        Number(pontuacaoMinima);

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
          Number.isFinite(minimo)
            ? minimo
            : 0,

          Number.isFinite(maximo)
            ? maximo
            : 100000,

          Number.isFinite(avaliacao)
            ? avaliacao
            : 0,

          Number.isFinite(vendas)
            ? vendas
            : 0,

          Number.isFinite(limite)
            ? Math.min(
                Math.max(limite, 1),
                50
              )
            : 20,

          Number.isFinite(pontuacao)
            ? pontuacao
            : 0
        ]
      );

      res.json({
        success: true,
        message:
          "Filtros salvos com sucesso."
      });
    } catch (erro) {
      res.status(500).json({
        success: false,
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
    resultado.rowCount === 0
  ) {
    return FILTROS_PADRAO;
  }

  const f =
    resultado.rows[0];

  return {
    precoMinimo:
      Number(f.preco_minimo) || 0,

    precoMaximo:
      Number(f.preco_maximo) || 100000,

    avaliacaoMinima:
      Number(f.avaliacao_minima) || 0,

    vendasMinimas:
      Number(f.vendas_minimas) || 0,

    limitePorCategoria:
      Number(
        f.limite_por_categoria
      ) || 20,

    pontuacaoMinima:
      Number(f.pontuacao_minima) || 0
  };
}

// ==========================================
// CALCULAR PONTUAÇÃO DA OFERTA
// ==========================================

function calcularPontuacao(produto) {
  let pontos = 0;

  const vendas =
    Number(
      produto.sold_quantity
    ) || 0;

  const reputacao =
    Number(
      produto.seller
        ?.seller_reputation
        ?.transactions
        ?.ratings
        ?.positive
    ) || 0;

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

  if (
    produto.shipping
      ?.free_shipping
  ) {
    pontos += 15;
  }

  if (
    produto.official_store_id
  ) {
    pontos += 15;
  }

  return pontos;
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
    Number(produto.price) || 0;

  const vendas =
    Number(
      produto.sold_quantity
    ) || 0;

  const avaliacao =
    Number(
      produto.seller
        ?.seller_reputation
        ?.transactions
        ?.ratings
        ?.positive
    ) || 0;

  const pontuacao =
    calcularPontuacao(produto);

  if (
    preco < filtros.precoMinimo
  ) {
    return {
      aprovado: false,
      motivo:
        "Preço abaixo do mínimo."
    };
  }

  if (
    preco > filtros.precoMaximo
  ) {
    return {
      aprovado: false,
      motivo:
        "Preço acima do máximo."
    };
  }

  if (
    avaliacao <
    filtros.avaliacaoMinima
  ) {
    return {
      aprovado: false,
      motivo:
        "Avaliação abaixo do mínimo."
    };
  }

  if (
    vendas <
    filtros.vendasMinimas
  ) {
    return {
      aprovado: false,
      motivo:
        "Vendas abaixo do mínimo."
    };
  }

  if (
    pontuacao <
    filtros.pontuacaoMinima
  ) {
    return {
      aprovado: false,
      motivo:
        "Pontuação abaixo do mínimo."
    };
  }

  return {
    aprovado: true,

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

async function salvarOferta(oferta) {
  if (!oferta.link) {
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

        String(
          oferta.preco ?? ""
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

        Number(
          oferta.avaliacao
        ) || 0,

        Number(
          oferta.vendas
        ) || 0,

        Number(
          oferta.pontuacao
        ) || 0
      ]
    );

  return (
    resultado.rowCount > 0
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
        !mercadoLivreAccessToken
      ) {
        await carregarTokenMercadoLivre();
      }

      res.json({
        success: true,

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
    } catch (erro) {
      res.status(500).json({
        success: false,
        conectado: false,
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

    const busca = String(
      req.body.q || ""
    ).trim();

    const limite = Math.min(
      Math.max(
        Number(req.body.limit || 20),
        1
      ),
      50
    );

    if (!busca) {
      return res.status(400).json({
        success: false,
        message: "Informe o termo de busca."
      });
    }

    try {

      console.log(
        "BUSCAR E SALVAR:",
        busca
      );

      const dados = await buscarMercadoLivre(
        busca,
        limite
      );

      const produtos =
        dados.results || [];

      let salvos = 0;
      let duplicados = 0;

      for (const produto of produtos) {

        if (!produto.permalink) {
          continue;
        }

        const oferta = {
          nome:
            produto.title ||
            "Produto",

          preco:
            produto.price || 0,

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
            Number(
              produto.seller
                ?.seller_reputation
                ?.transactions
                ?.ratings
                ?.positive
            ) || 0,

          vendas:
            Number(
              produto.sold_quantity
            ) || 0,

          pontuacao:
            calcularPontuacao(
              produto
            )

        };

        const salvo =
          await salvarOferta(
            oferta
          );

        if (salvo) {
          salvos++;
        } else {
          duplicados++;
        }

      }

      res.json({

        success:
          true,

        encontrados:
          produtos.length,

        salvos:
          salvos,

        duplicados:
          duplicados,

        message:
          `${salvos} ofertas salvas com sucesso.`

      });

    } catch (erro) {

      console.error(
        "ERRO BUSCAR E SALVAR:",
        erro
      );

      res.status(
        erro.status || 500
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

      let encontrados = 0;
      let aprovados = 0;
      let salvos = 0;
      let duplicados = 0;

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
            dados.results ||
            [];

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

            const salvo =
              await salvarOferta(
                analise.produto
              );

            if (salvo) {

              salvos++;

              ofertas.push(
                analise.produto
              );

            } else {

              duplicados++;

            }

          }

        } catch (erro) {

          console.error(
            "ERRO NA CATEGORIA:",
            categoria.nome,
            erro.message
          );

        }

      }

      ofertas.sort(
        (a, b) =>
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

        duplicados:
          duplicados,

        ofertas:
          ofertas

      });

    } catch (erro) {

      console.error(
        "ERRO MOTOR AUTOMÁTICO:",
        erro
      );

      res.status(500).json({

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

      if (!nome) {

        return res.status(400).json({

          success:
            false,

          message:
            "Nome do produto é obrigatório."

        });

      }

      const texto =

`🔥 OFERTA IMPERDÍVEL!

📦 ${nome}

${categoria
  ? `🏷️ Categoria: ${categoria}\n`
  : ""
}${precoAnterior
  ? `💸 De: ${precoAnterior}\n`
  : ""
}💰 Por apenas: ${preco || "Consulte o preço"}

🛒 Compre aqui:
${link || "Link não informado"}

⚡ Eletromax
🔥 Ofertas selecionadas para você!`;

      res.json({

        success:
          true,

        texto:
          texto

      });

    } catch (erro) {

      console.error(
        "ERRO GERAR POST:",
        erro
      );

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao gerar post."

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
          [
            limite
          ]
        );

      const ofertas =
        resultado.rows;

      if (
        ofertas.length === 0
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
        (oferta, index) => {

          texto +=

`${index + 1}️⃣ ${oferta.nome}

💰 Por: R$ ${oferta.preco}

🛒 Comprar:
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

    } catch (erro) {

      console.error(
        "ERRO GERAR MELHORES OFERTAS:",
        erro
      );

      res.status(500).json({

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

      res.json({

        success:
          true,

        configuracoes:
          resultado.rows[0] ||
          {}

      });

    } catch (erro) {

      console.error(
        "ERRO CONFIGURAÇÕES:",
        erro
      );

      res.status(500).json({

        success:
          false,

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

    } catch (erro) {

      console.error(
        "ERRO SALVAR CONFIGURAÇÕES:",
        erro
      );

      res.status(500).json({

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

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao buscar links."

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

      mercadoLivre:
        mercadoLivreAccessToken
          ? "conectado"
          : "não conectado",

      motorOfertas:
        "ativo",

      geradorPosts:
        "ativo"

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

      success:
        false,

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

  if (!bancoOK) {

    console.error(
      "ATENÇÃO: Banco apresentou erro."
    );

  }

  app.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        "================================="
      );

      console.log(
        "⚡ ELETROMAX V2 INICIADO"
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
        "GERADOR DE POSTS:",
        "ATIVO"
      );

      console.log(
        "================================="
      );

    }
  );

}

iniciarServidor();
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

        success: true,

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

      res.status(503).json({

        success: false,

        status:
          "offline",

        database:
          "disconnected",

        error:
          erro.message

      });

    }

  }
);


// ==========================================
// ROTA 404 GERAL
// ==========================================

app.use(
  (req, res) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return res.status(404).json({

        success:
          false,

        message:
          "Rota da API não encontrada.",

        rota:
          req.path

      });

    }

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

      </head>

      <body>

        <h1>
          ⚡ Eletromax V2
        </h1>

        <p>
          Página não encontrada.
        </p>

        <a href="/">
          Voltar para o painel
        </a>

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
      "ERRO GLOBAL DO SERVIDOR:",
      erro
    );

    if (
      res.headersSent
    ) {

      return next(
        erro
      );

    }

    res.status(
      erro.status || 500
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
// ENCERRAMENTO SEGURO
// ==========================================

let servidor;


async function desligarServidor(
  sinal
) {

  console.log(
    `Recebido ${sinal}. Encerrando servidor...`
  );

  if (
    servidor
  ) {

    servidor.close(
      async () => {

        try {

          await pool.end();

          console.log(
            "Banco de dados desconectado."
          );

          console.log(
            "Servidor encerrado com sucesso."
          );

          process.exit(
            0
          );

        } catch (erro) {

          console.error(
            "Erro ao fechar banco:",
            erro.message
          );

          process.exit(
            1
          );

        }

      }
    );

  } else {

    try {

      await pool.end();

    } catch (erro) {

      console.error(
        erro.message
      );

    }

    process.exit(
      0
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
// INICIALIZAÇÃO FINAL DO ELETROMAX
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
          "ELETROMAX V2 PRONTO PARA USO!"
        );

        console.log(
          "================================="
        );

      }

    );

}


iniciarServidor();
