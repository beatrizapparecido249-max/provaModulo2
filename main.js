import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const form = document.querySelector("#transacao-form");
const lista = document.querySelector("#lista-transacoes");
const saldoTotalEl = document.querySelector("#saldo-total");
const receitasEl = document.querySelector("#total-receitas");
const despesasEl = document.querySelector("#total-despesas");

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
    
    let totalReceitas = 0;
    let totalDespesas = 0;

    snapshot.forEach((doc) => {
      const { descricao, valor, tipo } = doc.data();

      if (tipo === "receita") {
        totalReceitas += valor;
      } else if (tipo === "despesa") {
        totalDespesas += valor;
      }

      const item = document.createElement("li");
      item.classList.add(tipo);
      item.innerHTML = `
        <span>${descricao}</span>
        <strong>${tipo === "despesa" ? "- " : "+ "}R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
      `;
      lista.appendChild(item);
    });

    const saldoTotal = totalReceitas - totalDespesas;

    receitasEl.textContent = `R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    despesasEl.textContent = `R$ ${totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    saldoTotalEl.textContent = `${saldoTotal < 0 ? '-' : ''}R$ ${Math.abs(saldoTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  });
};

form.addEventListener("submit", (evento) => {
  evento.preventDefault();
  
  const descricao = document.querySelector("#descricao").value;
  const valor = document.querySelector("#valor").value;
  const tipo = document.querySelector("#tipo").value;

  salvarTransacao(descricao, valor, tipo);
  form.reset();
});

escutarTransacoes();