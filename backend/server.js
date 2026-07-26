const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const FRONTEND_PATH = path.join(__dirname, "..", "frontend");

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
// BANCO TEMPORÁRIO EM MEMÓRIA
// ======================================================
//
// Esta versão funciona sem PostgreSQL.
// Os dados serão perdidos quando o servidor reiniciar.
//
// Depois podemos conectar ao PostgreSQL para salvar tudo
// permanentemente.
//

let produtos = [];

let ofertas = [];

let configuracoes = {

  nome_loja: "Eletromax",

  link_mercadolivre:
    LINK_MERCADO_LIVRE,

  link_shopee:
    LINK_SHOPEE,

  link_whatsapp:
    LINK_WHATSAPP

};

// IDs automáticos

let proximoProdutoId = 1;

let proximaOfertaId = 1;


// ======================================================
// FUNÇÃO AUXILIAR
// ======================================================

function gerarIdProduto() {

  return proximoProdutoId++;

}


function gerarIdOferta() {

  return proximaOfertaId++;

}


// ======================================================
// ROTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {

  const indexPath =
    path.join(
      FRONTEND_PATH,
      "index.html"
    );

  res.sendFile(indexPath);

});


// ======================================================
// ARQUIVOS DO FRONTEND
// ======================================================

app.use(
  express.static(
    FRONTEND_PATH
  )
);


// ======================================================
// STATUS DA API
// ======================================================

app.get(
  "/api/status",
  (req, res) => {

    res.json({

      success: true,

      status: "online",

      sistema: "Eletromax V2",

      timestamp:
        new Date().toISOString()

    });

  }
);


// ======================================================
// DASHBOARD
// ======================================================

app.get(
  "/api/dashboard",
  (req, res) => {

    const totalProdutos =
      produtos.length;

    const totalOfertas =
      ofertas.length;

    const totalMercadoLivre =
      produtos.filter(
        produto =>
          String(
            produto.plataforma
          ).toLowerCase()
          .includes(
            "mercado"
          )
      ).length;

    const totalShopee =
      produtos.filter(
        produto =>
          String(
            produto.plataforma
          ).toLowerCase()
          .includes(
            "shopee"
          )
      ).length;


    res.json({

      success: true,

      totalProdutos,

      totalOfertas,

      totalMercadoLivre,

      totalShopee

    });

  }
);


// ======================================================
// PRODUTOS
// ======================================================

// LISTAR PRODUTOS

app.get(
  "/api/produtos",
  (req, res) => {

    res.json({

      success: true,

      produtos

    });

  }
);


// CADASTRAR PRODUTO

app.post(
  "/api/produtos",
  (req, res) => {

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

        return res.status(400)
          .json({

            success: false,

            message:
              "Nome, link e plataforma são obrigatórios."

          });

      }


      const produto = {

        id:
          gerarIdProduto(),

        nome:
          String(nome),

        preco:
          preco
          ? String(preco)
          : "",

        link:
          String(link),

        plataforma:
          String(plataforma),

        criadoEm:
          new Date().toISOString()

      };


      produtos.push(
        produto
      );


      res.status(201)
        .json({

          success: true,

          message:
            "Produto cadastrado com sucesso.",

          produto

        });

    } catch (error) {

      console.error(
        "Erro ao cadastrar produto:",
        error
      );


      res.status(500)
        .json({

          success: false,

          message:
            "Erro interno ao cadastrar produto."

        });

    }

  }
);


// EXCLUIR PRODUTO

app.delete(
  "/api/produtos/:id",
  (req, res) => {

    const id =
      Number(
        req.params.id
      );


    const quantidadeAntes =
      produtos.length;


    produtos =
      produtos.filter(
        produto =>
          produto.id !== id
      );


    if (
      produtos.length ===
      quantidadeAntes
    ) {

      return res.status(404)
        .json({

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

  }
);


// ======================================================
// OFERTAS
// ======================================================

// LISTAR OFERTAS

app.get(
  "/api/ofertas",
  (req, res) => {

    res.json({

      success: true,

      ofertas

    });

  }
);


// CADASTRAR OFERTA

app.post(
  "/api/ofertas",
  (req, res) => {

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

        return res.status(400)
          .json({

            success: false,

            message:
              "Nome, link e plataforma são obrigatórios."

          });

      }


      const oferta = {

        id:
          gerarIdOferta(),

        nome:
          String(nome),

        preco:
          preco
          ? String(preco)
          : "",

        precoAnterior:
          precoAnterior
          ? String(precoAnterior)
          : "",

        link:
          String(link),

        plataforma:
          String(plataforma),

        imagem:
          imagem
          ? String(imagem)
          : "",

        descricao:
          descricao
          ? String(descricao)
          : "",

        criadoEm:
          new Date().toISOString()

      };


      ofertas.push(
        oferta
      );


      res.status(201)
        .json({

          success: true,

          message:
            "Oferta cadastrada com sucesso.",

          oferta

        });

    } catch (error) {

      console.error(
        "Erro ao cadastrar oferta:",
        error
      );


      res.status(500)
        .json({

          success: false,

          message:
            "Erro interno ao cadastrar oferta."

        });

    }

  }
);


// ======================================================
// GERADOR DE POSTS
// ======================================================

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

        return res.status(400)
          .json({

            success: false,

            message:
              "Informe o nome do produto."

          });

      }


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
        LINK_WHATSAPP;


      res.json({

        success: true,

        texto

      });

    } catch (error) {

      console.error(
        "Erro ao gerar post:",
        error
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
// CONFIGURAÇÕES
// ======================================================

// BUSCAR CONFIGURAÇÕES

app.get(
  "/api/configuracoes",
  (req, res) => {

    res.json({

      success: true,

      configuracoes

    });

  }
);


// SALVAR CONFIGURAÇÕES

app.put(
  "/api/configuracoes",
  (req, res) => {

    try {

      const {

        nomeLoja,

        linkMercadoLivre,

        linkShopee,

        linkWhatsapp

      } = req.body;


      if (
        nomeLoja
      ) {

        configuracoes.nome_loja =
          String(
            nomeLoja
          );

      }


      if (
        linkMercadoLivre
      ) {

        configuracoes.link_mercadolivre =
          String(
            linkMercadoLivre
          );

      }


      if (
        linkShopee
      ) {

        configuracoes.link_shopee =
          String(
            linkShopee
          );

      }


      if (
        linkWhatsapp
      ) {

        configuracoes.link_whatsapp =
          String(
            linkWhatsapp
          );

      }


      res.json({

        success: true,

        message:
          "Configurações salvas com sucesso.",

        configuracoes

      });

    } catch (error) {

      console.error(
        "Erro nas configurações:",
        error
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
// LINKS DE AFILIADO
// ======================================================

app.get(
  "/api/links",
  (req, res) => {

    res.json({

      success: true,

      mercadoLivre:
        configuracoes
          .link_mercadolivre,

      shopee:
        configuracoes
          .link_shopee,

      whatsapp:
        configuracoes
          .link_whatsapp

    });

  }
);


// ======================================================
// CENTRAL DE OFERTAS
// ======================================================

// Retorna todas as ofertas ordenadas
// da mais recente para a mais antiga.

app.get(
  "/api/central-ofertas",
  (req, res) => {

    const lista =
      [...ofertas]
        .sort(
          (
            a,
            b
          ) =>
            new Date(
              b.criadoEm
            ) -
            new Date(
              a.criadoEm
            )
        );


    res.json({

      success: true,

      total:
        lista.length,

      ofertas:
        lista

    });

  }
);


// ======================================================
// ROTA DE TESTE
// ======================================================

app.get(
  "/api/teste",
  (req, res) => {

    res.json({

      success: true,

      mensagem:
        "Eletromax V2 funcionando corretamente!",

      frontend:
        FRONTEND_PATH,

      produtos:
        produtos.length,

      ofertas:
        ofertas.length

    });

  }
);


// ======================================================
// TRATAMENTO DE ERROS
// ======================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      "Erro interno:",
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

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "===================================="
    );

    console.log(
      "⚡ ELETROMAX V2"
    );

    console.log(
      "===================================="
    );

    console.log(
      "Servidor rodando na porta:",
      PORT
    );

    console.log(
      "Frontend:",
      FRONTEND_PATH
    );

    console.log(
      "Status: ONLINE"
    );

    console.log(
      "===================================="
    );

  }
);
