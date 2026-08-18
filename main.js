import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Lógica da Intro
window.addEventListener("DOMContentLoaded", () => {
  const introOverlay = document.querySelector("#intro-overlay");
  setTimeout(() => {
    if (introOverlay) {
      introOverlay.classList.add("fade-out");
    }
  }, 3200);
});

// Elementos DOM
const form = document.querySelector("#transacao-form");
const lista = document.querySelector("#lista-transacoes");
const saldoTotalEl = document.querySelector("#saldo-total");
const receitasEl = document.querySelector("#total-receitas");
const despesasEl = document.querySelector("#total-despesas");
const cofreTotalEl = document.querySelector("#total-cofre");
const btnChartTypes = document.querySelectorAll(".btn-chart-type");
const valorInput = document.querySelector("#valor");
const valorCofreInput = document.querySelector("#valor-cofre");
const moedaSelect = document.querySelector("#moeda-select");

const btnDepositarCofre = document.querySelector("#btn-depositar-cofre");
const btnResgatarCofre = document.querySelector("#btn-resgatar-cofre");
const btnExportarPdfGeral = document.querySelector("#btn-exportar-pdf-geral");

let transacoesCache = [];
let saldoCofre = 0;
let chartInstance = null;
let currentChartType = 'bar';

const taxasCambio = {
  BRL: { taxa: 1.0, simbolo: "R$", locale: "pt-BR" },
  USD: { taxa: 0.20, simbolo: "$", locale: "en-US" },
  EUR: { taxa: 0.18, simbolo: "€", locale: "de-DE" },
  GBP: { taxa: 0.16, simbolo: "£", locale: "en-GB" }
};

let moedaAtual = 'BRL';
const ctx = document.getElementById('graficoFinanceiro').getContext('2d');

// --- MÁSCARA MONETÁRIA AUTOMÁTICA ---
const aplicarMascaraMonetaria = (inputElement) => {
  inputElement.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    if (!value) {
      e.target.value = "";
      return;
    }
    const valorNumerico = parseFloat(value) / 100;
    e.target.value = valorNumerico.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  });
};

aplicarMascaraMonetaria(valorInput);
aplicarMascaraMonetaria(valorCofreInput);

const obterValorNumerico = (inputElement) => {
  const value = inputElement.value.replace(/\D/g, "");
  return value ? parseFloat(value) / 100 : 0;
};

const formatarMoeda = (valorEmBRL) => {
  const config = taxasCambio[moedaAtual];
  const valorConvertido = valorEmBRL * config.taxa;
  return valorConvertido.toLocaleString(config.locale, {
    style: "currency",
    currency: moedaAtual
  });
};

// --- GESTÃO DO COFRE (FIRESTORE) ---
const escutarCofre = () => {
  onSnapshot(doc(db, "cofre", "principal"), (docSnap) => {
    if (docSnap.exists()) {
      saldoCofre = docSnap.data().valor || 0;
    } else {
      saldoCofre = 0;
    }
    atualizarInterface();
  });
};

const atualizarCofreBD = async (novoValor) => {
  try {
    await setDoc(doc(db, "cofre", "principal"), { valor: novoValor });
  } catch (erro) {
    console.error("Erro ao atualizar cofre: ", erro);
  }
};

btnDepositarCofre.addEventListener("click", async () => {
  const valorOperacao = obterValorNumerico(valorCofreInput);
  if (valorOperacao <= 0) return;

  const totalReceitas = transacoesCache.filter(t => t.tipo === 'receita').reduce((a, b) => a + b.valor, 0);
  const totalDespesas = transacoesCache.filter(t => t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);
  const saldoDisponivelAtual = totalReceitas - totalDespesas - saldoCofre;

  if (valorOperacao > saldoDisponivelAtual) {
    alert("Saldo disponível insuficiente para guardar no cofre!");
    return;
  }

  await atualizarCofreBD(saldoCofre + valorOperacao);
  await salvarTransacao("Guardo no Cofre", valorOperacao, "cofre-deposito");
  valorCofreInput.value = "";
});

btnResgatarCofre.addEventListener("click", async () => {
  const valorOperacao = obterValorNumerico(valorCofreInput);
  if (valorOperacao <= 0) return;

  if (valorOperacao > saldoCofre) {
    alert("Valor solicitado é maior do que o total presente no cofre!");
    return;
  }

  await atualizarCofreBD(saldoCofre - valorOperacao);
  await salvarTransacao("Resgate do Cofre", valorOperacao, "cofre-resgate");
  valorCofreInput.value = "";
});

// --- EXCLUIR TRANSAÇÃO DO FIRESTORE ---
const deletarTransacao = async (id) => {
  try {
    if (confirm("Tem certeza que deseja excluir este lançamento?")) {
      await deleteDoc(doc(db, "transacoes", id));
    }
  } catch (erro) {
    console.error("Erro ao deletar transação: ", erro);
  }
};

window.deletarTransacao = deletarTransacao;

// --- RENDERIZAÇÃO DE GRÁFICOS ---
const renderizarGrafico = () => {
  if (chartInstance) {
    chartInstance.destroy();
  }

  const gradienteDourado = ctx.createLinearGradient(0, 0, 0, 300);
  gradienteDourado.addColorStop(0, 'rgba(255, 215, 0, 0.85)');
  gradienteDourado.addColorStop(1, 'rgba(255, 215, 0, 0.05)');

  const gradienteBranco = ctx.createLinearGradient(0, 0, 0, 300);
  gradienteBranco.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  gradienteBranco.addColorStop(1, 'rgba(255, 255, 255, 0.05)');

  const gradienteCiano = ctx.createLinearGradient(0, 0, 0, 300);
  gradienteCiano.addColorStop(0, 'rgba(0, 240, 255, 0.85)');
  gradienteCiano.addColorStop(1, 'rgba(0, 240, 255, 0.05)');

  let config = {};
  const { taxa } = taxasCambio[moedaAtual];

  if (currentChartType === 'doughnut') {
    let totalReceitas = transacoesCache.filter(t => t.tipo === 'receita').reduce((a, b) => a + b.valor, 0);
    let totalDespesas = transacoesCache.filter(t => t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);

    config = {
      type: 'doughnut',
      data: {
        labels: ['Receitas / Depósitos', 'Despesas'],
        datasets: [{
          data: [totalReceitas * taxa, totalDespesas * taxa],
          backgroundColor: ['#ffd700', '#ffffff'],
          borderColor: ['rgba(255,215,0,0.5)', 'rgba(255,255,255,0.5)'],
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#ffffff', font: { family: 'Inter', size: 12, weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatarMoeda(ctx.raw / taxa)}`
            }
          }
        }
      }
    };
  } else if (currentChartType === 'line') {
    const labels = transacoesCache.map((_, i) => `Lançamento ${i + 1}`);
    let saldoAcumulado = 0;

    const dadosSaldo = transacoesCache.map(t => {
      saldoAcumulado += (t.tipo === 'receita' ? t.valor : (t.tipo === 'despesa' ? -t.valor : 0));
      return saldoAcumulado * taxa;
    });

    config = {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['Sem dados'],
        datasets: [{
          label: `Saldo Evolutivo (${taxasCambio[moedaAtual].simbolo})`,
          data: dadosSaldo.length ? dadosSaldo : [0],
          fill: true,
          backgroundColor: gradienteCiano,
          borderColor: '#00f0ff',
          borderWidth: 3,
          tension: 0.35,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#00f0ff',
          pointRadius: 5,
          pointHoverRadius: 8
        }]
      },
      options: getCommonOptions()
    };
  } else {
    let totalReceitas = transacoesCache.filter(t => t.tipo === 'receita').reduce((a, b) => a + b.valor, 0);
    let totalDespesas = transacoesCache.filter(t => t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);

    config = {
      type: 'bar',
      data: {
        labels: ['Receitas / Depósitos', 'Despesas'],
        datasets: [{
          label: `Total (${taxasCambio[moedaAtual].simbolo})`,
          data: [totalReceitas * taxa, totalDespesas * taxa],
          backgroundColor: [gradienteDourado, gradienteBranco],
          borderColor: ['#ffd700', '#ffffff'],
          borderWidth: 2,
          borderRadius: 10,
          borderSkipped: false
        }]
      },
      options: getCommonOptions()
    };
  }

  chartInstance = new Chart(ctx, config);
};

function getCommonOptions() {
  const { simbolo, taxa } = taxasCambio[moedaAtual];
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(2, 6, 18, 0.95)',
        titleColor: '#00f0ff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context) => ` Total: ${formatarMoeda(context.raw / taxa)}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: '#ffffff',
          callback: (v) => `${simbolo} ${v.toLocaleString('pt-BR')}`
        },
        grid: { color: 'rgba(255, 255, 255, 0.08)' }
      },
      x: {
        ticks: { color: '#ffffff', font: { weight: '600' } },
        grid: { display: false }
      }
    }
  };
}

// --- ATUALIZAÇÃO DA INTERFACE ---
const atualizarInterface = () => {
  lista.innerHTML = "";
  let totalReceitas = 0;
  let totalDespesas = 0;

  transacoesCache.forEach((data) => {
    if (data.tipo === "receita") {
      totalReceitas += data.valor;
    } else if (data.tipo === "despesa") {
      totalDespesas += data.valor;
    }

    const item = document.createElement("li");
    item.classList.add(data.tipo);

    let sinal = "+ ";
    if (data.tipo === "despesa") sinal = "- ";
    if (data.tipo === "cofre-deposito") sinal = "🔒 ";
    if (data.tipo === "cofre-resgate") sinal = "🔓 ";

    item.innerHTML = `
      <div class="item-info">
        <span>${data.descricao}</span>
        <strong>${sinal}${formatarMoeda(data.valor)}</strong>
      </div>
      <button class="btn-deletar" onclick="deletarTransacao('${data.id}')" title="Excluir">🗑️</button>
    `;
    lista.appendChild(item);
  });

  const saldoDisponivel = totalReceitas - totalDespesas - saldoCofre;

  receitasEl.textContent = formatarMoeda(totalReceitas);
  despesasEl.textContent = formatarMoeda(totalDespesas);
  cofreTotalEl.textContent = formatarMoeda(saldoCofre);
  
  const saldoAbsolutoFormatted = formatarMoeda(Math.abs(saldoDisponivel));
  saldoTotalEl.textContent = `${saldoDisponivel < 0 ? '-' : ''}${saldoAbsolutoFormatted}`;

  renderizarGrafico();
};

// --- GERAÇÃO DE RELATÓRIO PDF ---
btnExportarPdfGeral.addEventListener("click", () => {
  const pdfTemplate = document.querySelector("#pdf-template-tabela");
  const tabelaCorpo = document.querySelector("#pdf-tabela-corpo");
  
  document.querySelector("#pdf-data-geracao").textContent = `Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`;

  let totalReceitas = transacoesCache.filter(t => t.tipo === 'receita').reduce((a, b) => a + b.valor, 0);
  let totalDespesas = transacoesCache.filter(t => t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);
  let saldoLivre = totalReceitas - totalDespesas - saldoCofre;

  document.querySelector("#pdf-total-receitas").textContent = formatarMoeda(totalReceitas);
  document.querySelector("#pdf-total-despesas").textContent = formatarMoeda(totalDespesas);
  document.querySelector("#pdf-total-cofre").textContent = formatarMoeda(saldoCofre);
  document.querySelector("#pdf-saldo-livre").textContent = formatarMoeda(saldoLivre);

  tabelaCorpo.innerHTML = "";
  transacoesCache.forEach((item, index) => {
    let tipoTexto = "";
    let classeTag = "";
    let sinal = "";

    if (item.tipo === "receita") {
      tipoTexto = "Entrada (+)";
      classeTag = "pdf-tag-receita";
      sinal = "+ ";
    } else if (item.tipo === "despesa") {
      tipoTexto = "Saída (-)";
      classeTag = "pdf-tag-despesa";
      sinal = "- ";
    } else if (item.tipo === "cofre-deposito") {
      tipoTexto = "Cofre (Depósito)";
      classeTag = "pdf-tag-cofre-in";
      sinal = "🔒 ";
    } else if (item.tipo === "cofre-resgate") {
      tipoTexto = "Cofre (Resgate)";
      classeTag = "pdf-tag-cofre-out";
      sinal = "🔓 ";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.descricao}</td>
      <td class="${classeTag}">${tipoTexto}</td>
      <td><strong>${sinal}${formatarMoeda(item.valor)}</strong></td>
    `;
    tabelaCorpo.appendChild(tr);
  });

  pdfTemplate.style.display = "block";

  const opt = {
    margin: 10,
    filename: `Relatorio_Financeiro_${new Date().toISOString().slice(0, 10)}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(pdfTemplate).save().then(() => {
    pdfTemplate.style.display = "none";
  });
});

// --- FIRESTORE TRANSAÇÕES ---
const salvarTransacao = async (descricao, valor, tipo) => {
  try {
    await addDoc(collection(db, "transacoes"), {
      descricao,
      valor: parseFloat(valor),
      tipo,
      criadoEm: new Date()
    });
  } catch (erro) {
    console.error("Erro ao salvar no Firestore: ", erro);
  }
};

const escutarTransacoes = () => {
  onSnapshot(collection(db, "transacoes"), (snapshot) => {
    transacoesCache = [];
    snapshot.forEach((docSnap) => {
      transacoesCache.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    atualizarInterface();
  });
};

// Eventos e Controles
moedaSelect.addEventListener("change", (e) => {
  moedaAtual = e.target.value;
  atualizarInterface();
});

btnChartTypes.forEach(btn => {
  btn.addEventListener('click', (e) => {
    btnChartTypes.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentChartType = e.target.getAttribute('data-type');
    renderizarGrafico();
  });
});

form.addEventListener("submit", (evento) => {
  evento.preventDefault();
  
  const descricao = document.querySelector("#descricao").value;
  const valor = obterValorNumerico(valorInput);
  const tipo = document.querySelector("#tipo").value;

  if (valor <= 0) return;

  salvarTransacao(descricao, valor, tipo);
  form.reset();
});

// Inicialização
escutarTransacoes();
escutarCofre();