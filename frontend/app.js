const API = '/api';

let offers = [];

// ==========================================
// ELEMENTOS DO PAINEL
// ==========================================

const totalEl =
document.getElementById('total');

const mlEl =
document.getElementById('ml');

const shopeeEl =
document.getElementById('shopee');

const publishedEl =
document.getElementById('published');

const offersEl =
document.getElementById('offers');

const offerForm =
document.getElementById('offerForm');

// ==========================================
// FORMATAR PREÇO
// ==========================================

function formatarPreco(valor) {

const numero =
Number(valor) || 0;

return numero.toLocaleString(
'pt-BR',
{
style: 'currency',
currency: 'BRL'
}
);

}

// ==========================================
// ESCAPAR HTML
// ==========================================

function escaparHTML(valor) {

return String(
valor || ''
)
.replace(
/&/g,
'&'
)
.replace(
/</g,
'<'
)
.replace(
/>/g,
'>'
)
.replace(
/"/g,
'"'
)
.replace(
/'/g,
'''
);

}

// ==========================================
// RENDERIZAR DASHBOARD
// ==========================================

function renderDashboard(
ofertas
) {

offers =
Array.isArray(
ofertas
)
? ofertas
: [];

const total =
offers.length;

const mercadoLivre =
offers.filter(
x =>
x.plataforma ===
'Mercado Livre'
).length;

const shopee =
offers.filter(
x =>
x.plataforma ===
'Shopee'
).length;

if (
totalEl
) {

```
totalEl.textContent =
  total;
```

}

if (
mlEl
) {

```
mlEl.textContent =
  mercadoLivre;
```

}

if (
shopeeEl
) {

```
shopeeEl.textContent =
  shopee;
```

}

if (
publishedEl
) {

```
publishedEl.textContent =
  0;
```

}

if (
!offersEl
) {

```
return;
```

}

if (
offers.length ===
0
) {

```
offersEl.innerHTML =
  '<p>Nenhuma oferta cadastrada.</p>';

return;
```

}

offersEl.innerHTML =

```
offers
  .map(

    oferta =>

      `
      <div class="offer">

        <div>

          <b>
            ${escaparHTML(
              oferta.nome
            )}
          </b>

          <br>

          <small>

            ${
              escaparHTML(
                oferta.plataforma
              )
            }

            • 

            ${
              formatarPreco(
                oferta.preco
              )
            }

          </small>

          <br>

          <a
            href="${
              escaparHTML(
                oferta.link
              )
            }"
            target="_blank"
            rel="noopener noreferrer"
          >

            Ver produto

          </a>

        </div>

      </div>
      `

  )
  .join('');
```

}

// ==========================================
// BUSCAR OFERTAS DO BANCO
// ==========================================

async function carregarOfertas() {

try {

```
const resposta =
  await fetch(
    `${API}/ofertas`
  );


const dados =
  await resposta.json();


if (
  !resposta.ok ||
  !dados.success
) {

  throw new Error(

    dados.message ||

    'Erro ao carregar ofertas.'

  );

}


renderDashboard(
  dados.ofertas
);
```

} catch (
erro
) {

```
console.error(
  'ERRO AO CARREGAR OFERTAS:',
  erro
);


if (
  offersEl
) {

  offersEl.innerHTML =

    `
    <p>

      ❌ Erro ao carregar ofertas:
      ${escaparHTML(
        erro.message
      )}

    </p>
    `;

}
```

}

}

// ==========================================
// CADASTRAR PRODUTO MANUALMENTE
// ==========================================

if (
offerForm
) {

offerForm.addEventListener(

```
'submit',

async (
  e
) => {

  e.preventDefault();


  const nome =
    document.getElementById(
      'title'
    )?.value.trim();


  const link =
    document.getElementById(
      'url'
    )?.value.trim();


  const preco =
    document.getElementById(
      'price'
    )?.value.trim();


  const plataforma =
    document.getElementById(
      'source'
    )?.value.trim();


  if (
    !nome ||
    !link ||
    !plataforma
  ) {

    alert(
      'Preencha nome, link e plataforma.'
    );

    return;

  }


  try {

    const resposta =
      await fetch(

        `${API}/produtos`,

        {

          method:
            'POST',

          headers: {

            'Content-Type':
              'application/json'

          },

          body:
            JSON.stringify({

              nome:
                nome,

              preco:
                preco,

              link:
                link,

              plataforma:
                plataforma

            })

        }

      );


    const dados =
      await resposta.json();


    if (
      !resposta.ok ||
      !dados.success
    ) {

      throw new Error(

        dados.message ||

        'Erro ao salvar produto.'

      );

    }


    alert(
      '✅ Produto salvo com sucesso!'
    );


    offerForm.reset();


    await carregarOfertas();


  } catch (
    erro
  ) {

    console.error(
      'ERRO AO CADASTRAR:',
      erro
    );


    alert(

      '❌ ' +

      (
        erro.message ||

        'Erro ao salvar produto.'

      )

    );

  }

}
```

);

}

// ==========================================
// BUSCAR PRODUTOS NO MERCADO LIVRE
// ==========================================

async function buscarMercadoLivre(
busca
) {

if (
!busca
) {

```
alert(
  'Digite o que deseja buscar.'
);

return;
```

}

try {

```
const resposta =
  await fetch(

    `${API}/mercadolivre/buscar-salvar`,

    {

      method:
        'POST',

      headers: {

        'Content-Type':
          'application/json'

      },

      body:
        JSON.stringify({

          q:
            busca,

          limit:
            20

        })

    }

  );


const dados =
  await resposta.json();


if (
  !resposta.ok ||
  !dados.success
) {

  throw new Error(

    dados.message ||

    'Erro ao buscar no Mercado Livre.'

  );

}


alert(

  `✅ Busca concluída!
```

Encontrados: ${
dados.encontrados || 0
}

Novas ofertas: ${
dados.salvos || 0
}

Atualizadas: ${
dados.atualizados || 0
}`

```
);


await carregarOfertas();
```

} catch (
erro
) {

```
console.error(
  'ERRO MERCADO LIVRE:',
  erro
);


alert(

  '❌ ' +

  (
    erro.message ||

    'Erro ao consultar Mercado Livre.'

  )

);
```

}

}

// ==========================================
// BUSCA AUTOMÁTICA
// ==========================================

async function buscarOfertasAutomaticamente() {

try {

```
const resposta =
  await fetch(

    `${API}/ofertas/buscar-automaticamente`,

    {

      method:
        'POST',

      headers: {

        'Content-Type':
          'application/json'

      }

    }

  );


const dados =
  await resposta.json();


if (
  !resposta.ok ||
  !dados.success
) {

  throw new Error(

    dados.message ||

    'Erro na busca automática.'

  );

}


alert(

  `✅ Busca automática concluída!
```

Encontrados: ${
dados.encontrados || 0
}

Aprovados: ${
dados.aprovados || 0
}

Novas ofertas: ${
dados.salvos || 0
}

Atualizadas: ${
dados.atualizados || 0
}`

```
);


await carregarOfertas();
```

} catch (
erro
) {

```
console.error(
  'ERRO BUSCA AUTOMÁTICA:',
  erro
);


alert(

  '❌ ' +

  (
    erro.message ||

    'Erro ao executar busca automática.'

  )

);
```

}

}

// ==========================================
// STATUS MERCADO LIVRE
// ==========================================

async function verificarMercadoLivre() {

try {

```
const resposta =
  await fetch(

    `${API}/mercadolivre/status`

  );


const dados =
  await resposta.json();


console.log(
  'STATUS MERCADO LIVRE:',
  dados
);


return dados;
```

} catch (
erro
) {

```
console.error(

  'ERRO STATUS MERCADO LIVRE:',

  erro

);


return {

  success:
    false,

  conectado:
    false

};
```

}

}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function iniciarPainel() {

console.log(
'⚡ Eletromax V2 iniciando...'
);

const status =
await verificarMercadoLivre();

if (
status.success &&
status.conectado
) {

```
console.log(
  '✅ Mercado Livre conectado.'
);
```

} else {

```
console.warn(
  '⚠️ Mercado Livre não conectado.'
);
```

}

await carregarOfertas();

console.log(
'⚡ Eletromax V2 pronto.'
);

}

// ==========================================
// DISPONIBILIZAR FUNÇÕES PARA O HTML
// ==========================================

window.buscarMercadoLivre =
buscarMercadoLivre;

window.buscarOfertasAutomaticamente =
buscarOfertasAutomaticamente;

window.verificarMercadoLivre =
verificarMercadoLivre;

// ==========================================
// INICIAR
// ==========================================

iniciarPainel();
