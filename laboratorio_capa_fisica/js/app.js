// ==================== MODELO FÍSICO ====================
const W = [[4,0,4,4,10],[8,3,8,7,10],[6,5,6,7,6]]; // Paredes [x1,y1,x2,y2,atenuacion]
const RT = [[1.2,1.2],[10.8,5.8]]; // Routers
const MW = [9.5,1.2]; // Microondas
const NF = -95; // Ruido base

function seg(a,b,c,d,e,f,g,h) {
  function o(px,py,qx,qy,rx,ry) { return (qx-px)*(ry-py)-(qy-py)*(rx-px); }
  const d1=o(a,b,c,d,e,f), d2=o(a,b,c,d,g,h), d3=o(e,f,g,h,a,b), d4=o(e,f,g,h,c,d);
  return d1*d2<0 && d3*d4<0;
}

function loss(x1,y1,x2,y2,band) {
  const d = Math.max(1, Math.hypot(x2-x1, y2-y1));
  let l = (band==5 ? 47 : 40) + 32*Math.log10(d);
  W.forEach(w => { if (seg(x1,y1,x2,y2,w[0],w[1],w[2],w[3])) l += band==5 ? w[4]*1.5 : w[4]; });
  return l;
}

function snrAt(px,py,s) {
  const r = RT[s.rt];
  const rssi = 8 - loss(r[0], r[1], px, py, s.band);
  let n = Math.pow(10, NF/10);
  if (s.mw && s.band==2.4) n += Math.pow(10, (-5 - loss(MW[0],MW[1],px,py,2.4))/10);
  return { rssi: rssi, snr: rssi - 10*Math.log10(n) };
}

function rate(snr) { return snr<6?0 : snr<12?6 : snr<16?12 : snr<20?24 : snr<25?36 : 54; }

function evalS(px,py,s) {
  if (s.cb) return { st:"ok", msg:"Imprime bien", bw:100, thr:60, use:40, rssi:null, snr:null, why:"El cobre UTP (8.3.3) no depende del aire: sin interferencia de microondas ni paredes." };
  if (s.band==2.4 ? false : s.ps=="2.4") return { st:"bad", msg:"No se conecta", bw:0, thr:0, use:0, rssi:null, snr:null, why:"Estándares incompatibles: la impresora es 2,4 GHz (b/g) y el router emite en 5 GHz (a). No interoperan (8.3.7)." };
  
  const q = snrAt(px,py,s);
  const bw = rate(q.snr);
  const air = 1/(1+0.3*(s.w2 ? s.u : s.u/2));
  const thr = bw * 0.6 * air;
  const use = thr * 0.67;
  let st, msg, why;
  
  if (q.snr < 6) { st="bad"; msg="No se conecta"; why="Relación señal/ruido insuficiente."; }
  else if (q.snr < 16) { st="bad"; msg="Se corta"; why="SNR baja: el enlace se cae al transferir."; }
  else if (use < 4) { st="mid"; msg="Imprime lento"; why="Hay enlace pero la capacidad útil es baja."; }
  else { st="ok"; msg="Imprime bien"; why="Señal suficiente."; }
  
  if (q.snr<16 && s.mw && s.band==2.4) why="El microondas eleva el ruido en 2,4 GHz y la SNR cae (8.3.7).";
  else if (q.snr<16 && s.band==5) why="En 5 GHz las paredes atenúan más y el alcance es menor (8.3.7).";
  else if (q.snr<16) why="Distancia y paredes debilitan la señal (8.3.7).";
  if (st=="mid") why = Math.round(s.w2 ? s.u : s.u/2) + " notebooks comparten el aire (CSMA/CA): al imprimir queda poco tiempo de aire y el rendimiento cae (8.2.3).";
  
  return { st, msg, bw, thr, use, air, rssi:q.rssi, snr:q.snr, why };
}

// ==================== DIBUJO OPTIMIZADO ====================
const P = {x:7, y:5.5};
const S = {rt:0, band:2.4, ps:"2.4", mw:true, w2:true, cb:false, u:18};
const cv = document.getElementById("cv");
const g = cv.getContext("2d");
const K = 50; // Escala de coordenadas

function colorForSNR(snr) {
  if (snr >= 25) return [60, 201, 191];  // Teal
  if (snr >= 16) return [155, 212, 90];  // Verde
  if (snr >= 6)  return [240, 192, 74];  // Amarillo
  if (snr >= 0)  return [232, 131, 58];  // Naranja
  return [192, 57, 43];                  // Rojo
}

function drawHeatmap() {
  const wd = cv.width, ht = cv.height;
  const imgData = g.createImageData(wd, ht);
  const data = imgData.data;
  const step = 4; // Resolución del mapa

  for (let y = 0; y < ht; y += step) {
    for (let x = 0; x < wd; x += step) {
      const q = snrAt((x + step/2)/K, (y + step/2)/K, S);
      const c = colorForSNR(q.snr);
      
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          if (x+dx >= wd || y+dy >= ht) continue;
          const idx = ((y+dy) * wd + (x+dx)) * 4;
          data[idx] = c[0]; data[idx+1] = c[1]; data[idx+2] = c[2]; data[idx+3] = 140; // Alpha 55%
        }
      }
    }
  }
  g.putImageData(imgData, 0, 0);
}

function draw() {
  g.clearRect(0, 0, cv.width, cv.height);
  
  // 1. Mapa de calor (si no está por cable)
  if (!S.cb) drawHeatmap();
  
  // 2. Halo Microondas
  if (S.mw && S.band==2.4 && !S.cb) {
    const mg = g.createRadialGradient(MW[0]*K, MW[1]*K, 0, MW[0]*K, MW[1]*K, 90);
    mg.addColorStop(0, "rgba(160,80,220,0.4)");
    mg.addColorStop(1, "rgba(160,80,220,0)");
    g.fillStyle = mg;
    g.beginPath(); g.arc(MW[0]*K, MW[1]*K, 90, 0, 7); g.fill();
  }
  
  // 3. Paredes
  g.lineWidth = 6;
  g.strokeStyle = "rgba(60,70,80,0.9)";
  g.lineCap = "round";
  W.forEach((w, i) => {
    g.globalAlpha = i==2 ? 0.6 : 1;
    g.beginPath(); g.moveTo(w[0]*K, w[1]*K); g.lineTo(w[2]*K, w[3]*K); g.stroke();
  });
  g.globalAlpha = 1;
  
  // 4. Routers
  g.font = "bold 13px system-ui";
  g.textAlign = "center";
  RT.forEach((r, i) => {
    const on = (i == S.rt);
    g.fillStyle = i ? "#14202e" : "#0b7a75";
    g.beginPath(); g.arc(r[0]*K, r[1]*K, 14, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.fillText("R", r[0]*K, r[1]*K+5);
    
    g.fillStyle = "#14202e";
    g.fillText(i ? "Claro" : "Personal", r[0]*K, r[1]*K + (r[1]<3 ? 32 : -22));
    
    if (S.w2 || on) {
      g.strokeStyle = i ? "#14202e" : "#0b7a75";
      g.lineWidth = 2;
      g.globalAlpha = .6;
      [20, 32].forEach(rr => {
        g.beginPath(); g.arc(r[0]*K, r[1]*K, rr, -.7, .7); g.stroke();
      });
      g.globalAlpha = 1;
    }
  });
  
  // 5. Microondas
  if (S.mw) {
    g.fillStyle = "#8a97a5"; g.fillRect(MW[0]*K-14, MW[1]*K-10, 28, 20);
    g.fillStyle = "#fff"; g.font = "bold 12px system-ui"; g.fillText("μ", MW[0]*K, MW[1]*K+5);
    g.fillStyle = "#14202e"; g.fillText("microondas", MW[0]*K, MW[1]*K+28);
  }
  
  // 6. Enlace Impresora-Router
  const r = RT[S.rt];
  g.setLineDash([6,6]);
  g.strokeStyle = S.cb ? "#e8833a" : "#5b6b7d";
  g.lineWidth = S.cb ? 4 : 1.5;
  if (S.cb) g.setLineDash([]);
  g.beginPath(); g.moveTo(r[0]*K, r[1]*K); g.lineTo(P.x*K, P.y*K); g.stroke();
  g.setLineDash([]);
  
  // 7. Impresora
  g.fillStyle = "#e8833a";
  g.fillRect(P.x*K-16, P.y*K-11, 32, 22);
  g.fillStyle = "#fff"; g.font = "14px system-ui"; g.fillText("🖨", P.x*K, P.y*K+6);
}

// ==================== INTERFAZ ====================
let job = null;

function upd() {
  const e = evalS(P.x, P.y, S);
  const o = document.getElementById("out");
  const cls = e.st=="ok" ? "b-ok" : e.st=="bad" ? "b-bad" : "b-mid";
  
  const m = (n, v, mx, u) => `<div class="meter"><div class="n"><span>${n}</span><b>${v.toFixed(1)} ${u}</b></div><div class="bar"><i style="width:${Math.min(100, v/mx*100)}%"></i></div></div>`;
  
  o.innerHTML = `
    <span class="badge ${cls}">${e.msg}</span>
    <p style="margin:10px 0 6px; font-size:0.95rem">${e.why}</p>
    ${e.rssi===null ? "" : `
      <div class="stat">
        <span>Señal <b>${e.rssi.toFixed(0)} dBm</b></span>
        <span>Relación señal/ruido <b>${e.snr.toFixed(0)} dB</b></span>
        <span>Tiempo de aire <b>${Math.round(e.air*100)} %</b></span>
      </div>`}
    ${m("Ancho de banda (enlace)", e.bw, 100, "Mbps")}
    ${m("Rendimiento (bits)", e.thr, 100, "Mbps")}
    ${m("Capacidad útil (datos)", e.use, 100, "Mbps")}
    <div class="prog">
      <button class="act" id="go">Enviar a imprimir (2 MB)</button>
      <span id="pt" class="note" style="margin-left:10px"></span>
      <div class="bar" style="margin-top:10px"><i id="pb" style="width:0"></i></div>
    </div>
  `;
  
  document.getElementById("go").onclick = () => run(e);
  draw();
}

// ==================== ANIMACIÓN RÁPIDA ====================
function run(e) {
  clearInterval(job);
  const b = document.getElementById("pb"), t = document.getElementById("pt");
  let p = 0;
  
  // Si falla, se corta rápido (entre 30 y 50% de la barra).
  // Si funciona, completa el 100% en 1.5 segundos aprox.
  const stop = e.st == "bad" ? 30 + Math.random()*20 : 100;
  const dur = 1.5; // Segundos fijos de animación para no aburrir al jurado
  
  t.textContent = e.st == "bad" ? "Enviando…" : "Enviando…";
  b.style.background = "";
  
  job = setInterval(() => {
    p += 100 / (dur * 20); 
    
    if (p >= stop) {
      clearInterval(job); 
      p = stop;
      
      if (e.st == "bad") {
        t.textContent = "✕ Conexión perdida: el trabajo no sale";
        b.style.background = "var(--bad)";
      } else {
        t.textContent = "✓ Impreso con éxito";
        b.style.background = "var(--ok)";
      }
    }
    b.style.width = p + "%";
  }, 50);
}

function pos(ev) {
  const r = cv.getBoundingClientRect();
  P.x = Math.max(.3, Math.min(11.7, (ev.clientX-r.left)/r.width*12));
  P.y = Math.max(.3, Math.min(6.7, (ev.clientY-r.top)/r.height*7));
  upd();
}

let dr = false;
cv.addEventListener("pointerdown", (e) => { dr = true; cv.setPointerCapture(e.pointerId); pos(e); });
cv.addEventListener("pointermove", (e) => { if (dr) pos(e); });
cv.addEventListener("pointerup", () => { dr = false; });

// Controles
[["rt","rt",1],["bd","band",2],["ps","ps",3]].forEach(a => {
  document.getElementById(a[0]).onchange = function() {
    const v = this.value;
    S[a[1]] = a[0]=="rt" ? +v : a[0]=="bd" ? +v : v;
    upd();
  };
});

document.getElementById("us").oninput = function() {
  S.u = +this.value;
  document.getElementById("uv").textContent = this.value;
  upd();
};

[["mw","mw"],["w2","w2"],["cb","cb"]].forEach(a => {
  document.getElementById(a[0]).onchange = function() { S[a[1]] = this.checked; upd(); };
});

// ==================== DIAGNÓSTICO ====================
const C = [
  {k:"cob", l:"8.3.7", n:"Cobertura insuficiente", f:"Acercar router o impresora; evitar paredes."},
  {k:"int", l:"8.3.7", n:"Interferencia (microondas, teléfonos, fluorescentes)", f:"Alejar la fuente o imprimir por cable UTP."},
  {k:"est", l:"8.3.7", n:"Estándares 802.11 incompatibles (a frente a b/g)", f:"Usar el mismo estándar en ambos."},
  {k:"con", l:"8.3.7", n:"Dos WLAN en la misma banda compiten", f:"Dejar una sola WLAN activa o usar cable."},
  {k:"ruid", l:"8.3.2", n:"Ruido electromagnético en el cobre", f:"Alejar el cable de motores y fluorescentes."},
  {k:"cat", l:"8.3.3", n:"Cableado de categoría inferior", f:"Usar UTP Cat5e (mínimo) o Cat6."},
  {k:"cru", l:"8.3.3", n:"Cable directo y cruzado confundidos", f:"Usar cable directo impresora–switch."},
  {k:"ter", l:"8.3.8", n:"Terminación RJ-45 incorrecta", f:"Re-armar (EIA/TIA-568) y probar con tester."},
  {k:"dis", l:"8.3.1", n:"Distancia máxima superada", f:"Acortar el tramo."},
  {k:"ele", l:"8.3.5", n:"Riesgo eléctrico (tierras distintas)", f:"Instalar según normas."}
];

const Q = [
  ["Se corta con el microondas, teléfonos inalámbricos o fluorescentes", {int:5, ruid:2}],
  ["La impresora está lejos del router o tras paredes", {cob:5}],
  ["Los dos routers están cerca y ambos emiten en 2,4 GHz", {con:5, int:1}],
  ["Un router emite en 5 GHz y la impresora es antigua (b/g)", {est:5}],
  ["Funciona un rato y se corta", {int:2, cob:2, con:2, ter:1, ruid:1}],
  ["Por cable no hay conectividad", {cru:3, ter:3, cat:1}],
  ["Cable viejo, de teléfono o armado a mano", {cat:4, ter:4, ruid:1}],
  ["El cable pasa junto a motores o fluorescentes", {ruid:5}],
  ["Cable muy largo o con empalmes", {dis:5, ter:1}],
  ["Cable cruzado donde iba directo", {cru:5}],
  ["Descargas o tierras distintas entre edificios", {ele:5}]
];

const bx = document.getElementById("sym");
Q.forEach((s, i) => {
  const d = document.createElement("label");
  d.className = "chk";
  d.innerHTML = `<input type="checkbox" data-i="${i}"><span>${s[0]}</span>`;
  bx.appendChild(d);
});

function calc() {
  const sc = {}; let t = 0;
  C.forEach(c => sc[c.k] = 0);
  let any = false;
  
  bx.querySelectorAll("input:checked").forEach(b => {
    any = true;
    const w = Q[+b.dataset.i][1];
    for (const k in w) sc[k] += w[k];
  });
  
  const o = document.getElementById("dout");
  if (!any) { o.innerHTML = '<p class="note">Marcá al menos un síntoma.</p>'; return; }
  
  C.forEach(c => t += sc[c.k]);
  
  o.innerHTML = C
    .map(c => ({ c, s: sc[c.k] }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map(x => `<div class="res"><span class="pct">${Math.round(x.s/t*100)}%</span><h3><span class="lay">Ítem ${x.c.l}</span>${x.c.n}</h3><div class="f">Solución: ${x.c.f}</div></div>`)
    .join("");
}

bx.onchange = calc;
calc();

// Tabs
document.querySelectorAll(".tabs button").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
    document.getElementById("sim").classList.toggle("hide", b.dataset.t != "sim");
    document.getElementById("dia").classList.toggle("hide", b.dataset.t != "dia");
  };
});

upd();