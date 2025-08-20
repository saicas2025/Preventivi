// PDF parsing (client-side) + call Netlify Function for AI extraction and estimate
const $ = (s)=>document.querySelector(s);
const pdfInput = $("#pdfInput");
const fileLabel = $("#fileLabel");
const analyzeBtn = $("#analyzeBtn");
const calcBtn = $("#calcBtn");
const statusEl = $("#status");
const pdfPreview = $("#pdfPreview");

let pdfText = "";
let extracted = null;

pdfInput.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file){ return; }
  fileLabel.textContent = file.name;
  analyzeBtn.disabled = false;
  calcBtn.disabled = true;
  pdfPreview.textContent = "";
  statusEl.textContent = "";
});

analyzeBtn.addEventListener("click", async ()=>{
  const file = pdfInput.files?.[0];
  if(!file){ return; }
  statusEl.textContent = "Estrazione testo dal PDF…";
  try{
    const buf = await file.arrayBuffer();
    const typedArray = new Uint8Array(buf);
    const pdf = await pdfjsLib.getDocument({data: typedArray}).promise;
    let text = "";
    for(let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it=>it.str).join(" ") + "\n";
    }
    pdfText = text.trim();
    pdfPreview.textContent = (pdfText || "").slice(0, 4000);
    statusEl.textContent = "Testo estratto ✓";
    calcBtn.disabled = false;
  }catch(err){
    console.error(err);
    statusEl.textContent = "Errore estrazione PDF";
  }
});

calcBtn.addEventListener("click", async ()=>{
  if(!pdfText){ return; }
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
    statusEl.textContent = "Errore calcolo";
  }
});

function eur(n){ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n); }

function renderResults(data){
  const results = $("#results");
  results.innerHTML = "";

  // Meta box
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

  // Items table
  const tbl = document.createElement("table");
  const head = document.createElement("thead");
  head.innerHTML = `
    <tr><th>Voce</th><th>Dettagli</th><th>Totale</th></tr>
  `;
  tbl.appendChild(head);
  const body = document.createElement("tbody");
  (data.items || []).forEach(it=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${it.label}</td><td>${it.detail ?? ""}</td><td>${eur(it.total || 0)}</td>`;
    body.appendChild(tr);
  });
  tbl.appendChild(body);
  const foot = document.createElement("tfoot");
  foot.innerHTML = `<tr><td></td><td>Totale</td><td>${eur(data.total || 0)}</td></tr>`;
  tbl.appendChild(foot);
  results.appendChild(tbl);

  // Qty table
  if(data.per_quantity){
    const tbl2 = document.createElement("table");
    const thead2 = document.createElement("thead");
    thead2.innerHTML = `<tr><th>Q.tà</th><th>Totale ordine</th><th>Prezzo unitario</th></tr>`;
    tbl2.appendChild(thead2);
    const tb2 = document.createElement("tbody");
    Object.keys(data.per_quantity).forEach(qty=>{
      const row = data.per_quantity[qty];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${qty}</td><td>${eur(row.order_total)}</td><td>${eur(row.unit_price)}</td>`;
      tb2.appendChild(tr);
    });
    tbl2.appendChild(tb2);
    results.appendChild(tbl2);
  }
}
