const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================
// MIDDLEWARES
// ======================================

app.use(cors());

app.use(express.json({
    limit: "2mb"
}));

app.use(express.urlencoded({
    extended: true
}));

// ======================================
// FRONTEND
// ======================================

const frontendPath = path.join(
    __dirname,
    "../frontend"
);

app.use(
    express.static(frontendPath)
);

app.get("/", (req, res) => {

    res.sendFile(
        path.join(frontendPath, "index.html"),
        erro => {

            if (erro) {

                res.send("⚡ Eletromax V2");

            }

        }
    );

});

// ======================================
// POSTGRESQL
// ======================================

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

pool.on("error", erro => {

    console.error(
        "Erro PostgreSQL:",
        erro.message
    );

});

// ======================================
// MERCADO LIVRE
// ======================================

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

// ======================================
// CONFIGURAÇÕES PADRÃO
// ======================================

const FILTROS_PADRAO = {

    precoMinimo: 0,

    precoMaximo: 100000,

    avaliacaoMinima: 0,

    vendasMinimas: 0,

    limitePorCategoria: 20,

    pontuacaoMinima: 0

};

const CATEGORIAS_PADRAO = [

    {
        nome: "Casa",
        busca: "casa decoração"
    },

    {
        nome: "Ferramentas",
        busca: "ferramentas"
    },

    {
        nome: "Automotivo",
        busca: "automotivo"
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
        nome: "Informática",
        busca: "informática"
    }

];

// ======================================
// FUNÇÕES AUXILIARES
// ======================================

function numeroSeguro(valor, padrao = 0) {

    const n = Number(valor);

    return Number.isFinite(n)
        ? n
        : padrao;

}

function normalizarPreco(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {

        return "";

    }

    return String(valor);

}
// ======================================
// INICIALIZAR BANCO
// ======================================

async function inicializarBanco() {

    try {

        await pool.query("SELECT 1");

        // PRODUTOS
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

        // OFERTAS
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

        // MIGRAÇÃO AUTOMÁTICA

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

        // Compatibilidade com versões antigas

        const existeTitulo = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='ofertas'
            AND column_name='titulo'
        `);

        if (existeTitulo.rowCount > 0) {

            await pool.query(`
                UPDATE ofertas
                SET nome = titulo
                WHERE nome IS NULL
            `);

        }

        // Remove links duplicados

        await pool.query(`
            DELETE FROM ofertas a
            USING ofertas b
            WHERE a.id > b.id
            AND a.link = b.link
            AND a.link <> ''
        `);

        // Índice único

        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS ofertas_link_unico
            ON ofertas(link)
            WHERE link IS NOT NULL
            AND link <> ''
        `);

        console.log("✅ Banco inicializado.");

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
// STATUS MERCADO LIVRE
// ==========================================

app.get("/api/mercadolivre/status", async (req, res) => {
  try {
    if (!mercadoLivreAccessToken && process.env.DATABASE_URL) {
      await carregarTokenMercadoLivre();
    }

    res.json({
      success: true,
      conectado: Boolean(mercadoLivreAccessToken),
      configurado: Boolean(
        process.env.ML_CLIENT_ID &&
        process.env.ML_CLIENT_SECRET &&
        process.env.ML_REDIRECT_URI
      ),
      userId: mercadoLivreUserId || null
    });

  } catch (erro) {
    console.error("ERRO STATUS MERCADO LIVRE:", erro.message);

    res.status(500).json({
      success: false,
      conectado: false,
      message: erro.message
    });
  }
});

// ==========================================
// BUSCAR E SALVAR OFERTAS DO MERCADO LIVRE
// ==========================================

app.post("/api/mercadolivre/buscar-salvar", async (req, res) => {

  const busca = String(req.body?.q || "").trim();

  const limite = Math.min(
    Math.max(Number(req.body?.limit || 20), 1),
    50
  );

  if (!busca) {
    return res.status(400).json({
      success: false,
      message: "Informe o termo de busca."
    });
  }

  try {

    const dados = await buscarMercadoLivre(busca, limite);

    const produtos = Array.isArray(dados.results)
      ? dados.results
      : [];

    let salvos = 0;
    let atualizados = 0;

    for (const produto of produtos) {

      if (!produto.permalink) continue;

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
        pontuacao: calcularPontuacao(produto)
      };

      const existe = await pool.query(
        "SELECT id FROM ofertas WHERE link=$1 LIMIT 1",
        [oferta.link]
      );

      const jaExistia = existe.rowCount > 0;

      await salvarOferta(oferta);

      if (jaExistia) {
        atualizados++;
      } else {
        salvos++;
      }
    }

    res.json({
      success: true,
      encontrados: produtos.length,
      salvos,
      atualizados,
      totalProcessados: salvos + atualizados
    });

  } catch (erro) {

    console.error("ERRO MERCADO LIVRE:", erro);

    res.status(erro.status || 500).json({
      success: false,
      message: erro.message,
      code: erro.code || "ML_SEARCH_ERROR"
    });

  }

});
// ==========================================
// STATUS MERCADO LIVRE
// ==========================================

app.get("/api/mercadolivre/status", async (req, res) => {
  try {
    if (!mercadoLivreAccessToken && process.env.DATABASE_URL) {
      await carregarTokenMercadoLivre();
    }

    res.json({
      success: true,
      conectado: Boolean(mercadoLivreAccessToken),
      configurado: Boolean(
        process.env.ML_CLIENT_ID &&
        process.env.ML_CLIENT_SECRET &&
        process.env.ML_REDIRECT_URI
      ),
      userId: mercadoLivreUserId || null
    });

  } catch (erro) {
    console.error("ERRO STATUS MERCADO LIVRE:", erro.message);

    res.status(500).json({
      success: false,
      conectado: false,
      message: erro.message
    });
  }
});

// ==========================================
// BUSCAR E SALVAR OFERTAS DO MERCADO LIVRE
// ==========================================

app.post("/api/mercadolivre/buscar-salvar", async (req, res) => {

  const busca = String(req.body?.q || "").trim();

  const limite = Math.min(
    Math.max(Number(req.body?.limit || 20), 1),
    50
  );

  if (!busca) {
    return res.status(400).json({
      success: false,
      message: "Informe o termo de busca."
    });
  }

  try {

    const dados = await buscarMercadoLivre(busca, limite);

    const produtos = Array.isArray(dados.results)
      ? dados.results
      : [];

    let salvos = 0;
    let atualizados = 0;

    for (const produto of produtos) {

      if (!produto.permalink) continue;

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
        pontuacao: calcularPontuacao(produto)
      };

      const existe = await pool.query(
        "SELECT id FROM ofertas WHERE link=$1 LIMIT 1",
        [oferta.link]
      );

      const jaExistia = existe.rowCount > 0;

      await salvarOferta(oferta);

      if (jaExistia) {
        atualizados++;
      } else {
        salvos++;
      }
    }

    res.json({
      success: true,
      encontrados: produtos.length,
      salvos,
      atualizados,
      totalProcessados: salvos + atualizados
    });

  } catch (erro) {

    console.error("ERRO MERCADO LIVRE:", erro);

    res.status(erro.status || 500).json({
      success: false,
      message: erro.message,
      code: erro.code || "ML_SEARCH_ERROR"
    });

  }

});
// ==========================================
// GERAR POST INDIVIDUAL
// ==========================================

app.post("/api/ofertas/gerar-post", async (req, res) => {

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
        success: false,
        message: "Nome do produto é obrigatório."
      });
    }

    const texto = `🔥 OFERTA IMPERDÍVEL!

📦 ${nome}
${categoria ? `🏷️ Categoria: ${categoria}\n` : ""}
${precoAnterior ? `💸 De: ${precoAnterior}\n` : ""}
💰 Por apenas: ${preco || "Consulte o preço"}

🛒 Comprar:
${link || "Link não informado"}

${plataforma ? `🛍️ Plataforma: ${plataforma}\n` : ""}
⚡ Eletromax
🔥 Ofertas selecionadas para você!`;

    res.json({
      success: true,
      texto
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: "Erro ao gerar post.",
      error: erro.message
    });

  }

});

// ==========================================
// GERAR MELHORES OFERTAS
// ==========================================

app.get("/api/ofertas/gerar-post-melhores", async (req, res) => {

  try {

    const limite = Math.min(
      Math.max(Number(req.query.limit || 10), 1),
      20
    );

    const resultado = await pool.query(`
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
      ORDER BY pontuacao DESC,vendas DESC,id DESC
      LIMIT $1
    `,[limite]);

    const ofertas = resultado.rows;

    if (!ofertas.length) {
      return res.json({
        success:true,
        quantidade:0,
        texto:"Nenhuma oferta disponível.",
        ofertas:[]
      });
    }

    let texto=`🔥🔥 MELHORES OFERTAS ELETROMAX 🔥🔥

Selecionamos ofertas especiais para você!

`;

    ofertas.forEach((o,i)=>{

      texto += `${i+1}️⃣ ${o.nome}

💰 R$ ${o.preco}
${o.precoAnterior ? `💸 De: R$ ${o.precoAnterior}\n` : ""}
🛒 ${o.link}

`;

    });

    texto += `⚡ Eletromax`;

    res.json({
      success:true,
      quantidade:ofertas.length,
      texto,
      ofertas
    });

  } catch (erro) {

    res.status(500).json({
      success:false,
      message:"Erro ao gerar post.",
      error:erro.message
    });

  }

});
// ==========================================
// CONFIGURAÇÕES
// ==========================================

app.get("/api/configuracoes", async (req, res) => {
  try {

    const resultado = await pool.query(`
      SELECT *
      FROM configuracoes
      WHERE id = 1
      LIMIT 1
    `);

    res.json({
      success: true,
      configuracoes: resultado.rows[0] || {}
    });

  } catch (erro) {

    res.status(500).json({
      success: false,
      message: "Erro ao carregar configurações.",
      error: erro.message
    });

  }
});

app.put("/api/configuracoes", async (req, res) => {

  try {

    const {
      nomeLoja,
      linkMercadoLivre,
      linkShopee,
      linkWhatsapp
    } = req.body;

    await pool.query(`
      UPDATE configuracoes
      SET
        nome_loja=$1,
        link_mercadolivre=$2,
        link_shopee=$3,
        link_whatsapp=$4,
        atualizado_em=CURRENT_TIMESTAMP
      WHERE id=1
    `,[
      nomeLoja || "Eletromax",
      linkMercadoLivre || "",
      linkShopee || "",
      linkWhatsapp || ""
    ]);

    res.json({
      success:true,
      message:"Configurações salvas."
    });

  } catch (erro) {

    res.status(500).json({
      success:false,
      message:"Erro ao salvar configurações.",
      error:erro.message
    });

  }

});

// ==========================================
// LINKS
// ==========================================

app.get("/api/links", async (req,res)=>{

  try{

    const resultado=await pool.query(`
      SELECT
        link_whatsapp,
        link_shopee,
        link_mercadolivre
      FROM configuracoes
      WHERE id=1
      LIMIT 1
    `);

    res.json({
      success:true,
      whatsapp:resultado.rows[0]?.link_whatsapp || "",
      shopee:resultado.rows[0]?.link_shopee || "",
      mercadolivre:resultado.rows[0]?.link_mercadolivre || ""
    });

  }catch(erro){

    res.status(500).json({
      success:false,
      message:"Erro ao buscar links.",
      error:erro.message
    });

  }

});

// ==========================================
// API
// ==========================================

app.get("/api",(req,res)=>{

  res.json({

    success:true,
    message:"Eletromax V2 API funcionando!",
    version:"2.0",

    mercadoLivre:
      mercadoLivreAccessToken
      ? "conectado"
      : "não conectado",

    banco:
      process.env.DATABASE_URL
      ? "configurado"
      : "não configurado"

  });

});

// ==========================================
// HEALTH
// ==========================================

app.get("/health",async(req,res)=>{

  try{

    await pool.query("SELECT 1");

    res.json({

      success:true,
      status:"online",
      database:"connected",
      mercadolivre:
        mercadoLivreAccessToken
        ? "connected"
        : "not_connected",
      timestamp:new Date().toISOString()

    });

  }catch(erro){

    res.status(503).json({

      success:false,
      status:"offline",
      error:erro.message

    });

  }

});

// ==========================================
// 404 API
// ==========================================

app.use("/api",(req,res)=>{

  res.status(404).json({

    success:false,
    message:"Rota da API não encontrada.",
    rota:req.originalUrl

  });

});

// ==========================================
// 404 GERAL
// ==========================================

app.use((req,res)=>{

  res.status(404).send("Página não encontrada.");

});

// ==========================================
// ERRO GLOBAL
// ==========================================

app.use((erro,req,res,next)=>{

  console.error(erro);

  res.status(erro.status || 500).json({

    success:false,
    message:"Erro interno do servidor.",
    error:
      process.env.NODE_ENV==="production"
      ? undefined
      : erro.message

  });

});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

async function iniciarServidor(){

  await inicializarBanco();

  app.listen(PORT,"0.0.0.0",()=>{

    console.log("=================================");
    console.log("⚡ ELETROMAX V2 ONLINE");
    console.log("PORTA:",PORT);
    console.log("API: /api");
    console.log("STATUS: /api/status");
    console.log("HEALTH: /health");
    console.log("=================================");

  });

}

iniciarServidor();
// ==========================================
// ENCERRAMENTO SEGURO DO SERVIDOR
// ==========================================

let servidor = null;

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

    if (pool) {

      await pool.end();

      console.log("Pool PostgreSQL encerrado.");

    }

    process.exit(0);

  } catch (erro) {

    console.error("Erro ao encerrar servidor:", erro);

    process.exit(1);

  }

}

process.on("SIGINT", () => desligarServidor("SIGINT"));
process.on("SIGTERM", () => desligarServidor("SIGTERM"));

// ==========================================
// TRATAMENTO GLOBAL DE ERROS
// ==========================================

process.on("unhandledRejection", (erro) => {

  console.error("PROMISE NÃO TRATADA");
  console.error(erro);

});

process.on("uncaughtException", (erro) => {

  console.error("EXCEÇÃO NÃO TRATADA");
  console.error(erro);

});

// ==========================================
// MIDDLEWARE FINAL DE ERROS
// ==========================================

app.use((erro, req, res, next) => {

  console.error("ERRO GLOBAL:", erro);

  if (res.headersSent) {
    return next(erro);
  }

  res.status(erro.status || 500).json({

    success: false,
    message: "Erro interno do servidor.",
    error:
      process.env.NODE_ENV === "production"
        ? undefined
        : erro.message

  });

});
// ==========================================
// INICIALIZAÇÃO DO ELETROMAX V2
// ==========================================

async function iniciarServidor() {

  console.log("=================================");
  console.log("INICIANDO ELETROMAX V2...");
  console.log("=================================");

  try {

    const bancoOK = await inicializarBanco();

    servidor = app.listen(PORT, "0.0.0.0", () => {

      console.log("=================================");
      console.log("⚡ ELETROMAX V2 ONLINE");
      console.log("=================================");

      console.log(`Porta: ${PORT}`);

      console.log(
        `Banco: ${
          bancoOK
            ? "CONECTADO"
            : "ERRO"
        }`
      );

      console.log(
        `Mercado Livre: ${
          mercadoLivreAccessToken
            ? "CONECTADO"
            : "NÃO CONECTADO"
        }`
      );

      console.log("Motor de ofertas: ATIVO");
      console.log("Filtro automático: ATIVO");
      console.log("Gerador de posts: ATIVO");

      console.log("---------------------------------");
      console.log(`API: http://localhost:${PORT}/api`);
      console.log(`STATUS: http://localhost:${PORT}/api/status`);
      console.log(`HEALTH: http://localhost:${PORT}/health`);
      console.log("---------------------------------");

      console.log("✅ ELETROMAX V2 PRONTO!");

    });

  } catch (erro) {

    console.error("=================================");
    console.error("ERRO FATAL AO INICIAR");
    console.error(erro);
    console.error("=================================");

    process.exit(1);

  }

}

// ==========================================
// EXECUTAR SERVIDOR
// ==========================================

iniciarServidor();
