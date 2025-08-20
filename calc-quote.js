// netlify/functions/calc-quote.js
// Serverless function: receives { pdfText, params }, calls OpenAI to extract structured data, computes quote.
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function sanitizeNumber(x){
  if(typeof x === "number" && isFinite(x)) return x;
  if(typeof x === "string"){
    const s = x.replace(',', '.').replace(/[^0-9\.\-]/g,'');
    const n = parseFloat(s);
    if(!isNaN(n)) return n;
  }
  return null;
}

function densities(material){
  const m = (material || "").toLowerCase();
  if(m.includes("aisi") || m.includes("inox")) return 7.9; // g/cm3
  if(m.includes("s235") || m.includes("ferro") || m.includes("acciaio")) return 7.85;
  if(m.includes("allumin")) return 2.7;
  return 7.85;
}

function compute(params, det){
  const hourlyRate = params.hourlyRate || 42;
  const pricePerKg = params.pricePerKg || 11;
  const paintPerKg = params.applyPaint ? (params.paintPerKg || 0) : 0;
  const includeSetup = !!params.includeSetup;
  const quantities = Array.isArray(params.quantities) && params.quantities.length ? params.quantities : [1,10,50,100];

  const material = det.material || params.material || "AISI 304";
  let weightKg = det.weight_kg;
  const thick = det.thickness_mm;
  const area = det.area_mm2;

  // Derive weight if missing and we have area/thickness
  if((!weightKg || !isFinite(weightKg)) && isFinite(area) && isFinite(thick)){
    const dens = densities(material); // g/cm3
    const volume_cm3 = area * thick * 0.001; // mm2 * mm * 0.001 = cm3
    const mass_g = volume_cm3 * dens;
    weightKg = mass_g / 1000.0;
  }

  if(!weightKg || !isFinite(weightKg)){
    // Fallback minimal weight guess from sheet thickness tokens if present
    weightKg = 0.75; // safe default
  }

  const bends = Math.max(0, det.bends_count || 0);
  const laserHoles = Math.max(0, det.laser_holes_count || 0);
  const drillHoles = Math.max(0, det.drill_holes_count || 0);

  // Time model (minutes)
  const setupMin = includeSetup ? 5 : 0;
  const laserMin = 1 + 0.1 * laserHoles; // base + per foro laser
  const bendMin = 2.5 * bends;
  const drillMin = 0.5 * drillHoles;
  const cycleMin = Math.max(1, laserMin + bendMin + drillMin);

  const operators = weightKg > 25 ? 2 : 1;
  const ratePerMin = (hourlyRate * operators) / 60;

  const materialCost = weightKg * pricePerKg;
  const paintCost = weightKg * paintPerKg;

  const baseItems = [
    { label: `Materiale ${material}`, detail: `${weightKg.toFixed(3)} kg × €${pricePerKg.toFixed(2)}/kg`, total: materialCost },
    ...(paintPerKg > 0 ? [{ label: "Verniciatura", detail: `${weightKg.toFixed(3)} kg × €${paintPerKg.toFixed(2)}/kg`, total: paintCost }] : []),
    { label: "Taglio laser", detail: `${laserMin.toFixed(1)} min`, total: laserMin * ratePerMin },
    { label: `Piegatura (${bends} pieghe)`, detail: `${bendMin.toFixed(1)} min`, total: bendMin * ratePerMin },
    ...(drillHoles>0 ? [{ label: "Fori a trapano", detail: `${drillMin.toFixed(1)} min (${drillHoles} fori)`, total: drillMin * ratePerMin }] : []),
  ];

  // Quantity scaling
  const per_quantity = {};
  let items = baseItems.slice();
  const subtotal = items.reduce((s, x)=> s + (x.total || 0), 0);
  const total1 = subtotal + setupMin * ratePerMin;

  const qtyList = quantities.filter(q=>Number.isFinite(q) && q>0);
  qtyList.forEach(qty=>{
    const totalLaborMin = setupMin + cycleMin * qty;
    const laborCost = totalLaborMin * ratePerMin;
    const matCost = materialCost * qty + paintCost * qty;
    const orderTotal = matCost + laborCost;
    const unitPrice = orderTotal / qty;
    per_quantity[qty] = { order_total: orderTotal, unit_price: unitPrice };
  });

  return {
    items: items,
    total: total1,
    per_quantity
  };
}

exports.handler = async (event)=>{
  if(event.httpMethod === "OPTIONS"){
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
      },
      body: ""
    };
  }

  if(event.httpMethod !== "POST"){
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try{
    const body = JSON.parse(event.body || "{}");
    const pdfText = (body.pdfText || "").slice(0, 50000);
    const params = body.params || {};

    if(!pdfText){
      return { statusCode: 400, body: "Missing pdfText" };
    }

    // Prompt for extraction
    const sys = `Sei un perito di carpenteria metallica. Estrarrai dati strutturati da testo grezzo di un disegno tecnico.
Resituisci SOLO JSON, senza spiegazioni, con questa struttura:
{
  "material": "AISI 304 | S235 | Alluminio | altro o vuoto",
  "thickness_mm": number|null,
  "area_mm2": number|null,
  "weight_kg": number|null,
  "bends_count": number,
  "laser_holes_count": number,
  "drill_holes_count": number,
  "notes": string[]
}
Regole:
- I numeri devono essere solo numeri (usa il punto come separatore decimale).
- Rileva pieghe da parole tipo "GIU' 90°", "SU 90°", "R", "pieghe".
- Se trovi "Sviluppo (mm²)" usa quel valore per area_mm2.
- Se trovi "Peso (g)" converti in kg.
- Se non trovi un campo lascia null (tranne i count che vanno a 0).
`;

    const user = "TESTO PDF:\n" + pdfText;

    const aiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      })
    });
    if(!aiRes.ok){
      const t = await aiRes.text();
      throw new Error(`OpenAI HTTP ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content?.trim() || "{}";

    let detected;
    try{
      detected = JSON.parse(content);
    }catch(parseErr){
      // Fallback regex extraction
      const mMat = /AISI\s*304|S235|Alluminio|acciaio|inox/i.exec(pdfText);
      const mThk = /SP\.\s*([0-9]{1,2})\/?10|sp\.\s*([0-9]+)\s*mm/i.exec(pdfText);
      const mArea = /Sviluppo\s*\(mm²\)\s*[:\s]*([0-9\.,]+)/i.exec(pdfText);
      const mPesoG = /Peso\s*\(g\)\s*[:\s]*([0-9\.,]+)/i.exec(pdfText);

      detected = {
        material: mMat ? mMat[0] : null,
        thickness_mm: mThk ? (mThk[1] ? Number(mThk[1])/10 : Number(mThk[2])) : null,
        area_mm2: mArea ? sanitizeNumber(mArea[1]) : null,
        weight_kg: mPesoG ? (sanitizeNumber(mPesoG[1]) / 1000.0) : null,
        bends_count: (pdfText.match(/GIU'|SU|pieg|90°/gi) || []).length >= 1 ? 2 : 0,
        laser_holes_count: (pdfText.match(/foro|fori|ø|diam/i) || []).length, // very rough
        drill_holes_count: 0,
        notes: []
      };
    }

    // Normalize numbers
    const det = {
      material: detected.material || null,
      thickness_mm: sanitizeNumber(detected.thickness_mm),
      area_mm2: sanitizeNumber(detected.area_mm2),
      weight_kg: sanitizeNumber(detected.weight_kg),
      bends_count: Number.isFinite(detected.bends_count) ? detected.bends_count : 0,
      laser_holes_count: Number.isFinite(detected.laser_holes_count) ? detected.laser_holes_count : 0,
      drill_holes_count: Number.isFinite(detected.drill_holes_count) ? detected.drill_holes_count : 0,
      notes: Array.isArray(detected.notes) ? detected.notes.slice(0,10) : []
    };

    const comp = compute(params, det);

    const resp = {
      meta: { detected: det },
      items: comp.items,
      total: comp.total,
      per_quantity: comp.per_quantity
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(resp)
    };
  }catch(err){
    console.error(err);
    return { statusCode: 500, body: "Errore: " + err.message };
  }
};
