import { login, redirectIfLoggedIn } from './auth.js';
import { showMessage } from './utils.js';

redirectIfLoggedIn('dashboard.html');

const form = document.getElementById('loginForm');
const message = document.getElementById('loginMessage');
const button = document.getElementById('loginButton');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    showMessage(message, 'Informe e-mail e senha.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'Entrando...';

  try {
    await login(email, password);
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error("Erro completo no login:", error);
    console.error("Código do erro:", error.code);
    console.error("Mensagem:", error.message);

    let mensagem = "Erro ao fazer login.";

    if (error.code === "auth/invalid-credential") {
      mensagem = "E-mail ou senha incorretos.";
    } else if (error.code === "auth/user-not-found") {
      mensagem = "Usuário não encontrado no Firebase Authentication.";
    } else if (error.code === "auth/wrong-password") {
      mensagem = "Senha incorreta.";
    } else if (error.code === "auth/operation-not-allowed") {
      mensagem = "Login por e-mail e senha não está ativado no Firebase.";
    } else if (error.code === "auth/unauthorized-domain") {
      mensagem = "Domínio não autorizado no Firebase Authentication.";
    } else if (error.code === "auth/network-request-failed") {
      mensagem = "Erro de conexão com o Firebase.";
    } else if (error.code === "auth/api-key-not-valid") {
      mensagem = "API Key do Firebase inválida.";
    } else {
      mensagem = `${error.code || "Erro desconhecido"} — ${error.message}`;
    }

    showMessage(message, mensagem, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="ti ti-login"></i> Entrar no sistema';
  }
});
