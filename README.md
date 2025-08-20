# SAICAS — Calcolo Preventivo da PDF (Netlify + AI)

Questa repo contiene:
- `web/` → frontend statico (HTML/CSS/JS) con estrazione PDF via PDF.js
- `netlify/functions/calc-quote.js` → Function serverless che chiama l'AI (OpenAI) per estrarre i dati e calcolare il preventivo
- `netlify.toml` → configura cartelle publish e functions

## Deploy rapido su Netlify (iPhone-friendly)
1) Vai su **Netlify → Add new site → Import from Git** e collega un repository GitHub nuovo con questi file.
   In alternativa usa **Netlify Drop** da browser desktop e poi **Site settings → Build & deploy → Functions** per attivarle.
2) In **Site settings → Environment variables** aggiungi:
   - `OPENAI_API_KEY` = la tua chiave
   - (opzionale) `OPENAI_MODEL` = `gpt-4o-mini`
3) **Deploy**. L'app sarà raggiungibile all'URL del sito Netlify. Carica un PDF e premi **Analizza PDF** poi **Calcola**.

### Note
- Tutta l’estrazione del testo dal PDF avviene **nel browser**. Al server inviamo solo il testo estratto + parametri.
- Nessun file viene salvato lato server. La function torna un JSON con i dettagli e i totali.
- Puoi modificare prezzi e regole nel file `netlify/functions/calc-quote.js` (sezione `compute()`).
