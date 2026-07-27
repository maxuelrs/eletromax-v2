const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


// ==========================================
// FRONTEND
// ==========================================

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));


app.get("/", (req,res)=>{

res.sendFile(
path.join(frontendPath,"index.html")
);

});



// ==========================================
// BANCO POSTGRES
// ==========================================

const pool = new Pool({

connectionString:
process.env.DATABASE_URL,

ssl:{
rejectUnauthorized:false
}

});




// ==========================================
// INICIALIZAR BANCO
// ==========================================

async function inicializarBanco(){

try{


await pool.query(`

CREATE TABLE IF NOT EXISTS produtos(

id SERIAL PRIMARY KEY,

nome TEXT NOT NULL,

preco TEXT,

link TEXT NOT NULL,

plataforma TEXT NOT NULL,

criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

`);



await pool.query(`

CREATE TABLE IF NOT EXISTS ofertas(

id SERIAL PRIMARY KEY,

nome TEXT NOT NULL,

preco TEXT,

preco_anterior TEXT,

imagem TEXT,

link TEXT,

plataforma TEXT,

criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

`);




await pool.query(`

CREATE TABLE IF NOT EXISTS configuracoes(

id SERIAL PRIMARY KEY,

nome_loja TEXT DEFAULT 'Eletromax',

link_mercadolivre TEXT,

link_shopee TEXT,

link_whatsapp TEXT,

ml_access_token TEXT,

ml_refresh_token TEXT

);

`);




const existe =
await pool.query(
"SELECT id FROM configuracoes LIMIT 1"
);



if(existe.rows.length===0){

await pool.query(`

INSERT INTO configuracoes(nome_loja)

VALUES('Eletromax')

`);

}


console.log("✅ Banco inicializado");


}catch(erro){

console.log(
"Erro banco:",
erro.message
);

}


}



// ==========================================
// STATUS API
// ==========================================

app.get("/api/status",async(req,res)=>{


try{


await pool.query(
"SELECT NOW()"
);



res.json({

success:true,

status:"online",

database:"connected",

mercadolivre:
process.env.ML_CLIENT_ID
?
"configured"
:
"not_configured"

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});


}


});



// ==========================================
// DASHBOARD
// ==========================================

app.get("/api/dashboard",async(req,res)=>{


try{


const produtos =
await pool.query(
"SELECT COUNT(*) FROM produtos"
);


const ofertas =
await pool.query(
"SELECT COUNT(*) FROM ofertas"
);



res.json({

totalProdutos:
Number(produtos.rows[0].count),

totalOfertas:
Number(ofertas.rows[0].count)

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});

}


});
// ==========================================
// PRODUTOS
// ==========================================


app.get("/api/produtos",async(req,res)=>{

try{


const resultado =
await pool.query(

"SELECT * FROM produtos ORDER BY id DESC"

);


res.json({

success:true,

produtos:resultado.rows

});


}catch(erro){

res.status(500).json({

success:false,

message:erro.message

});

}


});





app.post("/api/produtos",async(req,res)=>{


try{


const {

nome,

preco,

link,

plataforma

}=req.body;



if(!nome || !link || !plataforma){

return res.status(400).json({

success:false,

message:"Dados obrigatórios não informados."

});

}



const resultado =
await pool.query(`

INSERT INTO produtos

(nome,preco,link,plataforma)

VALUES($1,$2,$3,$4)

RETURNING *

`,[

nome,

preco,

link,

plataforma

]);



res.json({

success:true,

produto:resultado.rows[0]

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});


}


});






app.delete("/api/produtos/:id",async(req,res)=>{


try{


await pool.query(

"DELETE FROM produtos WHERE id=$1",

[req.params.id]

);



res.json({

success:true,

message:"Produto removido."

});


}catch(erro){

res.status(500).json({

success:false,

message:erro.message

});

}


});




// ==========================================
// OFERTAS
// ==========================================


app.get("/api/ofertas",async(req,res)=>{


try{


const resultado =
await pool.query(

"SELECT * FROM ofertas ORDER BY id DESC"

);



res.json({

success:true,

ofertas:resultado.rows

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});


}


});





// ==========================================
// CONFIGURAÇÕES
// ==========================================


app.get("/api/configuracoes",async(req,res)=>{


try{


const resultado =
await pool.query(

"SELECT * FROM configuracoes LIMIT 1"

);



res.json({

success:true,

configuracoes:
resultado.rows[0] || {}

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});


}


});





// ==========================================
// MERCADO LIVRE OAUTH
// ==========================================

app.get("/api/mercadolivre/login",(req,res)=>{

if(!process.env.ML_CLIENT_ID ||
!process.env.ML_REDIRECT_URI){

return res.json({

success:false,

message:"Configurar OAuth do Mercado Livre."

});

}


const url =

"https://auth.mercadolivre.com.br/authorization" +

"?response_type=code" +

"&client_id=" +
process.env.ML_CLIENT_ID +

"&redirect_uri=" +
encodeURIComponent(
process.env.ML_REDIRECT_URI
);


res.redirect(url);

});

app.get("/api/mercadolivre/status",async(req,res)=>{


try{


const resultado =
await pool.query(

"SELECT ml_access_token FROM configuracoes LIMIT 1"

);



res.json({

success:true,

conectado:
!!resultado.rows[0]?.ml_access_token

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});


}


});






// ABRIR LOGIN MERCADO LIVRE


app.get("/auth/mercadolivre",(req,res)=>{


if(!process.env.ML_CLIENT_ID ||
!process.env.ML_REDIRECT_URI){


return res.json({

success:false,

message:
"Configurar OAuth do Mercado Livre."

});


}



const url =

"https://auth.mercadolivre.com.br/authorization" +

"?response_type=code" +

"&client_id=" +

process.env.ML_CLIENT_ID +

"&redirect_uri=" +

encodeURIComponent(
process.env.ML_REDIRECT_URI
);



res.redirect(url);


});






// CALLBACK MERCADO LIVRE


app.get("/auth/mercadolivre/callback",async(req,res)=>{


const code =
req.query.code;



if(!code){

return res.send(
"Codigo não recebido."
);

}



try{


const resposta =
await fetch(

"https://api.mercadolibre.com/oauth/token",

{

method:"POST",

headers:{

"Content-Type":
"application/x-www-form-urlencoded"

},

body:new URLSearchParams({

grant_type:
"authorization_code",

client_id:
process.env.ML_CLIENT_ID,

client_secret:
process.env.ML_CLIENT_SECRET,

code:code,

redirect_uri:
process.env.ML_REDIRECT_URI

})

}

);



const dados =
await resposta.json();



await pool.query(`

UPDATE configuracoes

SET

ml_access_token=$1,

ml_refresh_token=$2

WHERE id=1

`,[

dados.access_token,

dados.refresh_token

]);



res.send(`

<h2>✅ Mercado Livre conectado!</h2>

<p>Eletromax V2 autorizado com sucesso.</p>

`);




}catch(erro){


res.status(500).send(

"Erro OAuth Mercado Livre: "

+ erro.message

);


}


});
// ==========================================
// BUSCAR MERCADO LIVRE
// ==========================================


app.get("/api/mercadolivre/buscar",(req,res)=>{


res.json({

success:true,

produtos:[]

});


});





app.post("/api/mercadolivre/buscar-salvar",(req,res)=>{


res.json({

success:true,

encontrados:0,

salvos:0,

duplicados:0

});


});





// ==========================================
// GERADOR DE POSTS
// ==========================================


app.post("/api/ofertas/gerar-post",(req,res)=>{


const {

nome,

preco,

precoAnterior,

plataforma,

link

}=req.body;



const texto =

`🔥 OFERTA IMPERDÍVEL!

📦 ${nome}

${precoAnterior ? "💸 De: "+precoAnterior+"\n" : ""}

💰 Por: ${preco}

🛒 ${plataforma}

🔗 Link:
${link}

⚡ Eletromax`;



res.json({

success:true,

texto:texto

});


});






// ==========================================
// LINKS
// ==========================================


app.get("/api/links",async(req,res)=>{


try{


const resultado =
await pool.query(

"SELECT * FROM configuracoes LIMIT 1"

);



const cfg =
resultado.rows[0] || {};



res.json({

whatsapp:
cfg.link_whatsapp,

shopee:
cfg.link_shopee,

mercadolivre:
cfg.link_mercadolivre

});


}catch(erro){


res.status(500).json({

success:false,

message:erro.message

});


}


});






// ==========================================
// INICIAR SERVIDOR
// ==========================================


console.log("VARIÁVEIS MERCADO LIVRE:");

console.log(

"ML_CLIENT_ID:",

process.env.ML_CLIENT_ID
?
"OK"
:
"VAZIO"

);


console.log(

"ML_CLIENT_SECRET:",

process.env.ML_CLIENT_SECRET
?
"OK"
:
"VAZIO"

);



console.log(

"ML_REDIRECT_URI:",

process.env.ML_REDIRECT_URI
?
"OK"
:
"VAZIO"

);





async function iniciarServidor(){


await inicializarBanco();



app.listen(

PORT,

"0.0.0.0",

()=>{


console.log("======================");

console.log("⚡ ELETROMAX V2.1 ONLINE");

console.log("PORTA:",PORT);

console.log("======================");


}

);


}




iniciarServidor();
