import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const form = document.querySelector("#transacao-form");
const lista = document.querySelector("#lista-transacoes");
const saldoTotalEl = document.querySelector("#saldo-total");
const receitasEl = document.querySelector("#total-receitas");
const despesasEl = document.querySelector("#total-despesas");
const btnChartTypes = document.querySelectorAll(".btn-chart-type");

let transacoesCache = [];
let chartInstance = null;
let currentChartType = 'bar';

const ctx = document.getElementById('graficoFinanceiro').getContext('2d');

// Função para criar/atualizar o gráfico analítico
const renderizarGrafico = () => {
  if (chartInstance) {
    chartInstance.destroy();
  }

  // Gradientes
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

  if (currentChartType === 'doughnut') {
    let totalReceitas = transacoesCache.filter(t => t.tipo === 'receita').reduce((a, b) => a + b.valor, 0);
    let totalDespesas = transacoesCache.filter(t => t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);

    config = {
      type: 'doughnut',
      data: {
        labels: ['Receitas / Depósitos', 'Despesas'],
        datasets: [{
          data: [totalReceitas, totalDespesas],
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
              label: (ctx) => ` ${ctx.label}: R$ ${ctx.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            }
          }
        }
      }
    };
  } else if (currentChartType === 'line') {
    // Agrupar transações por descrição/ordem de criação para gerar linha do tempo
    const labels = transacoesCache.map((_, i) => `Lançamento ${i + 1}`);
    let saldoAcumulado = 0;
    const dadosSaldo = transacoesCache.map(t => {
      saldoAcumulado += (t.tipo === 'receita' ? t.valor : -t.valor);
      return saldoAcumulado;
    });

    config = {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['Sem dados'],
        datasets: [{
          label: 'Saldo Evolutivo (R$)',
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
    // Modo Padrão: Barras Comparativas
    let totalReceitas = transacoesCache.filter(t => t.tipo === 'receita').reduce((a, b) => a + b.valor, 0);
    let totalDespesas = transacoesCache.filter(t => t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);

    config = {
      type: 'bar',
      data: {
        labels: ['Receitas / Depósitos', 'Despesas'],
        datasets: [{
          label: 'Total (R$)',
          data: [totalReceitas, totalDespesas],
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
          label: (context) => ` Total: R$ ${context.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: '#ffffff',
          callback: (v) => 'R$ ' + v.toLocaleString('pt-BR')
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
    lista.innerHTML = "";
    transacoesCache = [];
    
    let totalReceitas = 0;
    let totalDespesas = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      transacoesCache.push(data);

      if (data.tipo === "receita") {
        totalReceitas += data.valor;
      } else if (data.tipo === "despesa") {
        totalDespesas += data.valor;
      }

      const item = document.createElement("li");
      item.classList.add(data.tipo);
      item.innerHTML = `
        <span>${data.descricao}</span>
        <strong>${data.tipo === "despesa" ? "- " : "+ "}R$ ${data.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      `;
      lista.appendChild(item);
    });

    const saldoTotal = totalReceitas - totalDespesas;

    receitasEl.textContent = `R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    despesasEl.textContent = `R$ ${totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    saldoTotalEl.textContent = `${saldoTotal < 0 ? '-' : ''}R$ ${Math.abs(saldoTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    renderizarGrafico();
  });
};

// Alternância entre os tipos de gráfico
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
  const valor = document.querySelector("#valor").value;
  const tipo = document.querySelector("#tipo").value;

  salvarTransacao(descricao, valor, tipo);
  form.reset();
});

escutarTransacoes();