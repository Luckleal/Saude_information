# HRPT — Sistema de Enfermaria

Sistema web para gerenciamento de leitos da Clínica Médica do HRPT, refatorado para funcionar com arquivos separados, Firebase Authentication e Firebase Realtime Database.

## Objetivo

Transformar o antigo `index.html` único em uma aplicação web mais organizada, segura e fácil de manter.

## Tecnologias usadas

- HTML5
- CSS3 modularizado
- JavaScript ES Modules
- Firebase Authentication
- Firebase Realtime Database
- GitHub Pages

## Estrutura de pastas

```txt
hrpt-sistema/
├── index.html
├── login.html
├── dashboard.html
├── css/
│   ├── reset.css
│   ├── variables.css
│   ├── login.css
│   ├── dashboard.css
│   └── responsive.css
├── js/
│   ├── firebase-config.js
│   ├── auth.js
│   ├── login.js
│   ├── register.js
│   ├── dashboard.js
│   ├── permissions.js
│   └── utils.js
└── firebase/
    └── realtime-database-rules.json
```

## O que mudou

- Removido login com usuários e senhas fixas no JavaScript.
- Adicionado login com Firebase Authentication.
- Cadastro de usuários liberado apenas para Administrador logado.
- Dados extras de usuários salvos em `usuarios/{uid}`.
- Dados de leitos/pacientes salvos em `hrpt/v2`.
- CSS separado em arquivos próprios.
- JavaScript separado por responsabilidade.
- HTML sem `onclick` inline nos principais fluxos.
- Dashboard protegido: sem login, o usuário volta para `login.html`.
- Permissões centralizadas em `js/permissions.js`.
- Regras do Firebase adicionadas em `firebase/realtime-database-rules.json`.

## Perfis e permissões

### Administrador

Pode:

- cadastrar usuários;
- gerenciar usuários;
- acessar dashboard;
- editar leitos;
- liberar leitos;
- exportar ficha;
- usar calculadora médica.

### Médico

Pode:

- visualizar pacientes;
- editar informações médicas;
- registrar evolução;
- exportar ficha;
- usar calculadora médica.

### Enfermagem

Pode:

- visualizar pacientes;
- atualizar sinais vitais;
- atualizar status do leito;
- não pode excluir registros;
- não pode criar usuários.

## Configuração do Firebase

### 1. Criar projeto

1. Acesse o Firebase Console.
2. Crie um novo projeto.
3. Adicione um app Web.
4. Copie as configurações do Firebase.

### 2. Ativar Authentication

1. Vá em **Authentication**.
2. Clique em **Sign-in method**.
3. Ative **E-mail/senha**.

### 3. Criar o primeiro administrador

A tela de cadastro não é pública. Então o primeiro administrador deve ser criado manualmente:

1. Vá em **Authentication > Users**.
2. Clique em **Add user**.
3. Crie o e-mail e senha do primeiro admin.
4. Copie o UID do usuário criado.
5. Vá no **Realtime Database** e crie:

```json
{
  "usuarios": {
    "UID_DO_ADMIN": {
      "nome": "Administrador HRPT",
      "email": "admin@sistemahrpt.com.br",
      "perfil": "admin",
      "ativo": true,
      "criadoEm": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

### 4. Ativar Realtime Database

1. Vá em **Realtime Database**.
2. Crie o banco.
3. Acesse a aba **Regras**.
4. Cole o conteúdo de `firebase/realtime-database-rules.json`.
5. Publique as regras.

## Observação sobre a configuração pública do Firebase

As chaves do Firebase no front-end não são equivalentes a uma senha secreta de servidor. Elas identificam o projeto para o SDK do Firebase. A segurança real deve estar em:

- Firebase Authentication;
- Regras do Realtime Database;
- controle de perfil no banco;
- não salvar senhas manualmente;
- não deixar `.read: true` e `.write: true` em produção.

## Como rodar localmente

Por usar ES Modules, rode com um servidor local. Exemplos:

```bash
python -m http.server 5500
```

Depois acesse:

```txt
http://localhost:5500/login.html
```

Também é possível usar a extensão **Live Server** no VS Code.

## Como publicar no GitHub Pages

1. Coloque os arquivos na raiz do repositório.
2. Confirme que existe `index.html` na raiz.
3. Faça commit e push:

```bash
git add .
git commit -m "Refatora sistema HRPT com Firebase Auth"
git push
```

4. No GitHub, vá em **Settings > Pages**.
5. Use `main` e `/root`.

## Testes recomendados

1. Testar login com o primeiro administrador.
2. Criar um usuário Médico pelo menu **Usuários**.
3. Criar um usuário Enfermagem pelo menu **Usuários**.
4. Logar como Médico e confirmar que o menu de usuários não aparece.
5. Logar como Enfermagem e confirmar que pode atualizar sinais vitais/status.
6. Abrir o sistema em dois navegadores e editar um leito para validar tempo real.
7. Conferir no Firebase se os dados aparecem em `hrpt/v2`.

## Recomendações finais

- Não use regras abertas em produção.
- Não salve senhas no Realtime Database.
- Use e-mails institucionais sempre que possível.
- Use HTTPS no GitHub Pages ou domínio personalizado.
- Para ambientes reais de saúde, avalie requisitos legais, auditoria, logs, backup, criptografia e controle formal de acesso.

## Atualização v20 — setores e IA

Esta versão mantém a base segura com Firebase Authentication e permissões por perfil, mas recebeu as funcionalidades do `index_real(final).html` de forma organizada:

- Clínica Médica (`cm`), Sala Vermelha (`sv`) e Observação do Pronto Socorro (`ps`).
- Estrutura de dados em `hrpt/v20`:

```json
{
  "hrpt": {
    "v20": {
      "DATA": {
        "cm": {},
        "sv": {},
        "ps": {}
      },
      "MEDICOS": []
    }
  }
}
```

- Cadastro de médicos responsáveis, restrito a administradores.
- Vinculação de médico ao leito.
- Exportação CSV compatível com Excel.
- Modal de importação de exames por IA usando um endpoint seguro.

### IA para leitura de exames

O frontend não guarda chave de IA e não chama provedores diretamente. Para usar IA em produção, crie um backend seguro, por exemplo em Firebase Functions, Cloud Run, Render ou Railway. O endpoint deve receber um arquivo em `multipart/form-data` no campo `file` e retornar JSON ou texto.

Exemplo de retorno aceito:

```json
{
  "exames": [
    { "nome": "Hemoglobina", "valor": "13.2", "unidade": "g/dL", "referencia": "12-16" },
    { "nome": "Creatinina", "valor": "0.9", "unidade": "mg/dL" }
  ]
}
```

No dashboard, abra a ficha do paciente, clique em **Ler exame com IA**, informe o endpoint e envie o PDF/imagem.

### Regras do Firebase

Use o arquivo:

```text
firebase/realtime-database-rules.json
```

Ele já permite `hrpt/v20` e mantém `usuarios/{uid}` protegido por perfil.


## Integração de IA para leitura de exames

Esta versão inclui a integração entre o modal **Ler exame com IA** do dashboard e uma API segura em `api/extrair.js`.

### Arquivos adicionados

```text
api/extrair.js
js/lab-extractor.js
```

- `api/extrair.js`: endpoint serverless para Vercel. Ele recebe `base64` e `mimeType`, chama a Gemini API usando `GEMINI_API_KEY` em variável de ambiente e retorna JSON estruturado.
- `js/lab-extractor.js`: funções do front-end para converter o arquivo em base64, formatar o JSON retornado pela IA, montar tabela e gerar o texto que será inserido em **Exames laboratoriais**.

### Como publicar a API na Vercel

1. Suba o projeto para um repositório GitHub.
2. Importe o repositório na Vercel.
3. Em **Settings > Environment Variables**, crie:

```text
GEMINI_API_KEY=sua_chave_do_gemini
```

4. Faça o deploy.
5. No sistema HRPT, no modal **Ler exame com IA**, use:

```text
/api/extrair
```

se o frontend também estiver na Vercel, ou use a URL completa:

```text
https://seu-projeto.vercel.app/api/extrair
```

se o frontend estiver no GitHub Pages ou Firebase Hosting.

### Segurança

Não coloque chave de IA no JavaScript do navegador. A chave Gemini deve ficar apenas no servidor/Vercel como variável de ambiente. O front-end envia o arquivo para o endpoint seguro, e o endpoint chama a IA.

## Atualização v3 do formulário clínico

Esta versão recebeu os campos do HTML v3 enviados como referência, mas mantendo a arquitetura segura/refatorada:

- MUC / medicações de uso contínuo;
- hipóteses diagnósticas;
- pendências com prazo/status;
- tratamento em curso estruturado;
- especialidades/pareceres;
- exames laboratoriais;
- exames de imagem com anexo de imagens;
- conduta;
- sinais vitais;
- painel lateral mais completo;
- calculadoras adicionais: CKD-EPI, Wells TEP, SOFA e HAS-BLED.

A versão monolítica enviada possuía HTML, CSS, JavaScript e login local no mesmo arquivo. Nesta versão, apenas o layout e os campos foram incorporados. A autenticação continua sendo via Firebase Authentication e as permissões continuam centralizadas no `permissions.js`.
