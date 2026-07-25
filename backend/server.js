const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota principal
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Eletromax V2</title>
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f4f6f8;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }

        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          max-width: 500px;
          width: 90%;
        }

        h1 {
          color: #111827;
        }

        p {
          color: #6b7280;
        }

        .status {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 20px;
          background: #dcfce7;
          color: #166534;
          border-radius: 20px;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="container">
        <h1>⚡ Eletromax V2</h1>
        <p>Painel Eletromax está online!</p>
        <div class="status">● Sistema funcionando</div>
      </div>
    </body>
    </html>
  `);
});

// Rota de teste da API
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Eletromax API funcionando!',
    status: 'online'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Eletromax API rodando na porta ${PORT}`);
});
