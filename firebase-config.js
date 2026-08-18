import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAxI2FX4YcHGn4SjtFtUsBgSKgnB2b3bIk",
  authDomain: "provamodulo2-760ab.firebaseapp.com",
  projectId: "provamodulo2-760ab",
  storageBucket: "provamodulo2-760ab.firebasestorage.app",
  messagingSenderId: "1077041328946",
  appId: "1:1077041328946:web:d55a2e7579cfdb9b3b1d2b"
};

// Inicialização
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);