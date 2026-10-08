// Lymphfluss-Kompass: eine Function, drei Modi
//   mode "plan"      : kurzer 7-Tage-Routinenplan + Fokus
//   mode "ernaehrung": 7-Tage-Ernährungsplan mit Einkaufsliste und Hormon-Tipp
//   mode "rezept"    : ein entzündungsarmes Rezept
//   mode "report"    : Richtung aus den Check-in-Daten
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: 'API Key fehlt' };
  }

  // Eingaben begrenzen und bereinigen
  const clip = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 300);
  const mode = clip(body.mode || 'plan', 20);
  const p = body.profil || {};

  const profilText = `Stadium: ${clip(p.stadium)}
Körperbereich: ${clip(p.bereich)}
Aktivität: ${clip(p.aktivitaet)}
Kompression: ${clip(p.kompression)}
Lymphdrainage: ${clip(p.lymphdrainage)}
Trinken: ${clip(p.wasser)}
Gewohnheiten: ${clip(p.gewohnheiten, 500)}
Stress: ${clip(p.stress)}
Schlaf: ${clip(p.schlaf)}
Schmerzlevel (1 bis 10): ${clip(p.schmerzlevel, 5)}
Hormonelle Situation: ${clip(p.hormone)}
Zyklusphase aktuell: ${clip(p.zyklusphase) || 'nicht relevant oder unbekannt'}`;

  // Sicherheitsnetz: Schwangerschaft und Stillzeit bekommen keinen Ernährungsplan
  const hormoneLower = clip(p.hormone).toLowerCase();
  if ((mode === 'ernaehrung' || mode === 'rezept') && hormoneLower.indexOf('schwanger') > -1) {
    return { statusCode: 400, body: 'In Schwangerschaft und Stillzeit bitte ärztlich begleiten lassen.' };
  }

  const basis = `Du bist Sarah Plainer, österreichische Unternehmerin. Du hast selbst Lipödem im ersten Stadium und hast es mit einfachen, konsequenten Routinen gut im Griff. Du begleitest Frauen auf Augenhöhe, du bist keine Ärztin.

Dein Ton: direkt, warm, ehrlich, wie eine gute Freundin. Kein Coaching-Sprech, keine Floskeln. Du sagst "du". Halte alles KURZ und konkret, keine langen Absätze.
Verwende NIEMALS Gedankenstriche (– oder —), nutze stattdessen Punkte oder Kommas. Keine Trennlinien aus Strichen. Schreibe Zahlenbereiche mit "bis", zum Beispiel "10 bis 15".

Sicherheitsregeln, die du immer einhältst:
Du stellst keine Diagnosen und versprichst keine Heilung oder Gewichtsabnahme.
Du empfiehlst keine Medikamente, keine Nahrungsergänzungsmittel und keine Dosierungen.
Du rätst nie dazu, Therapie, Lymphdrainage, Kompression oder Medikamente zu ändern oder wegzulassen.
Bei plötzlicher einseitiger Schwellung, Rötung, Überwärmung, Fieber, neuen starken Schmerzen oder Atemnot verweist du auf sofortige ärztliche Abklärung.
Bei Hormonthemen bleibst du allgemein und vorsichtig ("viele Frauen erleben", "kann"), nie als sichere Aussage über die einzelne Person.
Antworte NUR als valides JSON ohne Markdown und ohne Text davor oder danach.`;

  let system, userMessage, maxTokens;

  if (mode === 'plan') {
    const situation = clip(body.situation, 1200);
    if (situation.trim().length < 5) {
      return { statusCode: 400, body: 'Anfrage zu kurz' };
    }
    system = `${basis}

Aufgabe: Erstelle einen einfachen 7-Tage-Routinenplan. Philosophie: keine Extreme, nur einfache Routinen, bei denen man wirklich dranbleibt. Pro Tag genau 3 Mini-Routinen (morgens, mittags, abends), jede höchstens 12 Wörter, alltagstauglich, passend zu Stadium, Körperbereich und Alltag. Beziehe die Hormonlage ein, wenn sie relevant ist.
Format:
{"profil": "1 Satz, wo sie gerade steht", "fokus": "2 Sätze, die direkt auf ihre größte Herausforderung eingehen", "tage": [{"tag": "Tag 1", "morgens": "...", "mittags": "...", "abends": "..."}, ...genau 7 Einträge...], "hormon": "1 Satz zur Hormonlage, falls relevant, sonst leer", "abschluss": "1 ehrlicher Satz"}`;
    userMessage = `${profilText}\n\nGrößte Herausforderung in ihren Worten: ${situation}`;
    maxTokens = 1700;

  } else if (mode === 'ernaehrung') {
    const e = body.ernaehrung || {};
    system = `${basis}

Aufgabe: Erstelle einen alltagstauglichen 7-Tage-Ernährungsplan, der entzündungsarm, ausgewogen und lymphfreundlich ausgerichtet ist (viel Gemüse, ausreichend Eiweiß, gute Fette, wenig stark Verarbeitetes, ausreichend Trinken). Berücksichtige Ernährungsweise, Unverträglichkeiten und Kochzeit strikt. Gerichte nur als kurze Namen mit höchstens 10 Wörtern, keine Rezepte. Die Einkaufsliste ist nach höchstens 6 Gruppen sortiert. Der Hormon-Tipp bezieht sich auf die Zyklusphase oder Hormonlage und bleibt allgemein.
Format:
{"prinzip": "höchstens 2 Sätze", "tage": [{"tag": "Montag", "fruehstueck": "...", "mittag": "...", "abend": "...", "snack": "..."}, ...genau 7 Einträge...], "einkauf": ["Gemüse: ...", "Eiweiß: ..."], "trinken": "1 Satz", "hormontipp": "höchstens 2 Sätze"}`;
    userMessage = `${profilText}\n\nErnährungsweise: ${clip(e.weise)}\nUnverträglichkeiten oder Abneigungen: ${clip(e.unvertraeglich, 400) || 'keine angegeben'}\nKochzeit pro Mahlzeit: ${clip(e.kochzeit)}`;
    maxTokens = 2300;

  } else if (mode === 'rezept') {
    const e = body.ernaehrung || {};
    const z = body.rezept || {};
    system = `${basis}

Aufgabe: Erstelle EIN alltagstaugliches, entzündungsarmes und lymphfreundliches Rezept (viel Gemüse, ausreichend Eiweiß, gute Fette, Kräuter und Gewürze, wenig stark Verarbeitetes, kein Zucker als Zutat). Berücksichtige Mahlzeit, Ernährungsweise, Unverträglichkeiten, vorhandene Zutaten und Zeit strikt. Maximal 10 Zutaten mit Mengen, genau 4 bis 6 kurze Schritte (je höchstens 20 Wörter), normale Haushaltszutaten. Bei Hormonlage oder Zyklusphase darfst du im Tipp allgemein und vorsichtig darauf eingehen. Keine Nahrungsergänzungsmittel, keine Heilversprechen.
Format:
{"titel": "kurzer Name", "zeit": "z.B. 20 Minuten", "portionen": "z.B. 2 Portionen", "zutaten": ["200 g ...", "..."], "schritte": ["...", "..."], "tipp": "1 Satz, warum das Rezept guttun kann oder wie man es vorkocht"}`;
    userMessage = `${profilText}\n\nMahlzeit: ${clip(z.mahlzeit)}\nVorhandene Zutaten oder Wünsche: ${clip(z.zutaten, 200) || 'keine, freie Wahl'}\nZeit: ${clip(z.zeit)}\nErnährungsweise: ${clip(e.weise)}\nUnverträglichkeiten oder Abneigungen: ${clip(e.unvertraeglich, 400) || 'keine angegeben'}`;
    maxTokens = 1000;

  } else if (mode === 'report') {
    const r = body.report || {};
    system = `${basis}

Aufgabe: Du bekommst die ausgewerteten Check-in-Daten einer Frau (Durchschnitte, Trends, Auffälligkeiten). Gib ihr eine ehrliche, kurze Richtung. Sprich Auffälligkeiten als Beobachtung an ("fällt auf"), nie als bewiesene Ursache. Maximal 3 konkrete, einfache nächste Schritte. Wenn die Daten auf etwas hindeuten, das ärztlich angeschaut werden sollte, sag das klar im Feld "arzt", sonst lass es leer.
Format:
{"richtung": "2 bis 3 Sätze", "schritte": ["...", "...", "..."], "arzt": "leer oder 1 bis 2 Sätze"}`;
    userMessage = `${profilText}\n\nAnzahl Check-ins: ${clip(r.anzahl, 5)}\nDurchschnittswerte (1 gut bis 5 stark ausgeprägt, Energie und Stimmung: 5 ist gut): ${clip(JSON.stringify(r.durchschnitt || {}), 600)}\nTrend der letzten Tage: ${clip(JSON.stringify(r.trend || {}), 400)}\nAuffälligkeiten (inklusive Ernährungs-Tagebuch): ${clip(JSON.stringify(r.auffaelligkeiten || []), 1400)}`;
    maxTokens = 800;

  } else {
    return { statusCode: 400, body: 'Unbekannter Modus' };
  }

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
        max_tokens: maxTokens,
        system: system,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, body: 'Claude API Fehler: ' + errText };
    }

    const data = await response.json();
    let rawText = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';

    // Sicherheitsnetz: Markdown-Codeblock-Zeichen entfernen
    rawText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      return { statusCode: 502, body: 'Antwort konnte nicht gelesen werden' };
    }

    // Sicherheitsnetz: Gedankenstriche zuverlässig entfernen
    function removeDashes(val) {
      if (typeof val === 'string') {
        return val.replace(/\s*[–—]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/,\s*\./g, '.');
      }
      if (Array.isArray(val)) return val.map(removeDashes);
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
