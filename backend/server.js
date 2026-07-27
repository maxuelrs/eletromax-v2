const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURAÇÕES
// ======================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// FRONTEND
// ======================================================

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ======================================================
// POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: process.env.DATABASE_URL
    ? {
        rejectUnauthorized: false
      }
    : false
});

// ======================================================
// MERCADO LIVRE - TOKENS
// ======================================================

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

// ======================================================
// CATEGORIAS AUTOMÁTICAS
// ======================================================

const CATEGORIAS_PADRAO = [
  {
    nome: "Casa e Decoração",
    busca: "casa decoração"
  },
  {
    nome: "Automotivo",
    busca: "acessórios automotivos"
  },
  {
    nome: "Ferramentas e Construção",
    busca: "ferramentas"
  },
  {
    nome: "Eletrônicos",
    busca: "eletrônicos"
  },
  {
    nome: "Segurança",
    busca: "câmera segurança"
  },
  {
    nome: "Utilidades Domésticas",
    busca: "utilidades domésticas"
  },
  {
    nome: "Celulares e Acessórios",
    busca: "celular acessórios"
  },
  {
    nome: "Informática",
    busca: "informática"
  },
  {
    nome: "Esportes",
    busca: "artigos esportivos"
  },
  {
    nome: "Beleza e Cuidados",
    busca: "beleza cuidados pessoais"
  }
];

// ======================================================
// FILTROS PADRÃO
// ======================================================

const FILTROS_PADRAO = {
  precoMinimo: 0,
  precoMaximo: 100000,
  avaliacaoMinima: 0,
  vendasMinimas: 0,
  limitePorCategoria: 20,
  pontuacaoMinima: 20,
  melhoresOfertas: 10
};

// ======================================================
// INICIALIZAR BANCO
// ======================================================

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
        pontuacao_minima NUMERIC DEFAULT 20,
        melhores_ofertas INTEGER DEFAULT 10,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE filtros_ofertas
      ADD COLUMN IF NOT EXISTS melhores_ofertas INTEGER DEFAULT 10
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
      CREATE TABLE IF NOT EXISTS posts_gerados (
        id SERIAL PRIMARY KEY,
        oferta_id INTEGER,
        nome TEXT,
        plataforma TEXT,
        texto_whatsapp TEXT,
        texto_instagram TEXT,
        texto_facebook TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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

// ======================================================
// SALVAR TOKEN
// ======================================================

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
      refresh_token = COALESCE(
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

  mercadoLivreTokenExpiresAt = expiresAt || null;

  if (userId) {
    mercadoLivreUserId = userId;
  }

  console.log(
    "TOKEN MERCADO LIVRE SALVO NO BANCO"
  );
}

// ======================================================
// CARREGAR TOKEN
// ======================================================

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

// ======================================================
// RENOVAR TOKEN
// ======================================================

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

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      dados.message ||
      "Erro ao renovar token do Mercado Livre."
    );
  }

  const expiresAt =
    dados.expires_in
      ? Date.now() +
        Number(dados.expires_in) * 1000
      : null;

  await salvarTokenMercadoLivre({
    userId: mercadoLivreUserId,
    accessToken: dados.access_token,
    refreshToken:
      dados.refresh_token ||
      mercadoLivreRefreshToken,
    expiresAt
  });

  return dados.access_token;
}

// ======================================================
// OBTER TOKEN VÁLIDO
// ======================================================

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

// ======================================================
// STATUS
// ======================================================

app.get(
  "/api/status",
  async (req, res) => {
    try {
      await pool.query("SELECT NOW()");

      res.json({
        success: true,
        status: "online",
        database: "connected",
        mercadolivre:
          mercadoLivreAccessToken
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
  }
);

// ======================================================
// MERCADO LIVRE - STATUS
// ======================================================

app.get(
  "/api/mercadolivre/status",
  async (req, res) => {
    try {
      await carregarTokenMercadoLivre();

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
          mercadoLivreUserId || null
      });

    } catch (erro) {
      res.status(500).json({
        success: false,
        conectado: false,
        message: erro.message
      });
    }
  }
);

// ======================================================
// LOGIN MERCADO LIVRE
// ======================================================

app.get(
  "/api/mercadolivre/login",
  (req, res) => {
    const clientId =
      process.env.ML_CLIENT_ID;

    const redirectUri =
      process.env.ML_REDIRECT_URI;

    if (!clientId || !redirectUri) {
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
      encodeURIComponent(clientId) +
      "&redirect_uri=" +
      encodeURIComponent(redirectUri);

    res.redirect(url);
  }
);

// ======================================================
// CALLBACK OAUTH
// ======================================================

app.get(
  "/api/mercadolivre/callback",
  async (req, res) => {
    const code = req.query.code;
    const erroOAuth = req.query.error;

    if (erroOAuth) {
      return res.status(400).send(`
        <h2>❌ Autorização cancelada</h2>
        <p>${erroOAuth}</p>
      `);
    }

    if (!code) {
      return res.status(400).send(
        "Código de autorização não informado."
      );
    }

    try {
      const resposta = await fetch(
        "https://api.mercadolibre.com/oauth/token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },

          body: new URLSearchParams({
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

      if (!resposta.ok) {
        console.error(
          "ERRO TOKEN ML:",
          dados
        );

        return res.status(500).send(`
          <h2>❌ Erro ao conectar Mercado Livre</h2>
          <pre>${JSON.stringify(
            dados,
            null,
            2
          )}</pre>
        `);
      }

      const expiresAt =
        dados.expires_in
          ? Date.now() +
            Number(dados.expires_in) *
            1000
          : null;

      await salvarTokenMercadoLivre({
        userId:
          dados.user_id
            ? String(dados.user_id)
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
            O token foi salvo com persistência
            no banco de dados.
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
        "Erro ao conectar Mercado Livre."
      );
    }
  }
);

// ======================================================
// MINHA CONTA ML
// ======================================================

app.get(
  "/api/mercadolivre/me",
  async (req, res) => {
    try {
      const token =
        await obterTokenMercadoLivre();

      const resposta = await fetch(
        "https://api.mercadolibre.com/users/me",
        {
          headers: {
            Authorization:
              "Bearer " + token
          }
        }
      );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        return res.status(
          resposta.status
        ).json({
          success: false,
          message:
            "Erro ao consultar conta do Mercado Livre.",
          error: dados
        });
      }

      res.json({
        success: true,
        usuario: dados
      });

    } catch (erro) {
      res.status(401).json({
        success: false,
        message: erro.message
      });
    }
  }
);

// ======================================================
// BUSCAR PRODUTOS NO MERCADO LIVRE
// ======================================================

async function buscarMercadoLivre(
  termo,
  limite = 20
) {
  const url =
    "https://api.mercadolibre.com/sites/MLB/search" +
    "?q=" +
    encodeURIComponent(termo) +
    "&limit=" +
    limite;

  const resposta =
    await fetch(url, {
      headers: {
        Accept:
          "application/json"
      }
    });

  const texto =
    await resposta.text();

  let dados;

  try {
    dados =
      JSON.parse(texto);
  } catch {
    dados = {
      message: texto
    };
  }

  if (!resposta.ok) {
    const erro =
      new Error(
        dados.message ||
        "Erro ao consultar Mercado Livre."
      );

    erro.status =
      resposta.status;

    erro.dados =
      dados;

    throw erro;
  }

  return dados;
}

// ======================================================
// BUSCAR - API
// ======================================================

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

    if (!busca) {
      return res.status(400).json({
        success: false,
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
        (
          dados.results || []
        ).map(item => ({
          id: item.id,

          nome:
            item.title || "",

          preco:
            item.price || 0,

          link:
            item.permalink || "",

          imagem:
            item.thumbnail || "",

          plataforma:
            "Mercado Livre",

          vendido:
            item.sold_quantity || 0,

          condicao:
            item.condition || "",

          freteGratis:
            Boolean(
              item.shipping?.free_shipping
            ),

          lojaOficial:
            Boolean(
              item.official_store_id
            )
        }));

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
        erro.message
      );

      res.status(
        erro.status || 500
      ).json({
        success: false,
        message:
          "Erro ao consultar Mercado Livre.",
        error:
          erro.message
      });
    }
  }
);

// ======================================================
// CALCULAR PONTUAÇÃO
// ======================================================

function calcularPontuacao(
  produto
) {
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

  // Reputação
  if (reputacao >= 0.98) {
    pontos += 30;
  } else if (reputacao >= 0.95) {
    pontos += 25;
  } else if (reputacao >= 0.90) {
    pontos += 15;
  } else if (reputacao >= 0.80) {
    pontos += 5;
  }

  // Vendas
  if (vendas >= 1000) {
    pontos += 30;
  } else if (vendas >= 500) {
    pontos += 25;
  } else if (vendas >= 100) {
    pontos += 20;
  } else if (vendas >= 20) {
    pontos += 10;
  }

  // Frete grátis
  if (
    produto.shipping
      ?.free_shipping
  ) {
    pontos += 15;
  }

  // Loja oficial
  if (
    produto.official_store_id
  ) {
    pontos += 15;
  }

  return pontos;
}

// ======================================================
// ANALISAR PRODUTO
// ======================================================

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
      produto.seller
        ?.seller_reputation
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
      aprovado: false
    };
  }

  if (
    preco >
    filtros.precoMaximo
  ) {
    return {
      aprovado: false
    };
  }

  if (
    avaliacao <
    filtros.avaliacaoMinima
  ) {
    return {
      aprovado: false
    };
  }

  if (
    vendas <
    filtros.vendasMinimas
  ) {
    return {
      aprovado: false
    };
  }

  if (
    pontuacao <
    filtros.pontuacaoMinima
  ) {
    return {
      aprovado: false
    };
  }

  return {
    aprovado: true,

    produto: {
      nome:
        produto.title ||
        "Produto",

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

      avaliacao,

      vendas,

      pontuacao
    }
  };
}

// ======================================================
// SALVAR OFERTA
// ======================================================

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
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10
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

  return {
    salvo:
      resultado.rowCount > 0,

    id:
      resultado.rows[0]
        ?.id || null
  };
}

// ======================================================
// FILTROS
// ======================================================

async function obterFiltros() {
  const resultado =
    await pool.query(`
      SELECT
        preco_minimo,
        preco_maximo,
        avaliacao_minima,
        vendas_minimas,
        limite_por_categoria,
        pontuacao_minima,
        melhores_ofertas
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
      Number(
        f.preco_minimo
      ) || 0,

    precoMaximo:
      Number(
        f.preco_maximo
      ) || 100000,

    avaliacaoMinima:
      Number(
        f.avaliacao_minima
      ) || 0,

    vendasMinimas:
      Number(
        f.vendas_minimas
      ) || 0,

    limitePorCategoria:
      Number(
        f.limite_por_categoria
      ) || 20,

    pontuacaoMinima:
      Number(
        f.pontuacao_minima
      ) || 20,

    melhoresOfertas:
      Number(
        f.melhores_ofertas
      ) || 10
  };
}

// ======================================================
// MOTOR COMPLETO DE OFERTAS
// ======================================================

app.post(
  "/api/ofertas/motor-completo",
  async (req, res) => {
    try {
      const filtros =
        await obterFiltros();

      const aprovadas = [];

      let encontrados = 0;
      let aprovados = 0;
      let salvos = 0;
      let duplicados = 0;

      for (
        const categoria
        of CATEGORIAS_PADRAO
      ) {
        try {
          console.log(
            "BUSCANDO CATEGORIA:",
            categoria.nome
          );

          const dados =
            await buscarMercadoLivre(
              categoria.busca,
              Math.min(
                filtros.limitePorCategoria,
                50
              )
            );

          const produtos =
            dados.results || [];

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

            aprovadas.push(
              analise.produto
            );
          }

        } catch (erroCategoria) {
          console.error(
            "ERRO NA CATEGORIA:",
            categoria.nome,
            erroCategoria.message
          );
        }
      }

      // Remover duplicados por link
      const mapa =
        new Map();

      for (
        const oferta
        of aprovadas
      ) {
        if (
          oferta.link &&
          !mapa.has(
            oferta.link
          )
        ) {
          mapa.set(
            oferta.link,
            oferta
          );
        }
      }

      const unicas =
        Array.from(
          mapa.values()
        );

      // Ordenar melhores
      unicas.sort(
        (a, b) =>
          Number(
            b.pontuacao
          ) -
          Number(
            a.pontuacao
          )
      );

      // Selecionar melhores
      const melhores =
        unicas.slice(
          0,
          filtros.melhoresOfertas
        );

      // Salvar
      for (
        const oferta
        of melhores
      ) {
        const resultado =
          await salvarOferta(
            oferta
          );

        if (
          resultado.salvo
        ) {
          salvos++;

          oferta.id =
            resultado.id;

        } else {
          duplicados++;
        }
      }

      // Gerar posts
      const posts =
        await gerarPostsAutomaticos(
          melhores
        );

      res.json({
        success: true,

        message:
          "Motor completo executado com sucesso.",

        encontrados,

        aprovados,

        melhores:
          melhores.length,

        salvos,

        duplicados,

        ofertas:
          melhores,

        posts
      });

    } catch (erro) {
      console.error(
        "ERRO MOTOR COMPLETO:",
        erro
      );

      res.status(500).json({
        success: false,

        message:
          "Erro ao executar motor completo.",

        error:
          erro.message
      });
    }
  }
);

// ======================================================
// GERAR POST PARA UMA OFERTA
// ======================================================

function gerarPost(
  oferta
) {
  const preco =
    Number(
      oferta.preco
    ) || 0;

  const precoFormatado =
    preco > 0
      ? preco.toLocaleString(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL"
          }
        )
      : "Consulte o preço";

  const textoWhatsApp =
`🔥 *OFERTA ELETROMAX* 🔥

📦 *${oferta.nome}*

💰 *Por apenas: ${precoFormatado}*

🏷️ Categoria: ${oferta.categoria || "Oferta Especial"}

⭐ Oferta selecionada automaticamente pela Eletromax.

🛒 *COMPRE AQUI:*
${oferta.link}

⚡ *Eletromax*
🔥 As melhores ofertas em um só lugar!`;

  const textoInstagram =
`🔥 OFERTA IMPERDÍVEL!

📦 ${oferta.nome}

💰 Por apenas: ${precoFormatado}

🏷️ ${oferta.categoria || "Oferta Especial"}

⭐ Oferta selecionada pela Eletromax!

🛒 COMPRE AQUI:
${oferta.link}

⚡ Eletromax
🔥 Ofertas selecionadas todos os dias!

#Eletromax #Oferta #Promoção #Achadinhos #OfertasOnline`;

  const textoFacebook =
`🔥 OFERTA IMPERDÍVEL - ELETROMAX!

📦 ${oferta.nome}

💰 Preço: ${precoFormatado}

🏷️ Categoria: ${oferta.categoria || "Oferta Especial"}

⭐ Encontramos essa oferta e selecionamos para você!

🛒 Confira aqui:
${oferta.link}

⚡ Eletromax
🔥 Ofertas e produtos selecionados!`;

  return {
    ofertaId:
      oferta.id || null,

    nome:
      oferta.nome,

    imagem:
      oferta.imagem || "",

    link:
      oferta.link,

    whatsapp:
      textoWhatsApp,

    instagram:
      textoInstagram,

    facebook:
      textoFacebook
  };
}

// ======================================================
// GERAR POSTS AUTOMATICAMENTE
// ======================================================

async function gerarPostsAutomaticos(
  ofertas
) {
  const posts = [];

  for (
    const oferta
    of ofertas
  ) {
    const post =
      gerarPost(
        oferta
      );

    posts.push(post);

    if (
      oferta.id
    ) {
      await pool.query(
        `
        INSERT INTO posts_gerados
        (
          oferta_id,
          nome,
          plataforma,
          texto_whatsapp,
          texto_instagram,
          texto_facebook
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        `,
        [
          oferta.id,

          oferta.nome,

          "Mercado Livre",

          post.whatsapp,

          post.instagram,

          post.facebook
        ]
      );
    }
  }

  return posts;
}

// ======================================================
// LISTAR MELHORES OFERTAS
// ======================================================

app.get(
  "/api/ofertas/melhores",
  async (req, res) => {
    try {
      const limite =
        Math.min(
          Math.max(
            Number(
              req.query.limit || 10
            ),
            1
          ),
          50
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
            pontuacao,
            criado_em
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

      res.json({
        success: true,

        total:
          resultado.rows.length,

        ofertas:
          resultado.rows
      });

    } catch (erro) {
      res.status(500).json({
        success: false,

        message:
          "Erro ao buscar melhores ofertas.",

        error:
          erro.message
      });
    }
  }
);

// ======================================================
// LISTAR POSTS
// ======================================================

app.get(
  "/api/posts",
  async (req, res) => {
    try {
      const resultado =
        await pool.query(
          `
          SELECT
            id,
            oferta_id,
            nome,
            plataforma,
            texto_whatsapp AS "whatsapp",
            texto_instagram AS "instagram",
            texto_facebook AS "facebook",
            criado_em
          FROM posts_gerados
          ORDER BY id DESC
          LIMIT 100
          `
        );

      res.json({
        success: true,

        posts:
          resultado.rows
      });

    } catch (erro) {
      res.status(500).json({
        success: false,

        message:
          "Erro ao buscar posts.",

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
  }
);

// ======================================================
// BUSCAR E SALVAR MANUALMENTE
// ======================================================

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

    if (!busca) {
      return res.status(400).json({
        success: false,

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
        dados.results || [];

      let salvos = 0;
      let duplicados = 0;

      for (
        const produto
        of produtos
      ) {
        if (
          !produto.permalink
        ) {
          continue;
        }

        const resultado =
          await salvarOferta({
            nome:
              produto.title ||
              "Produto",

            preco:
              produto.price || 0,

            link:
              produto.permalink,

            imagem:
              produto.thumbnail || "",

            plataforma:
              "Mercado Livre",

            categoria:
              "Busca Manual",

            avaliacao:
              0,

            vendas:
              produto.sold_quantity || 0,

            pontuacao:
              calcularPontuacao(
                produto
              )
          });

        if (
          resultado.salvo
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
      res.status(
        erro.status || 500
      ).json({
        success: false,

        message:
          "Erro ao consultar Mercado Livre.",

        error:
          erro.message
      });
    }
  }
);

// ======================================================
// GERAR POST MANUAL
// ======================================================

app.post(
  "/api/ofertas/gerar-post",
  async (req, res) => {
    try {
      const oferta =
        req.body;

      if (
        !oferta.nome ||
        !oferta.link
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Nome e link são obrigatórios."
        });
      }

      const post =
        gerarPost(
          oferta
        );

      res.json({
        success: true,

        post
      });

    } catch (erro) {
      res.status(500).json({
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
// FILTROS - BUSCAR
// ======================================================

app.get(
  "/api/ofertas/filtros",
  async (req, res) => {
    try {
      const filtros =
        await obterFiltros();

      res.json({
        success: true,

        filtros
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

// ======================================================
// FILTROS - SALVAR
// ======================================================

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
        pontuacaoMinima,
        melhoresOfertas
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
          melhores_ofertas,
          atualizado_em
        )
        VALUES
        (
          1,$1,$2,$3,$4,$5,$6,$7,
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

          melhores_ofertas =
            EXCLUDED.melhores_ofertas,

          atualizado_em =
            CURRENT_TIMESTAMP
        `,
        [
          Number(precoMinimo) || 0,

          Number(precoMaximo) ||
            100000,

          Number(avaliacaoMinima) ||
            0,

          Number(vendasMinimas) ||
            0,

          Number(
            limitePorCategoria
          ) || 20,

          Number(
            pontuacaoMinima
          ) || 20,

          Number(
            melhoresOfertas
          ) || 10
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

// ======================================================
// CONFIGURAÇÕES
// ======================================================

app.get(
  "/api/configuracoes",
  async (req, res) => {
    try {
      const resultado =
        await pool.query(`
          SELECT
            id,
            nome_loja,
            link_mercadolivre,
            link_shopee,
            link_whatsapp
          FROM configuracoes
          WHERE id = 1
          LIMIT 1
        `);

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
          1,$1,$2,$3,$4,
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
          "Erro ao salvar configurações.",

        error:
          erro.message
      });
    }
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
          "SELECT COUNT(*)::int AS total FROM produtos"
        );

      const ofertas =
        await pool.query(
          "SELECT COUNT(*)::int AS total FROM ofertas"
        );

      const posts =
        await pool.query(
          "SELECT COUNT(*)::int AS total FROM posts_gerados"
        );

      res.json({
        success: true,

        totalProdutos:
          produtos.rows[0].total,

        totalOfertas:
          ofertas.rows[0].total,

        totalPosts:
          posts.rows[0].total,

        mercadoLivre:
          mercadoLivreAccessToken
            ? "conectado"
            : "não conectado"
      });

    } catch (erro) {
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

// ======================================================
// API PRINCIPAL
// ======================================================

app.get(
  "/api",
  (req, res) => {
    res.json({
      success: true,

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

// ======================================================
// 404 API
// ======================================================

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

// ======================================================
// INICIAR SERVIDOR
// ======================================================

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
