const API = '/api';

let offers = [];

// ==========================================
// ELEMENTOS DO PAINEL
// ==========================================

const totalEl = document.getElementById('total');
const mlEl = document.getElementById('ml');
const shopeeEl = document.getElementById('shopee');
const publishedEl = document.getElementById('published');
const offersEl = document.getElementById('offers');
const offerForm = document.getElementById('offerForm');

// ==========================================
// FORMATAR PREÇO
// ==========================================

function formatarPreco(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return 'Preço não informado';
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return String(valor);
  }

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

// ==========================================
// ESCAPAR HTML
// ==========================================

function escaparHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// RENDERIZAR DASHBOARD
// ==========================================

function renderDashboard(ofertas) {
  offers = Array.isArray(ofertas)
    ? ofertas
    : [];

  const total = offers.length;

  const mercadoLivre = offers.filter(
    oferta =>
      String(oferta.plataforma || '').toLowerCase() ===
      'mercado livre'
  ).length;

  const shopee = offers.filter(
    oferta =>
      String(oferta.plataforma || '').toLowerCase() ===
      'shopee'
  ).length;

  if (totalEl) {
    totalEl.textContent = total;
  }

  if (mlEl) {
    mlEl.textContent = mercadoLivre;
  }

  if (shopeeEl) {
    shopeeEl.textContent = shopee;
  }

  if (publishedEl) {
    publishedEl.textContent = 0;
  }

  if (!offersEl) {
    return;
  }

  if (offers.length === 0) {
    offersEl.innerHTML = `
      <p>
        Nenhuma oferta cadastrada.
      </p>
    `;

    return;
  }

  offersEl.innerHTML = offers
    .map(oferta => {
      const imagem = oferta.imagem
        ? `
          <img
            src="${escaparHTML(oferta.imagem)}"
            alt="${escaparHTML(oferta.nome)}"
            style="
              width:80px;
              height:80px;
              object-fit:contain;
              border-radius:8px;
            "
            onerror="this.style.display='none'"
          >
        `
        : '';

      return `
        <div class="offer">

          ${imagem}

          <div>

            <b>
              ${escaparHTML(
                oferta.nome || 'Produto'
              )}
            </b>

            <br>

            <small>
              ${escaparHTML(
                oferta.plataforma || ''
              )}
              •
              ${formatarPreco(
                oferta.preco
              )}
            </small>

            <br>

            ${
              oferta.categoria
                ? `
                  <small>
                    🏷️ ${escaparHTML(
                      oferta.categoria
                    )}
                  </small>
                  <br>
                `
                : ''
            }

            ${
              oferta.pontuacao !== undefined
                ? `
                  <small>
                    ⭐ Pontuação:
                    ${escaparHTML(
                      oferta.pontuacao
                    )}
                  </small>
                  <br>
                `
                : ''
            }

            ${
              oferta.vendas !== undefined
                ? `
                  <small>
                    🛒 Vendas:
                    ${escaparHTML(
                      oferta.vendas
                    )}
                  </small>
                  <br>
                `
                : ''
            }

            <a
              href="${escaparHTML(
                oferta.link || '#'
              )}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver produto
            </a>

          </div>

        </div>
      `;
    })
    .join('');
}

// ==========================================
// BUSCAR OFERTAS DO BANCO
// ==========================================

async function carregarOfertas() {
  try {
    const resposta = await fetch(
      `${API}/ofertas`
    );

    const dados = await resposta
      .json()
      .catch(() => ({}));

    if (
      !resposta.ok ||
      !dados.success
    ) {
      throw new Error(
        dados.message ||
        `Erro ao carregar ofertas. HTTP ${resposta.status}`
      );
    }

    renderDashboard(
      dados.ofertas
    );

    return dados.ofertas;

  } catch (erro) {
    console.error(
      'ERRO AO CARREGAR OFERTAS:',
      erro
    );

    if (offersEl) {
      offersEl.innerHTML = `
        <p>
          ❌ Erro ao carregar ofertas:
          ${escaparHTML(
            erro.message
          )}
        </p>
      `;
    }

    return [];
  }
}

// ==========================================
// CADASTRAR PRODUTO MANUALMENTE
// ==========================================

if (offerForm) {
  offerForm.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

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
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body: JSON.stringify({
                nome,
                preco,
                link,
                plataforma
              })
            }
          );

        const dados =
          await resposta
            .json()
            .catch(() => ({}));

        if (
          !resposta.ok ||
          !dados.success
        ) {
          throw new Error(
            dados.message ||
            `Erro ao salvar produto. HTTP ${resposta.status}`
          );
        }

        alert(
          '✅ Produto salvo com sucesso!'
        );

        offerForm.reset();

        await carregarOfertas();

      } catch (erro) {
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
  );
}

// ==========================================
// BUSCAR PRODUTOS NO MERCADO LIVRE
// ==========================================

async function buscarMercadoLivre(
  busca
) {
  const termo =
    String(
      busca || ''
    ).trim();

  if (!termo) {
    alert(
      'Digite o que deseja buscar.'
    );

    return;
  }

  try {
    console.log(
      '🔎 Buscando Mercado Livre:',
      termo
    );

    const resposta =
      await fetch(
        `${API}/mercadolivre/buscar-salvar`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            q: termo,
            limit: 20
          })
        }
      );

    const dados =
      await resposta
        .json()
        .catch(() => ({}));

    if (
      !resposta.ok ||
      !dados.success
    ) {
      throw new Error(
        dados.message ||
        `Erro ao buscar no Mercado Livre. HTTP ${resposta.status}`
      );
    }

    alert(
      `✅ Busca concluída!

Encontrados: ${
        dados.encontrados || 0
      }

Novas ofertas: ${
        dados.salvos || 0
      }

Atualizadas: ${
        dados.atualizados || 0
      }`
    );

    await carregarOfertas();

    return dados;

  } catch (erro) {
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

    return {
      success: false,
      message: erro.message
    };
  }
}

// ==========================================
// BUSCA AUTOMÁTICA
// ==========================================

async function buscarOfertasAutomaticamente() {
  try {
    console.log(
      '⚡ Iniciando busca automática...'
    );

    const resposta =
      await fetch(
        `${API}/ofertas/buscar-automaticamente`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          }
        }
      );

    const dados =
      await resposta
        .json()
        .catch(() => ({}));

    if (
      !resposta.ok ||
      !dados.success
    ) {
      throw new Error(
        dados.message ||
        `Erro na busca automática. HTTP ${resposta.status}`
      );
    }

    alert(
      `✅ Busca automática concluída!

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
    );

    await carregarOfertas();

    return dados;

  } catch (erro) {
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

    return {
      success: false,
      message: erro.message
    };
  }
}

// ==========================================
// VERIFICAR STATUS DO MERCADO LIVRE
// ==========================================

async function verificarMercadoLivre() {
  try {
    const resposta =
      await fetch(
        `${API}/mercadolivre/status`
      );

    const dados =
      await resposta
        .json()
        .catch(() => ({}));

    console.log(
      'STATUS MERCADO LIVRE:',
      dados
    );

    return dados;

  } catch (erro) {
    console.error(
      'ERRO STATUS MERCADO LIVRE:',
      erro
    );

    return {
      success: false,
      conectado: false,
      message:
        erro.message
    };
  }
}

// ==========================================
// VERIFICAR STATUS GERAL DA API
// ==========================================

async function verificarAPI() {
  try {
    const resposta =
      await fetch(
        `${API}/status`
      );

    const dados =
      await resposta
        .json()
        .catch(() => ({}));

    console.log(
      'STATUS API:',
      dados
    );

    return dados;

  } catch (erro) {
    console.error(
      'ERRO STATUS API:',
      erro
    );

    return {
      success: false,
      status: 'offline'
    };
  }
}

// ==========================================
// CARREGAR DASHBOARD REAL
// ==========================================

async function carregarDashboard() {
  try {
    const resposta =
      await fetch(
        `${API}/dashboard`
      );

    const dados =
      await resposta
        .json()
        .catch(() => ({}));

    if (
      !resposta.ok ||
      !dados.success
    ) {
      throw new Error(
        dados.message ||
        'Erro ao carregar dashboard.'
      );
    }

    if (totalEl) {
      totalEl.textContent =
        dados.totalOfertas || 0;
    }

    if (mlEl) {
      mlEl.textContent =
        dados.totalMercadoLivre || 0;
    }

    if (shopeeEl) {
      shopeeEl.textContent =
        dados.totalShopee || 0;
    }

    return dados;

  } catch (erro) {
    console.error(
      'ERRO DASHBOARD:',
      erro
    );

    return null;
  }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function iniciarPainel() {
  console.log(
    '================================='
  );

  console.log(
    '⚡ ELETROMAX V2 INICIANDO...'
  );

  console.log(
    '================================='
  );

  const statusAPI =
    await verificarAPI();

  if (
    statusAPI.success
  ) {
    console.log(
      '✅ API Eletromax funcionando.'
    );
  } else {
    console.warn(
      '⚠️ API Eletromax não respondeu corretamente.'
    );
  }

  const statusML =
    await verificarMercadoLivre();

  if (
    statusML.success &&
    statusML.conectado
  ) {
    console.log(
      '✅ Mercado Livre conectado.'
    );
  } else {
    console.warn(
      '⚠️ Mercado Livre não conectado.'
    );
  }

  await carregarDashboard();

  await carregarOfertas();

  console.log(
    '================================='
  );

  console.log(
    '⚡ ELETROMAX V2 PRONTO.'
  );

  console.log(
    '================================='
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

window.verificarAPI =
  verificarAPI;

window.carregarOfertas =
  carregarOfertas;

window.carregarDashboard =
  carregarDashboard;

// ==========================================
// INICIAR
// ==========================================

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    iniciarPainel
  );
} else {
  iniciarPainel();
}
