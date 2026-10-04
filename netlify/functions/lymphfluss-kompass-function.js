exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { stadium, bereich, aktivitaet, kompression, lymphdrainage, wasser, gewohnheiten, zyklus, stress, schlaf, schmerzlevel, situation } = body;

  if (!situation || situation.trim().length < 5) {
    return { statusCode: 400, body: 'Anfrage zu kurz' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: 'API Key fehlt' };
  }

  const systemPrompt = `Du bist Sarah Plainer, österreichische Unternehmerin, die Frauen mit Lipödem auf dem Weg zu einem besseren Körpergefühl begleitet.
Du bekommst strukturierte Angaben zu Stadium, Körperbereich, Aktivität, Kompression, Lymphdrainage, Trinkverhalten, Gewohnheiten, Zyklus, Stress, Schlaf und Schmerzlevel einer Frau, sowie einen Freitext, in dem sie ihre aktuell größte Herausforderung beschreibt.

Dein Ton: direkt, warm, ehrlich, wie eine gute Freundin, die selbst Erfahrung mit dem Thema hat. Kein Coaching-Sprech, keine Floskeln, keine leeren Phrasen wie "Du schaffst das" ohne Substanz. Du sagst "du", nicht "Sie". Verwende NIEMALS Gedankenstriche (– oder —), nutze stattdessen Punkte oder Kommas. Nutze auch KEINE Trennlinien aus mehreren Strichen oder ähnlichen Zeichen.

Erstelle einen vollständigen, individuellen 7-Tage-Lymphfluss-Plan, der wirklich auf die konkreten Angaben eingeht, nicht generisch klingt. Baue ihn so auf:

1. Kurzes Profil (2 bis 3 Sätze): fasse zusammen, wo diese Frau gerade steht, basierend auf Stadium, Bereich und ihrem Freitext.
2. Direkte Antwort auf ihre Herausforderung (3 bis 5 Sätze): gehe konkret auf das ein, was sie im Freitext beschrieben hat, mit echten, umsetzbaren Hinweisen, keine Allgemeinplätze.
3. 7-Tage-Plan: für jeden Tag (Montag bis Sonntag) eine kurze, konkrete Struktur mit Morgens, Mittags und Abends, jeweils 1 bis 2 knappe, machbare Maßnahmen (z.B. Bewegung, Kompression, Hochlagerung, Trinkmenge, Ernährung), passend zu Stadium und Alltag der Frau. Keine langen Erklärungen pro Tag, kurz und präzise.
4. Ernährung und Trinken: 3 bis 4 konkrete Tipps, abgestimmt auf Stadium und Gewohnheiten.
5. Worauf du achten solltest: 3 bis 4 Dinge, die den Lymphfluss aktuell eher bremsen könnten, basierend auf ihren Angaben.
6. Ein ermutigender Abschlusssatz, ehrlich und ohne Floskeln.

Antworte NUR als valides JSON in diesem Format, ohne Markdown, ohne Erklärungen davor oder danach:
{"profil": "...", "antwort": "...", "tage": [{"tag": "Montag", "morgens": "...", "mittags": "...", "abends": "..."}, ...7 Tage...], "ernaehrung": ["...", "..."], "achtgeben": ["...", "..."], "abschluss": "..."}`;

  const userMessage = `Stadium: ${stadium || 'unbekannt'}
Körperbereich: ${bereich || 'unbekannt'}
Aktivität: ${aktivitaet || 'unbekannt'}
Kompression: ${kompression || 'unbekannt'}
Lymphdrainage: ${lymphdrainage || 'unbekannt'}
Trinkverhalten: ${wasser || 'unbekannt'}
Bestehende Gewohnheiten: ${gewohnheiten || 'keine Angabe'}
Zyklus-Zusammenhang: ${zyklus || 'unbekannt'}
Stresslevel: ${stress || 'unbekannt'}
Schlafqualität: ${schlaf || 'unbekannt'}
Schmerzlevel (1 bis 10): ${schmerzlevel || 'unbekannt'}

Größte aktuelle Herausforderung in eigenen Worten: ${situation}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, body: 'Claude API Fehler: ' + errText };
    }

    const data = await response.json();
    let rawText = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';

    // Sicherheitsnetz: Markdown-Codeblock-Zeichen entfernen, falls die KI sie trotz Anweisung mitschickt
    rawText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      result = { profil: '', antwort: rawText, tage: [], ernaehrung: [], achtgeben: [], abschluss: '' };
    }

    // Sicherheitsnetz: Gedankenstriche zuverlässig entfernen, egal was die KI liefert
    function removeDashes(val) {
      if (typeof val === 'string') {
        return val.replace(/\s*[–—]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/,\s*\./g, '.');
      }
      if (Array.isArray(val)) {
        return val.map(removeDashes);
      }
      if (val && typeof val === 'object') {
        const out = {};
        for (const k in val) out[k] = removeDashes(val[k]);
        return out;
      }
      return val;
    }
    result = removeDashes(result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return { statusCode: 500, body: 'Serverfehler: ' + err.message };
  }
};
