export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function setText(element, value) {
  if (element) element.textContent = value ?? '';
}

export function getValue(id) {
  return document.getElementById(id)?.value?.trim() ?? '';
}

export function setValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value ?? '';
}

export function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

export function linesToText(list, key = 'txt') {
  return (list || []).map(item => typeof item === 'string' ? item : item?.[key]).filter(Boolean).join('\n');
}

export function showMessage(element, message, type = 'success') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('error', 'success');
  element.classList.add(type);
}

export function formatDateTime(date = new Date()) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export function toast(message) {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.__hrptToastTimer);
  window.__hrptToastTimer = setTimeout(() => element.classList.remove('show'), 2800);
}

export function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
