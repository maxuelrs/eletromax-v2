
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
    path.join(__dirname, "../frontend")
  )
);

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "../frontend/index.html"
    )
  );
});

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
    ? Number(process.env.ML_TOKEN_EXPIRES_AT)
    : null;

let mercadoLivreUserId =
  process.env.ML_USER_ID || null;

// ==========================================
// CATEGORIAS PADRÃO DO ELETROMAX
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
        link TEXT NOT NULL UNIQUE,
        plataforma TEXT NOT NULL,
        imagem TEXT,
        categoria TEXT,
        avaliacao NUMERIC,
        vendas INTEGER,
        pontuacao NUMERIC DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Adiciona colunas caso a tabela antiga já exista
    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS categoria TEXT
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS avaliacao NUMERIC
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS vendas INTEGER
    `);

    await pool.query(`
      ALTER TABLE ofertas
      ADD COLUMN IF NOT EXISTS pontuacao NUMERIC DEFAULT 0
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

    // ======================================
    // TABELA FILTROS
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
      "TABELA FILTROS PRONTA"
    );

    console.log(
      "TABELA TOKENS ML PRONTA"
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
// SALVAR TOKEN ML
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

  console.log(
    "TOKEN ML SALVO NO BANCO"
  );

}

// ==========================================
// CARREGAR TOKEN ML
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
        "NENHUM TOKEN ML SALVO."
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
        ? Number(token.expires_at)
        : null;

    console.log(
      "TOKEN ML CARREGADO DO BANCO"
    );

  } catch (erro) {

    console.error(
      "ERRO AO CARREGAR TOKEN ML:",
      erro.message
    );

  }

}

// ==========================================
// STATUS
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
          `
          SELECT COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = $1
          `,
          ["Mercado Livre"]
        );

      const shopee =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM produtos
          WHERE plataforma = $1
          `,
          ["Shopee"]
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

      res.status(500).json({

        success: false,

        message:
          erro.message

      });

    }

  }
);

// ==========================================
// PRODUTOS
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

        success: true,

        produtos:
          resultado.rows

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar produtos."

      });

    }

  }
);

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

app.delete(
  "/api/produtos/:id",
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

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
          ORDER BY pontuacao DESC, id DESC
          `
        );

      res.json({

        success: true,

        ofertas:
          resultado.rows

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar ofertas."

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

        success: true,

        filtros:
          resultado.rows[0] ||
          FILTROS_PADRAO

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

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
          preco_minimo = EXCLUDED.preco_minimo,
          preco_maximo = EXCLUDED.preco_maximo,
          avaliacao_minima = EXCLUDED.avaliacao_minima,
          vendas_minimas = EXCLUDED.vendas_minimas,
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
// CALCULAR PONTUAÇÃO
// ==========================================

function calcularPontuacao(produto) {

  let pontos = 0;

  const avaliacao =
    Number(
      produto.seller?.seller_reputation
        ?.transactions
        ?.ratings
        ?.positive
    ) || 0;

  const vendas =
    Number(
      produto.sold_quantity
    ) || 0;

  // Pontuação por avaliação positiva
  if (
    avaliacao >= 0.95
  ) {

    pontos += 30;

  } else if (
    avaliacao >= 0.90
  ) {

    pontos += 20;

  } else if (
    avaliacao >= 0.80
  ) {

    pontos += 10;

  }

  // Pontuação por vendas
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

  // Frete grátis
  if (
    produto.shipping?.free_shipping
  ) {

    pontos += 15;

  }

  // Loja oficial
  if (
    produto.official_store_id
  ) {

    pontos += 15;

  }

  // Compra internacional não priorizada
  if (
    produto.shipping?.store_pick_up
  ) {

    pontos += 5;

  }

  return pontos;

}

// ==========================================
// BUSCAR FILTROS ATUAIS
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

  const reputacao =
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

  // ----------------------------------------
  // FILTRO DE PREÇO
  // ----------------------------------------

  if (
    preco <
      filtros.precoMinimo
  ) {

    return {
      aprovado: false,
      motivo:
        "Preço abaixo do mínimo."
    };

  }

  if (
    preco >
      filtros.precoMaximo
  ) {

    return {
      aprovado: false,
      motivo:
        "Preço acima do máximo."
    };

  }

  // ----------------------------------------
  // FILTRO DE AVALIAÇÃO
  // ----------------------------------------

  if (
    reputacao <
      filtros.avaliacaoMinima
  ) {

    return {
      aprovado: false,
      motivo:
        "Avaliação abaixo do mínimo."
    };

  }

  // ----------------------------------------
  // FILTRO DE VENDAS
  // ----------------------------------------

  if (
    vendas <
      filtros.vendasMinimas
  ) {

    return {
      aprovado: false,
      motivo:
        "Quantidade de vendas abaixo do mínimo."
    };

  }

  // ----------------------------------------
  // FILTRO DE PONTUAÇÃO
  // ----------------------------------------

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

    motivo:
      "Produto aprovado.",

    produto: {

      nome:
        produto.title,

      preco,

      link:
        produto.permalink,

      imagem:
        produto.thumbnail,

      categoria:

        categoria.nome,

      avaliacao:
        reputacao,

      vendas,

      pontuacao

    }

  };

}

// ==========================================
// BUSCAR UMA CATEGORIA
// ==========================================

async function buscarCategoria(
  categoria,
  filtros
) {

  const limite =
    Math.min(
      Math.max(
        filtros.limitePorCategoria,
        1
      ),
      50
    );

  const url =
    "https://api.mercadolibre.com/sites/MLB/search" +
    "?q=" +
    encodeURIComponent(
      categoria.busca
    ) +
    "&limit=" +
    limite +
    "&sort=relevance";

  const resposta =
    await fetch(url);

  if (
    !resposta.ok
  ) {

    throw new Error(
      "Mercado Livre retornou HTTP " +
      resposta.status
    );

  }

  return await resposta.json();

}

// ==========================================
// SALVAR OFERTA
// ==========================================

async function salvarOferta(
  oferta
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
    resultado.rowCount > 0
  );

}

// ==========================================
// MOTOR AUTOMÁTICO DE OFERTAS
// ==========================================

app.post(
  "/api/ofertas/buscar-automaticamente",
  async (req, res) => {

    try {

      const filtros =
        await obterFiltros();

      const resultados = [];

      let encontrados = 0;

      let aprovados = 0;

      let salvos = 0;

      let duplicados = 0;

      for (
        const categoria
        of CATEGORIAS_PADRAO
      ) {

        console.log(
          "BUSCANDO CATEGORIA:",
          categoria.nome
        );

        const dados =
          await buscarCategoria(
            categoria,
            filtros
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

          const oferta =
            analise.produto;

          const salvo =
            await salvarOferta(
              oferta
            );

          if (
            salvo
          ) {

            salvos++;

            resultados.push(
              oferta
            );

          } else {

            duplicados++;

          }

        }

      }

      resultados.sort(
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

        success: true,

        message:
          "Busca automática concluída.",

        categorias:
          CATEGORIAS_PADRAO.length,

        encontrados,

        aprovados,

        salvos,

        duplicados,

        ofertas:
          resultados

      });

    } catch (erro) {

      console.error(
        "ERRO MOTOR DE OFERTAS:",
        erro.message
      );

      res.status(500).json({

        success: false,

        message:
          "Erro ao executar busca automática.",

        error:
          erro.message

      });

    }

  }
);

// ==========================================
// ANALISAR PRODUTOS MANUALMENTE
// ==========================================

app.post(
  "/api/ofertas/analisar",
  async (req, res) => {

    try {

      const {
        produtos
      } = req.body;

      if (
        !Array.isArray(produtos)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Envie uma lista de produtos."

        });

      }

      const filtros =
        await obterFiltros();

      const analisados =
        produtos.map(
          produto =>
            analisarProduto(
              produto,
              {
                nome:
                  produto.categoria ||
                  "Geral"
              },
              filtros
            )
        );

      res.json({

        success: true,

        resultados:
          analisados

      });

    } catch (erro) {

      res.status(500).json({

        success: false,

        message:
          "Erro ao analisar produtos.",

        error:
          erro.message

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

      if (
        !nome
      ) {

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
          mercadoLivreUserId || null,

        tokenExpiraEm:
          mercadoLivreTokenExpiresAt
            ? new Date(
                mercadoLivreTokenExpiresAt
              ).toISOString()
            : null

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

    res.redirect(url);

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
          "Erro ao obter token do Mercado Livre."
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

      mercadoLivreAccessToken =
        dados.access_token;

      mercadoLivreRefreshToken =
        dados.refresh_token;

      mercadoLivreTokenExpiresAt =
        expiresAt;

      mercadoLivreUserId =
        dados.user_id
          ? String(
              dados.user_id
            )
          : null;

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

      res.send(`
        <!DOCTYPE html>

        <html lang="pt-BR">

        <head>

          <meta charset="UTF-8">

          <title>
            Eletromax
          </title>

        </head>

        <body>

          <h2>
            ✅ Mercado Livre conectado!
          </h2>

          <p>
            A autorização foi concluída
            com sucesso.
          </p>

          <p>
            O token foi salvo no banco
            de dados do Eletromax.
          </p>

          <p>
            Agora você pode voltar
            ao painel Eletromax.
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
        "Erro ao conectar Mercado Livre."
      );

    }

  }
);

// ==========================================
// RENOVAR TOKEN ML
// ==========================================

async function renovarTokenMercadoLivre() {

  if (
    !mercadoLivreRefreshToken
  ) {

    throw new Error(
      "Refresh token não disponível."
    );

  }

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

    throw new Error(
      dados.message ||
      "Erro ao renovar token."
    );

  }

  mercadoLivreAccessToken =
    dados.access_token;

  if (
    dados.refresh_token
  ) {

    mercadoLivreRefreshToken =
      dados.refresh_token;

  }

  mercadoLivreTokenExpiresAt =
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
      mercadoLivreAccessToken,

    refreshToken:
      mercadoLivreRefreshToken,

    expiresAt:
      mercadoLivreTokenExpiresAt

  });

  console.log(
    "TOKEN ML RENOVADO."
  );

  return mercadoLivreAccessToken;

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

  if (
    mercadoLivreTokenExpiresAt &&
    Date.now() >
      mercadoLivreTokenExpiresAt -
        5 * 60 * 1000
  ) {

    return await renovarTokenMercadoLivre();

  }

  return mercadoLivreAccessToken;

}

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

          success: false,

          message:
            "Erro ao consultar conta.",

          error:
            dados

        });

      }

      res.json({

        success: true,

        usuario:
          dados

      });

    } catch (erro) {

      res.status(401).json({

        success: false,

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
        ).map(
          item => ({

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

          })
        );

      res.json({

        success: true,

        produtos

      });

    } catch (erro) {

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
// BUSCAR E SALVAR MANUALMENTE
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

      const resposta =
        await fetch(
          "https://api.mercadolibre.com/sites/MLB/search?q=" +
          encodeURIComponent(
            busca
          ) +
          "&limit=" +
          limite
        );

      const dados =
        await resposta.json();

      if (
        !resposta.ok
      ) {

        throw new Error(
          "Erro HTTP " +
          resposta.status
        );

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
              produto.price,

            link:
              produto.permalink,

            imagem:
              produto.thumbnail,

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

        success: true,

        encontrados:
          produtos.length,

        salvos,

        duplicados

      });

    } catch (erro) {

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
// CONFIGURAÇÕES
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

      res.status(500).json({

        success: false,

        message:
          "Erro ao carregar configurações."

      });

    }

  }
);

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

        success: true,

        message:
          "Configurações salvas com sucesso."

      });

    } catch (erro) {

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

      res.status(500).json({

        success: false,

        message:
          "Erro ao buscar links."

      });

    }

  }
);

// ==========================================
// ROTA API
// ==========================================

app.get(
  "/api",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Eletromax V2 API funcionando!",

      motorOfertas:
        "ativo",

      categorias:
        CATEGORIAS_PADRAO.map(
          c => c.nome
        )

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
    () => {

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
        "================================="
      );

    }
  );

}

iniciarServidor();

