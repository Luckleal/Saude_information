// js/lab-extractor.js
// Utilitários do extrator de exames laboratoriais.
// O front-end NÃO chama a OpenAI diretamente. Ele envia o arquivo para um endpoint seguro, como /api/extrair.

export const EXAMES_CONHECIDOS = [
  { key: 'hemoglobina', label: 'Hemoglobina', unit: 'g/dL' },
  { key: 'hematocrito', label: 'Hematócrito', unit: '%' },
  { key: 'hemacias', label: 'Hemácias', unit: 'x10⁶/mm³' },
  { key: 'leucocitos', label: 'Leucócitos', unit: '/mm³' },
  { key: 'plaquetas', label: 'Plaquetas', unit: '/mm³' },
  { key: 'vcm', label: 'VCM', unit: 'fL' },
  { key: 'hcm', label: 'HCM', unit: 'pg' },
  { key: 'chcm', label: 'CHCM', unit: '%' },
  { key: 'rdw', label: 'RDW', unit: '%' },
  { key: 'neutrofilos_pct', label: 'Neutrófilos', unit: '%' },
  { key: 'segmentados_abs', label: 'Segmentados absolutos', unit: '/mm³' },
  { key: 'linfocitos_pct', label: 'Linfócitos', unit: '%' },
  { key: 'linfocitos_abs', label: 'Linfócitos absolutos', unit: '/mm³' },
  { key: 'monocitos_pct', label: 'Monócitos', unit: '%' },
  { key: 'eosinofilos_pct', label: 'Eosinófilos', unit: '%' },
  { key: 'basofilos_pct', label: 'Basófilos', unit: '%' },
  { key: 'creatinina', label: 'Creatinina', unit: 'mg/dL' },
  { key: 'ureia', label: 'Ureia', unit: 'mg/dL' },
  { key: 'pcr', label: 'PCR', unit: 'mg/L' },
  { key: 'glicemia', label: 'Glicemia', unit: 'mg/dL' },
  { key: 'sodio', label: 'Sódio', unit: 'mEq/L' },
  { key: 'potassio', label: 'Potássio', unit: 'mEq/L' },
  { key: 'magnesio', label: 'Magnésio', unit: 'mg/dL' },
  { key: 'fosforo', label: 'Fósforo', unit: 'mg/dL' },
  { key: 'calcio', label: 'Cálcio', unit: 'mg/dL' },
  { key: 'tgo', label: 'TGO / AST', unit: 'U/L' },
  { key: 'tgp', label: 'TGP / ALT', unit: 'U/L' },
  { key: 'ggt', label: 'GGT', unit: 'U/L' },
  { key: 'fosfatase_alcalina', label: 'Fosfatase alcalina', unit: 'U/L' },
  { key: 'bilirrubina_total', label: 'Bilirrubina total', unit: 'mg/dL' },
  { key: 'bilirrubina_direta', label: 'Bilirrubina direta', unit: 'mg/dL' },
  { key: 'bilirrubina_indireta', label: 'Bilirrubina indireta', unit: 'mg/dL' },
  { key: 'albumina', label: 'Albumina', unit: 'g/dL' },
  { key: 'proteinas_totais', label: 'Proteínas totais', unit: 'g/dL' },
  { key: 'lactato', label: 'Lactato', unit: 'mmol/L' },
  { key: 'bnp', label: 'BNP', unit: 'pg/mL' },
  { key: 'dimero_d', label: 'Dímero-D', unit: 'ng/mL' },
  { key: 'troponina', label: 'Troponina', unit: 'ng/mL' },
  { key: 'procalcitonina', label: 'Procalcitonina', unit: 'ng/mL' },
  { key: 'inr', label: 'INR / RNI', unit: '' },
  { key: 'ttpa', label: 'TTPA', unit: 's' },
  { key: 'tap', label: 'TAP', unit: 's' },
  { key: 'fibrinogenio', label: 'Fibrinogênio', unit: 'mg/dL' },
  { key: 'lipase', label: 'Lipase', unit: 'U/L' },
  { key: 'amilase', label: 'Amilase', unit: 'U/L' },
  { key: 'tsh', label: 'TSH', unit: 'mUI/L' },
  { key: 't4_livre', label: 'T4 livre', unit: 'ng/dL' },
  { key: 'hba1c', label: 'Hemoglobina glicada', unit: '%' },
  { key: 'colesterol_total', label: 'Colesterol total', unit: 'mg/dL' },
  { key: 'hdl', label: 'HDL', unit: 'mg/dL' },
  { key: 'ldl', label: 'LDL', unit: 'mg/dL' },
  { key: 'triglicerides', label: 'Triglicerídeos', unit: 'mg/dL' },
  { key: 'acido_urico', label: 'Ácido úrico', unit: 'mg/dL' },
  { key: 'ferritina', label: 'Ferritina', unit: 'ng/mL' },
  { key: 'ferro_serico', label: 'Ferro sérico', unit: 'µg/dL' },
  { key: 'vit_b12', label: 'Vitamina B12', unit: 'pg/mL' },
  { key: 'vit_d', label: 'Vitamina D', unit: 'ng/mL' },
  { key: 'ph', label: 'Gasometria pH', unit: '' },
  { key: 'pco2', label: 'pCO2', unit: 'mmHg' },
  { key: 'po2', label: 'pO2', unit: 'mmHg' },
  { key: 'hco3', label: 'HCO3 / Bicarbonato', unit: 'mEq/L' },
  { key: 'be', label: 'BE', unit: 'mEq/L' },
  { key: 'sato2_gas', label: 'SatO₂ gasometria', unit: '%' },
  { key: 'urina_leucocitos', label: 'Urina — Leucócitos', unit: '/campo' },
  { key: 'urina_hemacias', label: 'Urina — Hemácias', unit: '/campo' },
  { key: 'urina_proteina', label: 'Urina — Proteína', unit: '' },
  { key: 'urina_glicose', label: 'Urina — Glicose', unit: '' },
  { key: 'urina_nitrito', label: 'Urina — Nitrito', unit: '' }
];

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const dataUrl = String(event.target?.result || '');
      resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getMimeType(file) {
  if (file.type) return file.type;
  return file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png';
}

export function resultadosEncontrados(result) {
  const valores = result?.resultados || {};
  return EXAMES_CONHECIDOS.filter(ex => {
    const value = valores[ex.key];
    return value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim().toLowerCase() !== 'null';
  });
}

export function formatExamJson(result) {
  if (!result) return '';

  if (Array.isArray(result.exames)) {
    return result.exames
      .map(item => `${item.nome || item.exame}: ${item.valor || ''} ${item.unidade || ''}${item.referencia ? ` (VR: ${item.referencia})` : ''}`.trim())
      .filter(Boolean)
      .join('\n');
  }

  const encontrados = resultadosEncontrados(result);
  const linhas = [];

  if (result.paciente && String(result.paciente).toLowerCase() !== 'null') {
    linhas.push(`Paciente: ${result.paciente}`);
  }

  if (result.data_coleta && String(result.data_coleta).toLowerCase() !== 'null') {
    linhas.push(`Data de coleta: ${result.data_coleta}`);
  }

  if (linhas.length) linhas.push('');

  encontrados.forEach(ex => {
    linhas.push(`${ex.label}: ${result.resultados[ex.key]}${ex.unit ? ` ${ex.unit}` : ''}`);
  });

  return linhas.length ? linhas.join('\n') : JSON.stringify(result, null, 2);
}

export function renderExamTable(result) {
  const encontrados = resultadosEncontrados(result);
  if (!encontrados.length) {
    return '<div class="ai-empty">Nenhum exame reconhecido pela IA.</div>';
  }

  const header = `
    <div class="ai-result-summary">
      <strong>Extração concluída — ${encontrados.length} exame(s) encontrado(s)</strong>
      ${result.paciente && String(result.paciente).toLowerCase() !== 'null' ? `<span>Paciente: ${escapeHtml(result.paciente)}</span>` : ''}
      ${result.data_coleta && String(result.data_coleta).toLowerCase() !== 'null' ? `<span>Data de coleta: ${escapeHtml(result.data_coleta)}</span>` : ''}
    </div>`;

  const rows = encontrados.map(ex => `
    <tr>
      <td>${escapeHtml(ex.label)}</td>
      <td><strong>${escapeHtml(String(result.resultados[ex.key]))}</strong></td>
      <td>${escapeHtml(ex.unit)}</td>
    </tr>`).join('');

  return `${header}<div class="ai-table-wrap"><table class="ai-result-table"><thead><tr><th>Exame</th><th>Resultado</th><th>Unidade</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
