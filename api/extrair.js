// api/extrair.js
// API segura para Vercel usando Gemini API.
// Configure GEMINI_API_KEY em Project > Settings > Environment Variables.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { base64, mimeType } = req.body;

    if (!base64 || !mimeType) {
      return res.status(400).json({
        error: "base64 e mimeType são obrigatórios."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY não configurada na Vercel."
      });
    }

    const prompt = `Você é um sistema especialista em leitura de exames laboratoriais brasileiros.

Analise o documento enviado e extraia TODOS os resultados laboratoriais encontrados.

REGRAS OBRIGATÓRIAS:
- Retorne SOMENTE os valores do resultado do paciente.
- IGNORE completamente os valores de referência.
- Se houver mais de uma coleta, use APENAS a MAIS RECENTE.
- Use vírgula como separador decimal. Exemplo: 13,5
- Retorne APENAS JSON válido, sem texto antes ou depois.
- Para campos não encontrados, use null, sem aspas.

Formato obrigatório:
{
  "paciente": "NOME COMPLETO OU null",
  "data_coleta": "DD/MM/AAAA OU null",
  "resultados": {
    "hemoglobina": null,
    "hematocrito": null,
    "hemacias": null,
    "leucocitos": null,
    "plaquetas": null,
    "vcm": null,
    "hcm": null,
    "chcm": null,
    "rdw": null,
    "neutrofilos_pct": null,
    "segmentados_abs": null,
    "linfocitos_pct": null,
    "linfocitos_abs": null,
    "monocitos_pct": null,
    "eosinofilos_pct": null,
    "basofilos_pct": null,
    "creatinina": null,
    "ureia": null,
    "pcr": null,
    "glicemia": null,
    "sodio": null,
    "potassio": null,
    "magnesio": null,
    "fosforo": null,
    "calcio": null,
    "tgo": null,
    "tgp": null,
    "ggt": null,
    "fosfatase_alcalina": null,
    "bilirrubina_total": null,
    "bilirrubina_direta": null,
    "bilirrubina_indireta": null,
    "albumina": null,
    "proteinas_totais": null,
    "lactato": null,
    "bnp": null,
    "dimero_d": null,
    "troponina": null,
    "procalcitonina": null,
    "inr": null,
    "ttpa": null,
    "tap": null,
    "fibrinogenio": null,
    "lipase": null,
    "amilase": null,
    "tsh": null,
    "t4_livre": null,
    "hba1c": null,
    "colesterol_total": null,
    "hdl": null,
    "ldl": null,
    "triglicerides": null,
    "acido_urico": null,
    "ferritina": null,
    "ferro_serico": null,
    "vit_b12": null,
    "vit_d": null,
    "ph": null,
    "pco2": null,
    "po2": null,
    "hco3": null,
    "be": null,
    "sato2_gas": null,
    "urina_leucocitos": null,
    "urina_hemacias": null,
    "urina_proteina": null,
    "urina_glicose": null,
    "urina_nitrito": null
  }
}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return res.status(500).json({
        error: `Gemini retornou erro ${response.status}: ${errBody.error?.message || "erro desconhecido"
          }`
      });
    }

    const data = await response.json();

    const texto =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    if (!texto) {
      return res.status(500).json({
        error: "Resposta vazia do Gemini."
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(texto);
    } catch {
      const jsonMatch = texto.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return res.status(500).json({
          error: "O Gemini não retornou JSON válido.",
          raw: texto.substring(0, 500)
        });
      }

      parsed = JSON.parse(jsonMatch[0]);
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("Erro no handler Gemini:", e);
    return res.status(500).json({
      error: e.message
    });
  }
}