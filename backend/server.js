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
// CATEGORIAS AUTOMÁTICAS
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
    nome: "Celulares e tecnologia",
    busca: "celular smartphone"
  },

  {
    nome: "Informática",
    busca: "notebook computador"
  },

  {
    nome: "Eletrodomésticos",
    busca: "eletrodomésticos"
  },

  {
    nome: "Beleza e cuidados pessoais",
    busca: "beleza cuidados pessoais"
  },

  {
    nome: "Esportes e lazer",
    busca: "esportes lazer"
  },

  {
    nome: "Moda",
    busca: "moda roupas"
  },

  {
    nome: "Casa inteligente",
    busca: "casa inteligente"
  },

  {
    nome: "Ofertas para carro",
    busca: "acessórios carro"
  }

];

// ==========================================
// FILTROS PADRÃO
// ==========================================

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

    // ======================================
    // PRODUTOS
    // ======================================

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

    // ======================================
    // OFERTAS
    // ======================================

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

    // Migrações automáticas
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
      CREATE UNIQUE INDEX IF NOT EXISTS
      ofertas_link_unico
      ON ofertas(link)
    `);

    // ======================================
    // CONFIGURAÇÕES
    // ======================================

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

    // ======================================
    // FILTROS
    // ======================================

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

    // ======================================
    // TOKENS MERCADO LIVRE
    // ======================================

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

    // ======================================
    // MIGRAÇÃO DA TABELA EXISTENTE
    // CORREÇÃO DO ERRO expires_at
    // ======================================

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `);

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS refresh_token TEXT
    `);

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS expires_at BIGINT
    `);

    await pool.query(`
      ALTER TABLE mercadolivre_tokens
      ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    console.log(
      "================================="
    );

    console.log(
      "BANCO DE DADOS CONECTADO"
    );

    console.log(
      "TABELAS DO ELETROMAX PRONTAS"
    );

    console.log(
      "MIGRACOES DO BANCO CONCLUIDAS"
    );

    console.log(
      "COLUNA expires_at VERIFICADA"
    );

    console.log(
      "================================="
    );

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

  if (!accessToken) {

    throw new Error(
      "Access token do Mercado Livre não informado."
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

  if (refreshToken) {

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
    await resposta.json();

  if (
    !resposta.ok
  ) {

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
    !mercadoLivreAccessToken
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
      5 * 60 * 1000;

  if (
    tokenPrestesAExpirar
  ) {

    return await renovarTokenMercadoLivre();

  }

  return mercadoLivreAccessToken;

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

        success:
          true,

        status:
          "online",

        database:
          "connected",

        mercadolivre:
          mercadoLivreAccessToken
            ? "connected"
            : "not_connected"

      });

    } catch (erro) {

      res.status(500).json({

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
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM produtos
          `
        );

      const ofertas =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM ofertas
          `
        );

      const mercadoLivre =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = $1
          `,
          [
            "Mercado Livre"
          ]
        );

      const shopee =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = $1
          `,
          [
            "Shopee"
          ]
        );

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

    } catch (erro) {

      res.status(500).json({

        success:
          false,

        message:
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
        await pool.query(
          `
          SELECT
            id,
            nome,
            preco,
            link,
            plataforma,
            criado_em
          FROM produtos
          ORDER BY id DESC
          `
        );

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
          "Erro ao buscar produtos."

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

        return res.status(400).json({

          success:
            false,

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

        success:
          true,

        message:
          "Produto salvo com sucesso!",

        produto:
          resultado.rows[0]

      });

    } catch (erro) {

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

        return res.status(400).json({

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
        resultado.rowCount === 0
      ) {

        return res.status(404).json({

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
          "Erro ao excluir produto."

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
            pontuacao,
            criado_em
          FROM ofertas
          ORDER BY
            pontuacao DESC,
            id DESC
          `
        );

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
        await pool.query(
          `
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
          `
        );

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
          "Erro ao buscar filtros."

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

          Number(precoMinimo) || 0,

          Number(precoMaximo) || 100000,

          Number(avaliacaoMinima) || 0,

          Number(vendasMinimas) || 0,

          Number(limitePorCategoria) || 20,

          Number(pontuacaoMinima) || 0

        ]
      );

      res.json({

        success:
          true,

        message:
          "Filtros salvos com sucesso."

      });

    } catch (erro) {

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
// OBTER FILTROS
// ==========================================

async function obterFiltros() {

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
      Number(f.limite_por_categoria) || 20,

    pontuacaoMinima:
      Number(f.pontuacao_minima) || 0

  };

}

// ==========================================
// CALCULAR PONTUAÇÃO
// ==========================================

function calcularPontuacao(produto) {

  let pontos = 0;

  const vendas =
    Number(
      produto.sold_quantity
    ) || 0;

  const reputacao =
    Number(
      produto.seller?.seller_reputation
        ?.transactions
        ?.ratings
        ?.positive
    ) || 0;

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
    produto.shipping?.free_shipping
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
    Number(
      produto.price
    ) || 0;

  const vendas =
    Number(
      produto.sold_quantity
    ) || 0;

  const avaliacao =
    Number(
      produto.seller?.seller_reputation
        ?.transactions
        ?.ratings
        ?.positive
    ) || 0;

  const pontuacao =
    calcularPontuacao(
      produto
    );

  if (
    preco <
    filtros.precoMinimo
  ) {

    return {
      aprovado: false,
      motivo: "Preço abaixo do mínimo."
    };

  }

  if (
    preco >
    filtros.precoMaximo
  ) {

    return {
      aprovado: false,
      motivo: "Preço acima do máximo."
    };

  }

  if (
    avaliacao <
    filtros.avaliacaoMinima
  ) {

    return {
      aprovado: false,
      motivo: "Avaliação abaixo do mínimo."
    };

  }

  if (
    vendas <
    filtros.vendasMinimas
  ) {

    return {
      aprovado: false,
      motivo: "Vendas abaixo do mínimo."
    };

  }

  if (
    pontuacao <
    filtros.pontuacaoMinima
  ) {

    return {
      aprovado: false,
      motivo: "Pontuação abaixo do mínimo."
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

async function salvarOferta(oferta) {

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
      DO NOTHING
      RETURNING id
      `,
      [

        oferta.nome,

        String(
          oferta.preco || ""
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

        oferta.avaliacao ||
          0,

        oferta.vendas ||
          0,

        oferta.pontuacao ||
          0

      ]
    );

  return (
    resultado.rowCount >
    0
  );

}

// ==========================================
// MERCADO LIVRE - STATUS
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

    } catch (erro) {

      res.status(500).json({

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

        success:
          false,

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

    const erro =
      req.query.error;

    if (
      erro
    ) {

      return res.status(400).send(
        `
        <h2>❌ Autorização cancelada</h2>
        <p>${erro}</p>
        `
      );

    }

    if (
      !code
    ) {

      return res.status(400).send(
        "Código de autorização não informado."
      );

    }

    try {

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
                  "authorization_code",

                client_id:
                  process.env.ML_CLIENT_ID,

                client_secret:
                  process.env.ML_CLIENT_SECRET,

                code:
                  code,

                redirect_uri:
                  process.env.ML_REDIRECT_URI

              }).toString()

          }
        );

      const dados =
        await resposta.json();

      if (
        !resposta.ok
      ) {

        console.error(
          "ERRO TOKEN ML:",
          dados
        );

        return res.status(500).send(
          `
          <h2>❌ Erro ao conectar Mercado Livre</h2>
          <pre>${JSON.stringify(
            dados,
            null,
            2
          )}</pre>
          `
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
          dados.user_id
            ? String(
                dados.user_id
              )
            : null,

        accessToken:
          dados.access_token,

        refreshToken:
          dados.refresh_token,

        expiresAt

      });

      res.send(`
        <!DOCTYPE html>

        <html lang="pt-BR">

        <head>

          <meta charset="UTF-8">

          <title>Eletromax</title>

        </head>

        <body>

          <h2>
            ✅ Mercado Livre conectado!
          </h2>

          <p>
            A autorização foi concluída com sucesso.
          </p>

          <p>
            O token foi salvo com persistência no banco de dados.
          </p>

          <p>
            O Eletromax poderá continuar utilizando a conexão após reinicializações.
          </p>

          <p>
            Agora você pode voltar ao painel Eletromax.
          </p>

        </body>

        </html>
      `);

    } catch (erro) {

      console.error(
        "ERRO CALLBACK ML:",
        erro.message
      );

      res.status(500).send(
        `
        <h2>❌ Erro ao conectar Mercado Livre</h2>
        <p>${erro.message}</p>
        `
      );

    }

  }
);

// ==========================================
// MERCADO LIVRE - MINHA CONTA
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

          success:
            false,

          message:
            "Erro ao consultar conta do Mercado Livre.",

          error:
            dados

        });

      }

      res.json({

        success:
          true,

        usuario:
          dados

      });

    } catch (erro) {

      res.status(401).json({

        success:
          false,

        message:
          erro.message

      });

    }

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
        req.query.q ||
        ""
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

    if (
      !busca
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          "Informe o termo de busca."

      });

    }

    try {

      const url =
        "https://api.mercadolibre.com/sites/MLB/search" +
        "?q=" +
        encodeURIComponent(
          busca
        ) +
        "&limit=" +
        limite;

      const resposta =
        await fetch(
          url,
          {

            method:
              "GET",

            headers: {

              Accept:
                "application/json"

            }

          }
        );

      const texto =
        await resposta.text();

      let dados;

      try {

        dados =
          JSON.parse(
            texto
          );

      } catch {

        dados = {
          message: texto
        };

      }

      if (
        resposta.status ===
        429
      ) {

        return res.status(429).json({

          success:
            false,

          code:
            "ML_RATE_LIMIT",

          message:
            "O Mercado Livre limitou temporariamente as consultas. Aguarde alguns segundos e tente novamente."

        });

      }

      if (
        !resposta.ok
      ) {

        return res.status(
          resposta.status
        ).json({

          success:
            false,

          code:
            "ML_API_ERROR",

          message:
            "Erro ao consultar Mercado Livre.",

          status:
            resposta.status,

          error:
            dados

        });

      }

      const produtos =
        (
          dados.results ||
          []
        ).map(
          item => ({

            id:
              item.id,

            nome:
              item.title ||
              "",

            preco:
              item.price ||
              0,

            link:
              item.permalink ||
              "",

            imagem:
              item.thumbnail ||
              "",

            plataforma:
              "Mercado Livre",

            vendido:
              item.sold_quantity ||
              0,

            condicao:
              item.condition ||
              "",

            freteGratis:
              Boolean(
                item.shipping?.free_shipping
              ),

            lojaOficial:
              Boolean(
                item.official_store_id
              )

          })
        );

      res.json({

        success:
          true,

        busca:
          busca,

        total:
          produtos.length,

        produtos:
          produtos

      });

    } catch (erro) {

      console.error(
        "ERRO BUSCA MERCADO LIVRE:",
        erro.message
      );

      res.status(500).json({

        success:
          false,

        code:
          "SERVER_ERROR",

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
        req.body.q ||
        ""
      ).trim();

    const limite =
      Math.min(
        Math.max(
          Number(
            req.body.limit ||
            20
          ),
          1
        ),
        50
      );

    if (
      !busca
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          "Informe o termo de busca."

      });

    }

    try {

      const url =
        "https://api.mercadolibre.com/sites/MLB/search" +
        "?q=" +
        encodeURIComponent(
          busca
        ) +
        "&limit=" +
        limite;

      const resposta =
        await fetch(
          url,
          {

            headers: {

              Accept:
                "application/json"

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

          success:
            false,

          message:
            "Erro ao consultar Mercado Livre.",

          status:
            resposta.status,

          error:
            dados

        });

      }

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

        if (
          !produto.permalink
        ) {

          continue;

        }

        const salvo =
          await salvarOferta({

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

            imagem:
              produto.thumbnail ||
              "",

            plataforma:
              "Mercado Livre",

            categoria:
              "Busca manual",

            avaliacao:
              0,

            vendas:
              produto.sold_quantity ||
              0,

            pontuacao:
              calcularPontuacao(
                produto
              )

          });

        if (
          salvo
        ) {

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
          duplicados

      });

    } catch (erro) {

      console.error(
        "ERRO BUSCAR E SALVAR:",
        erro.message
      );

      res.status(500).json({

        success:
          false,

        message:
          "Erro ao buscar e salvar ofertas.",

        error:
          erro.message

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

      const resultados =
        [];

      let encontrados =
        0;

      let aprovados =
        0;

      let salvos =
        0;

      let duplicados =
        0;

      for (
        const categoria
        of CATEGORIAS_PADRAO
      ) {

        console.log(
          "BUSCANDO:",
          categoria.nome
        );

        const url =
          "https://api.mercadolibre.com/sites/MLB/search" +
          "?q=" +
          encodeURIComponent(
            categoria.busca
          ) +
          "&limit=" +
          Math.min(
            filtros.limitePorCategoria,
            50
          );

        const resposta =
          await fetch(
            url
          );

        const dados =
          await resposta.json();

        if (
          !resposta.ok
        ) {

          console.error(
            "ERRO CATEGORIA:",
            categoria.nome,
            dados
          );

          continue;

        }

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

          if (
            salvo
          ) {

            salvos++;

            resultados.push(
              analise.produto
            );

          } else {

            duplicados++;

          }

        }

      }

      resultados.sort(

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
          resultados

      });

    } catch (erro) {

      console.error(
        "ERRO MOTOR OFERTAS:",
        erro.message
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
// GERADOR DE POST
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

      if (
        !nome
      ) {

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

        success:
          true,

        texto:
          texto

      });

    } catch (erro) {

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
// GERAR POST COM MELHORES OFERTAS
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

          total:
            0,

          ofertas:
            [],

          texto:
            "Nenhuma oferta encontrada."

        });

      }

      let texto =
`🔥🔥 MELHORES OFERTAS ELETROMAX 🔥🔥

Confira as melhores ofertas selecionadas especialmente para você!

`;

      ofertas.forEach(
        (oferta, index) => {

          texto +=

`${index + 1}️⃣ ${oferta.nome}

💰 Por: R$ ${oferta.preco}

🏷️ Categoria: ${oferta.categoria || "Oferta"}

🛒 COMPRE AQUI:
${oferta.link}

`;

        }
      );

      texto +=

`⚡ Eletromax
🔥 Ofertas selecionadas
💥 Aproveite enquanto durar o estoque!`;

      res.json({

        success:
          true,

        total:
          ofertas.length,

        ofertas:
          ofertas,

        texto:
          texto

      });

    } catch (erro) {

      console.error(
        "ERRO AO GERAR POST DAS MELHORES OFERTAS:",
        erro.message
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
// 404 API
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
