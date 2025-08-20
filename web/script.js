// PDF parsing (client-side) + call Netlify Function for AI extraction and estimate
const $ = (s)=>document.querySelector(s);
const pdfInput = $("#pdfInput");
const fileLabel = $("#fileLabel");
const analyzeBtn = $("#analyzeBtn");
const calcBtn = $("#calcBtn");
const statusEl = $("#status");
const pdfPreview = $("#pdfPreview");

let pdfText = "";

function enableAnalyzeIfFilePresent(){
  const f = pdfInput?.files?.[0];
  if(f){
     fileLabel.textContent = f.name;
     analyzeBtn.disabled = false;
     calcBtn.disabled = true;
     statusEl.textContent = "";
  }
}

// iOS/Safari sometimes fires 'input' but not 'change' or viceversa
["change","input"].forEach(evt=>{
  pdfInput.addEventListener(evt, enableAnalyzeIfFilePresent, {passive:true});
});

// Fallback timer: dopo la scelta file, alcune webview mobili non aggiornano subito .files
pdfInput.addEventListener("click", ()=>{
  setTimeout(enableAnalyzeIfFilePresent, 700);
});

document.addEventListener("visibilitychange", ()=>{
  // se l’utente ha aperto il picker file in altra view e poi torna
  setTimeout(enableAnalyzeIfFilePresent, 300);
});

async function extractPdfText(file){
  statusEl.textContent = "Estrazione testo dal PDF…";
  const buf = await file.arrayBuffer();
  const typedArray = new Uint8Array(buf);
  const pdf = await pdfjsLib.getDocument({data: typedArray}).promise;
  let text = "";
  for(let i=1;i<=pdf.numPages;i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it=>it.str).join(" ") + "\n";
  }
  return text.trim();
}

analyzeBtn.addEventListener("click", async ()=>{
  const file = pdfInput.files?.[0];
  if(!file){ statusEl.textContent = "Seleziona un PDF."; return; }
  try{
    pdfText = await extractPdfText(file);
    pdfPreview.textContent = (pdfText || "").slice(0, 4000);
    statusEl.textContent = "Testo estratto ✓";
    calcBtn.disabled = false;
  }catch(err){
    console.error(err);
    statusEl.textContent = "Errore estrazione PDF";
  }
});

calcBtn.addEventListener("click", async ()=>{
  if(!pdfText){ statusEl.textContent = "Prima analizza il PDF."; return; }
  statusEl.textContent = "Chiedo all'AI…";
  const params = {
    material: $("#material").value,
    pricePerKg: parseFloat($("#pricePerKg").value || "0"),
    hourlyRate: parseFloat($("#hourlyRate").value || "42"),
    paintPerKg: parseFloat($("#paintPerKg").value || "0"),
    applyPaint: $("#applyPaint").checked,
    includeSetup: $("#includeSetup").checked,
    quantities: $("#quantities").value.split(",").map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n) && n>0)
  };
  try{
    const res = await fetch("/.netlify/functions/calc-quote", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ pdfText, params })
    });
    if(!res.ok){
      const t = await res.text();
      throw new Error("HTTP " + res.status + " " + t);
    }
    const data = await res.json();
    statusEl.textContent = "Fatto ✓";
    renderResults(data);
  }catch(err){
    console.error(err);
    statusEl.textContent = "Errore calcolo (controlla OPENAI_API_KEY e redeploy)";
  }
});

function eur(n){ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n); }

function renderResults(data){
  const results = $("#results");
  results.innerHTML = "";

  const meta = data.meta || {};
  const det = meta.detected || {};
  const metaDiv = document.createElement("div");
  metaDiv.innerHTML = `
    <p><strong>Rilevati</strong>:
      materiale: <span class="badge">${det.material ?? "-"}</span>
      • spessore: <span class="badge">${det.thickness_mm ?? "-" } mm</span>
      • area: <span class="badge">${det.area_mm2 ?? "-" } mm²</span>
      • peso: <span class="badge">${det.weight_kg ? det.weight_kg.toFixed(3) : "-" } kg</span>
      • pieghe: <span class="badge">${det.bends_count ?? 0}</span>
      • fori laser: <span class="badge">${det.laser_holes_count ?? 0}</span>
      • fori trapano: <span class="badge">${det.drill_holes_count ?? 0}</span>
    </p>
  `;
  results.appendChild(metaDiv);

  const tbl = document.createElement("table");
  tbl.innerHTML = <thead><tr><th>Voce</th><th>Dettagli</th><th>Totale</th></tr></thead>;
  const body = document.createElement("tbody");
  (data.items || []).forEach(it=>{
    const tr = document.createElement("tr");
    tr.innerHTML = <td>${it.label}</td><td>${it.detail ?? ""}</td><td>${eur(it.total || 0)}</td>;
    body.appendChild(tr);
  });
  tbl.appendChild(body);
  const foot = document.createElement("tfoot");
  foot.innerHTML = <tr><td></td><td>Totale</td><td>${eur(data.total || 0)}</td></tr>;
  tbl.appendChild(foot);
  $("#results").appendChild(tbl);

  if(data.per_quantity){
    const tbl2 = document.createElement("table");
    tbl2.innerHTML = <thead><tr><th>Q.tà</th><th>Totale ordine</th><th>Prezzo unitario</th></tr></thead>;
    const tb2 = document.createElement("tbody");
    Object.keys(data.per_quantity).forEach(qty=>{
      const row = data.per_quantity[qty];
      const tr = document.createElement("tr");
      tr.innerHTML = <td>${qty}</td><td>${eur(row.order_total)}</td><td>${eur(row.unit_price)}</td>;
      tb2.appendChild(tr);
    });
    tbl2.appendChild(tb2);
    $("#results").appendChild(tbl2);
  }
}
