const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;

// ======================================================
// CAMINHO DO FRONTEND
// ======================================================

const FRONTEND_PATH = path.join(
  __dirname,
  "..",
  "frontend"
);

// ======================================================
// CONFIGURAÇÕES
// ======================================================

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

app.use(express.urlencoded({
  extended: true
}));

// ======================================================
// POSTGRESQL
// ======================================================

if (!process.env.DATABASE_URL) {

  console.error(
    "ERRO: DATABASE_URL não foi configurada."
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
// TESTE DE CONEXÃO
// ======================================================

async function testarBanco() {

  try {

    await pool.query(
      "SELECT NOW()"
    );

    console.log(
      "BANCO POSTGRESQL CONECTADO"
    );

    return true;

  } catch (erro) {

    console.error(
      "ERRO AO CONECTAR POSTGRESQL:",
      erro.message
    );

    return false;

  }

}


// ======================================================
// CRIAR TABELAS
// ======================================================

async function inicializarBanco() {

  try {

    // ==================================================
    // PRODUTOS
    // ==================================================

    await pool.query(`

      CREATE TABLE IF NOT EXISTS produtos (

        id SERIAL PRIMARY KEY,

        nome TEXT NOT NULL,

        preco TEXT,

        link TEXT NOT NULL,

        plataforma TEXT NOT NULL,

        criado_em TIMESTAMP
          DEFAULT CURRENT_TIMESTAMP

      )

    `);


    // ==================================================
    // OFERTAS
    // ==================================================

    await pool.query(`

      CREATE TABLE IF NOT EXISTS ofertas (

        id SERIAL PRIMARY KEY,

        nome TEXT NOT NULL,

        preco TEXT,

        preco_anterior TEXT,

        link TEXT NOT NULL,

        plataforma TEXT NOT NULL,

        imagem TEXT,

        descricao TEXT,

        criado_em TIMESTAMP
          DEFAULT CURRENT_TIMESTAMP

      )

    `);


    // ==================================================
    // CONFIGURAÇÕES
    // ==================================================

    await pool.query(`

      CREATE TABLE IF NOT EXISTS configuracoes (

        id INTEGER PRIMARY KEY,

        nome_loja TEXT,

        link_mercadolivre TEXT,

        link_shopee TEXT,

        link_whatsapp TEXT,

        atualizado_em TIMESTAMP
          DEFAULT CURRENT_TIMESTAMP

      )

    `);


    // ==================================================
    // CONFIGURAÇÃO PADRÃO
    // ==================================================

    await pool.query(`

      INSERT INTO configuracoes (

        id,

        nome_loja,

        link_mercadolivre,

        link_shopee,

        link_whatsapp

      )

      VALUES (

        1,

        'Eletromax',

        $1,

        $2,

        $3

      )

      ON CONFLICT (id)

      DO NOTHING

    `, [

      LINK_MERCADO_LIVRE,

      LINK_SHOPEE,

      LINK_WHATSAPP

    ]);


    console.log(
      "TABELA PRODUTOS PRONTA"
    );

    console.log(
      "TABELA OFERTAS PRONTA"
    );

    console.log(
      "TABELA CONFIGURACOES PRONTA"
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


// ======================================================
// PÁGINA PRINCIPAL
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
            "ERRO AO ENVIAR INDEX:",
            erro.message
          );

          res.status(500).send(
            "Erro: index.html não foi encontrado."
          );

        }

      }

    );

  }
);


// ======================================================
// ARQUIVOS DO FRONTEND
// ======================================================

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

    try {

      await pool.query(
        "SELECT NOW()"
      );

      res.json({

        success: true,

        message:
          "Eletromax API funcionando!",

        status:
          "online",

        database:
          "connected"

      });

    } catch (erro) {

      console.error(
        "ERRO STATUS:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro na conexão com banco.",

          database:
            "disconnected"

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

      const produtosResult =
        await pool.query(
          `
          SELECT COUNT(*) AS total
          FROM produtos
          `
        );


      const ofertasResult =
        await pool.query(
          `
          SELECT COUNT(*) AS total
          FROM ofertas
          `
        );


      const mlResult =
        await pool.query(
          `
          SELECT COUNT(*) AS total
          FROM produtos
          WHERE LOWER(plataforma)
          LIKE '%mercado%'
          `
        );


      const shopeeResult =
        await pool.query(
          `
          SELECT COUNT(*) AS total
          FROM produtos
          WHERE LOWER(plataforma)
          LIKE '%shopee%'
          `
        );


      res.json({

        success: true,

        totalProdutos:
          Number(
            produtosResult.rows[0].total
          ),

        totalOfertas:
          Number(
            ofertasResult.rows[0].total
          ),

        totalMercadoLivre:
          Number(
            mlResult.rows[0].total
          ),

        totalShopee:
          Number(
            shopeeResult.rows[0].total
          )

      });

    } catch (erro) {

      console.error(
        "ERRO DASHBOARD:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao carregar dashboard."

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
          `
          SELECT *

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

      console.error(
        "ERRO AO BUSCAR PRODUTOS:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar produtos."

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

            preco
              ? String(preco).trim()
              : "",

            String(link).trim(),

            String(plataforma).trim()

          ]

        );


      res.status(201)
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

      res.status(500)
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

          `
          DELETE FROM produtos

          WHERE id = $1

          RETURNING *
          `,

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
          "Produto excluído com sucesso!",

        produto:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        "ERRO AO DELETAR PRODUTO:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao excluir produto."

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

            preco_anterior
              AS "precoAnterior",

            link,

            plataforma,

            imagem,

            descricao,

            criado_em
              AS "criadoEm"

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

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar ofertas."

        });

    }

  }
);


// ======================================================
// OFERTAS - CADASTRAR
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

          `
          INSERT INTO ofertas

          (
            nome,
            preco,
            preco_anterior,
            link,
            plataforma,
            imagem,
            descricao
          )

          VALUES

          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )

          RETURNING *

          `,

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


      res.status(201)
        .json({

          success: true,

          message:
            "Oferta cadastrada com sucesso!",

          oferta:
            resultado.rows[0]

        });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR OFERTA:",
        erro.message
      );

      res.status(500)
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

          `
          SELECT

            id,

            nome,

            preco,

            preco_anterior
              AS "precoAnterior",

            link,

            plataforma,

            imagem,

            descricao,

            criado_em
              AS "criadoEm"

          FROM ofertas

          ORDER BY id DESC

          `

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

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao carregar Central de Ofertas."

        });

    }

  }
);


// ======================================================
// GERADOR DE POSTS
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
              "Informe o nome do produto."

          });

      }


      const configResult =
        await pool.query(

          `
          SELECT *

          FROM configuracoes

          WHERE id = 1

          LIMIT 1

          `

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
        "🛒 Plataforma: " +
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
        "⚡ Aproveite enquanto durar o estoque!\n\n";


      texto +=
        "📲 Entre no nosso grupo de ofertas:\n" +
        whatsapp;


      res.json({

        success: true,

        texto

      });

    } catch (erro) {

      console.error(
        "ERRO AO GERAR POST:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao gerar publicação."

        });

    }

  }
);


// ======================================================
// CONFIGURAÇÕES - BUSCAR
// ======================================================

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


      let config =
        resultado.rows[0];


      if (
        !config
      ) {

        config = {

          id: 1,

          nome_loja:
            "Eletromax",

          link_mercadolivre:
            LINK_MERCADO_LIVRE,

          link_shopee:
            LINK_SHOPEE,

          link_whatsapp:
            LINK_WHATSAPP

        };

      }


      res.json({

        success: true,

        configuracoes:
          config

      });

    } catch (erro) {

      console.error(
        "ERRO AO BUSCAR CONFIGURAÇÕES:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar configurações."

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

          RETURNING *

          `,

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
          "Configurações salvas com sucesso!",

        configuracoes:
          resultado.rows[0]

      });

    } catch (erro) {

      console.error(
        "ERRO AO SALVAR CONFIGURAÇÕES:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao salvar configurações."

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
        "ERRO AO BUSCAR LINKS:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro ao buscar links."

        });

    }

  }
);


// ======================================================
// TESTE
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


      res.json({

        success:
          banco,

        mensagem:
          "Eletromax V2 funcionando corretamente!",

        banco:
          banco
            ? "PostgreSQL conectado"
            : "PostgreSQL com erro",

        produtos:
          Number(
            produtos.rows[0].count
          ),

        ofertas:
          Number(
            ofertas.rows[0].count
          )

      });

    } catch (erro) {

      console.error(
        "ERRO TESTE:",
        erro.message
      );

      res.status(500)
        .json({

          success: false,

          message:
            "Erro no teste do sistema.",

          error:
            erro.message

        });

    }

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


    res.status(500)
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
    "===================================="
  );

  console.log(
    "⚡ ELETROMAX V2"
  );

  console.log(
    "===================================="
  );


  const bancoOK =
    await inicializarBanco();


  if (
    !bancoOK
  ) {

    console.error(
      "ATENÇÃO: Banco não foi inicializado."
    );

    console.error(
      "Verifique a variável DATABASE_URL."
    );

  }


  app.listen(

    PORT,

    "0.0.0.0",

    () => {

      console.log(
        "Servidor rodando na porta:",
        PORT
      );

      console.log(
        "Frontend:",
        FRONTEND_PATH
      );

      console.log(
        "PostgreSQL:",
        bancoOK
          ? "CONECTADO"
          : "ERRO"
      );

      console.log(
        "Status: ONLINE"
      );

      console.log(
        "===================================="
      );

    }

  );

}


iniciarServidor();
