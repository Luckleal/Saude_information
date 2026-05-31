import { createUserByAdmin } from './auth.js';
import { showMessage } from './utils.js';

export function setupRegisterForm(currentProfile, onCreated) {
  const form = document.getElementById('registerForm');
  const message = document.getElementById('registerMessage');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const nome = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const perfil = document.getElementById('registerRole').value;
    const senha = document.getElementById('registerPassword').value;
    const confirmar = document.getElementById('registerConfirmPassword').value;

    if (!nome || !email || !perfil || !senha || !confirmar) {
      showMessage(message, 'Preencha todos os campos.', 'error');
      return;
    }

    if (senha.length < 6) {
      showMessage(message, 'A senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }

    if (senha !== confirmar) {
      showMessage(message, 'As senhas não conferem.', 'error');
      return;
    }

    try {
      await createUserByAdmin(currentProfile, { nome, email, perfil, senha });
      form.reset();
      showMessage(message, 'Usuário criado com sucesso.', 'success');
      onCreated?.();
    } catch (error) {
      console.error(error);
      showMessage(message, error.message || 'Não foi possível criar o usuário.', 'error');
    }
  });
}
