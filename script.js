/* =========================================================
   Calcura — script.js
   Modular, dependency-free calculator engine.
   Sections: State | Utils | Math Engine | Basic/Sci UI |
             Tools Engine | Currency | Voice | History |
             Settings | Bootstrap
   ========================================================= */

/* ---------------- STATE ---------------- */
const STORAGE_KEY = "calcura.state.v1";

const defaultState = {
  theme: "dark",
  color: "violet",
  language: "en",
  angleMode: "deg",
  memory: 0,
  history: [],
  favorites: [],
  lastExpr: "",
  currencyRates: null,
  currencyRatesTime: null
};

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return {...defaultState};
    return {...defaultState, ...JSON.parse(raw)};
  }catch(e){ return {...defaultState}; }
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
}

/* ---------------- I18N ---------------- */
const STR = {
  en:{ basic:"Basic", scientific:"Scientific", tools:"Tools", history:"History",
       clearHistory:"Clear history", noHistory:"No calculations yet",
       settings:"Settings", darkMode:"Dark mode", language:"Language",
       copied:"Copied to clipboard", exportCsv:"Export CSV", exportPdf:"Export PDF",
       search:"Search history…", back:"Back", calculate:"Result", copy:"Copy",
       share:"Share", save:"Save", favorite:"Favorite", saved:"Saved to history" },
  hi:{ basic:"बेसिक", scientific:"वैज्ञानिक", tools:"टूल्स", history:"इतिहास",
       clearHistory:"इतिहास साफ़ करें", noHistory:"अभी तक कोई गणना नहीं",
       settings:"सेटिंग्स", darkMode:"डार्क मोड", language:"भाषा",
       copied:"क्लिपबोर्ड पर कॉपी हुआ", exportCsv:"CSV निर्यात करें", exportPdf:"PDF निर्यात करें",
       search:"इतिहास खोजें…", back:"वापस", calculate:"परिणाम", copy:"कॉपी करें",
       share:"शेयर करें", save:"सेव करें", favorite:"पसंदीदा", saved:"इतिहास में सेव हुआ" }
};
function t(key){ return (STR[state.language] && STR[state.language][key]) || STR.en[key] || key; }

/* ---------------- UTILS ---------------- */
function vibrate(ms=12){ if(navigator.vibrate) navigator.vibrate(ms); }

let toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 2200);
}

function formatNumber(n){
  if(n === Infinity || n === -Infinity) return "Error";
  if(Number.isNaN(n)) return "Error";
  if(Math.abs(n) < 1e-10) n = 0;
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 8 });
}

function copyText(txt){
  navigator.clipboard?.writeText(String(txt)).then(()=>{ toast(t("copied")); vibrate(); })
    .catch(()=>toast("Could not copy"));
}
function shareText(txt){
  if(navigator.share){
    navigator.share({ text: String(txt) }).catch(()=>{});
  } else {
    copyText(txt);
  }
}

function addRipple(e, btn){
  const circle = document.createElement("span");
  circle.className = "ripple";
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  circle.style.width = circle.style.height = size + "px";
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left - size/2;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top - size/2;
  circle.style.left = x + "px";
  circle.style.top = y + "px";
  btn.appendChild(circle);
  setTimeout(()=>circle.remove(), 500);
}

/* ---------------- MATH ENGINE ---------------- */
function factorial(n){
  n = Math.round(n);
  if(n < 0) throw new Error("neg factorial");
  if(n > 170) return Infinity;
  let r = 1;
  for(let i=2;i<=n;i++) r*=i;
  return r;
}
function sinD(x){ return Math.sin(x*Math.PI/180); }
function cosD(x){ return Math.cos(x*Math.PI/180); }
function tanD(x){ return Math.tan(x*Math.PI/180); }

function evaluateExpression(raw){
  if(!raw || !raw.trim()) return 0;
  let expr = raw;

  const safe = /^[0-9+\-×÷.()%^π\s a-z!]*$/i;
  if(!safe.test(expr)) throw new Error("Invalid characters");

  expr = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "Math.PI")
    .replace(/\^/g, "**");

  expr = expr.replace(/(\d+(\.\d+)?)!/g, (m, n) => `factorial(${n})`);

  const trigFn = state.angleMode === "deg" ? { sin:"sinD", cos:"cosD", tan:"tanD" }
                                            : { sin:"Math.sin", cos:"Math.cos", tan:"Math.tan" };
  expr = expr.replace(/sin\(/g, trigFn.sin + "(")
             .replace(/cos\(/g, trigFn.cos + "(")
             .replace(/tan\(/g, trigFn.tan + "(")
             .replace(/log\(/g, "Math.log10(")
             .replace(/ln\(/g, "Math.log(")
             .replace(/sqrt\(/g, "Math.sqrt(")
             .replace(/cbrt\(/g, "Math.cbrt(");

  expr = expr.replace(/(\d+(\.\d+)?)%/g, "($1/100)");

  try{
    const fn = new Function("factorial", "sinD", "cosD", "tanD", "Math", `"use strict"; return (${expr});`);
    const result = fn(factorial, sinD, cosD, tanD, Math);
    if(typeof result !== "number" || Number.isNaN(result)) throw new Error("bad result");
    return result;
  }catch(e){
    throw new Error("Calculation error");
  }
}

/* ---------------- BASIC / SCIENTIFIC UI ---------------- */
let currentExpr = "";
let justEvaluated = false;

const exprTrailEl = () => document.getElementById("exprTrail");
const resultEl = () => document.getElementById("resultDisplay");

function refreshDisplay(){
  exprTrailEl().textContent = currentExpr || "0";
  try{
    if(currentExpr.trim()){
      const preview = evaluateExpression(currentExpr);
      resultEl().textContent = formatNumber(preview);
    } else {
      resultEl().textContent = "0";
    }
  }catch(e){
    resultEl().textContent = justEvaluated ? resultEl().textContent : "…";
  }
}

function pressKey(val){
  vibrate();
  if(val === "AC"){ currentExpr = ""; justEvaluated = false; }
  else if(val === "C"){ currentExpr = currentExpr.slice(0, -1); justEvaluated = false; }
  else if(val === "DEL"){ currentExpr = currentExpr.slice(0, -1); justEvaluated = false; }
  else if(val === "="){ doEquals(); return; }
  else if(val === "M+"){ state.memory += safeCurrentValue(); saveState(); showMemoryBadge(); toast("M+ " + formatNumber(state.memory)); }
  else if(val === "M-"){ state.memory -= safeCurrentValue(); saveState(); showMemoryBadge(); toast("M- " + formatNumber(state.memory)); }
  else if(val === "MR"){ currentExpr += formatRawNumber(state.memory); justEvaluated = false; }
  else if(val === "MC"){ state.memory = 0; saveState(); showMemoryBadge(); toast("Memory cleared"); }
  else if(val === "DEG"){ state.angleMode = state.angleMode === "deg" ? "rad" : "deg"; saveState(); updateAngleBtn(); }
  else {
    if(justEvaluated && /^[0-9.]$/.test(val)){ currentExpr = ""; }
    justEvaluated = false;
    currentExpr += val;
  }
  refreshDisplay();
}

function safeCurrentValue(){
  try{ return evaluateExpression(currentExpr) || 0; }catch(e){ return 0; }
}
function formatRawNumber(n){
  return (Math.round(n*1e10)/1e10).toString();
}
function showMemoryBadge(){
  document.getElementById("memBadge").classList.toggle("show", state.memory !== 0);
}
function updateAngleBtn(){
  const b = document.getElementById("degToggle");
  if(b) b.textContent = state.angleMode === "deg" ? "DEG" : "RAD";
}

function doEquals(){
  if(!currentExpr.trim()) return;
  try{
    const val = evaluateExpression(currentExpr);
    const formatted = formatNumber(val);
    resultEl().textContent = formatted;
    exprTrailEl().textContent = currentExpr + " =";
    pushHistory(currentExpr, formatted, "calc");
    currentExpr = formatted.replace(/,/g, "");
    justEvaluated = true;
    vibrate(20);
  }catch(e){
    resultEl().textContent = "Error";
    vibrate([15,40,15]);
  }
}

const BASIC_KEYS = [
  {l:"AC",v:"AC",c:"func"}, {l:"()",v:"(",c:"func"}, {l:"%",v:"%",c:"func"}, {l:"÷",v:"÷",c:"op"},
  {l:"7",v:"7"}, {l:"8",v:"8"}, {l:"9",v:"9"}, {l:"×",v:"×",c:"op"},
  {l:"4",v:"4"}, {l:"5",v:"5"}, {l:"6",v:"6"}, {l:"−",v:"-",c:"op"},
  {l:"1",v:"1"}, {l:"2",v:"2"}, {l:"3",v:"3"}, {l:"+",v:"+",c:"op"},
  {l:"DEL",v:"DEL",c:"func"}, {l:"0",v:"0"}, {l:".",v:"."}, {l:"=",v:"=",c:"equals"}
];
const SCI_EXTRA = [
  {l:"sin",v:"sin(",c:"func"}, {l:"cos",v:"cos(",c:"func"}, {l:"tan",v:"tan(",c:"func"}, {l:"DEG",v:"DEG",c:"func",id:"degToggle"},
  {l:"log",v:"log(",c:"func"}, {l:"ln",v:"ln(",c:"func"}, {l:"√",v:"sqrt(",c:"func"}, {l:"∛",v:"cbrt(",c:"func"},
  {l:"x²",v:"^2",c:"func"}, {l:"x³",v:"^3",c:"func"}, {l:"^",v:"^",c:"func"}, {l:"n!",v:"!",c:"func"},
  {l:"π",v:"π",c:"func"}, {l:"M+",v:"M+",c:"func"}, {l:"M-",v:"M-",c:"func"}, {l:"MR",v:"MR",c:"func"}
];

function buildKeyButton(def){
  const btn = document.createElement("button");
  btn.className = "key" + (def.c ? " " + def.c : "");
  btn.textContent = def.l;
  if(def.id) btn.id = def.id;
  btn.setAttribute("aria-label", def.l);
  btn.addEventListener("click", (e)=>{ addRipple(e, btn); pressKey(def.v); });
  return btn;
}

function renderKeypad(mode){
  const sciRow = document.getElementById("sciRow");
  const keypad = document.getElementById("keypad");
  keypad.innerHTML = "";
  sciRow.innerHTML = "";
  sciRow.style.display = mode === "scientific" ? "grid" : "none";
  if(mode === "scientific"){
    SCI_EXTRA.forEach(def => sciRow.appendChild(buildKeyButton(def)));
    updateAngleBtn();
  }
  BASIC_KEYS.forEach(def => keypad.appendChild(buildKeyButton(def)));
  document.getElementById("memBadge").classList.toggle("show", state.memory !== 0);
}

window.addEventListener("keydown", (e)=>{
  const activeView = document.querySelector(".view.active");
  if(!activeView || (activeView.id !== "view-basic" && activeView.id !== "view-scientific")) return;
  const map = { "*":"×", "/":"÷", "Enter":"=", "Backspace":"DEL", "Escape":"AC" };
  if(/^[0-9.+\-()%^!]$/.test(e.key)){ pressKey(e.key); }
  else if(map[e.key]){ pressKey(map[e.key]); }
});

/* ---------------- TOOLS ENGINE ---------------- */
const TOOLS = [
  { id:"percentage", icon:"％", name:"Percentage", cat:"basic",
    fields:[
      {id:"mode", label:"Mode", type:"select", options:[["of","X% of Y"],["what","X is what % of Y"],["change","% increase / decrease"]]},
      {id:"x", label:"X", type:"number"},
      {id:"y", label:"Y", type:"number"}
    ],
    compute:(v)=>{
      const x=+v.x||0, y=+v.y||0;
      if(v.mode==="of") return [{label:`${x}% of ${y}`, value:formatNumber(x/100*y), main:true}];
      if(v.mode==="what") return [{label:`${x} as % of ${y}`, value: y!==0 ? formatNumber(x/y*100)+"%" : "Error", main:true}];
      const diff = y-x; const pct = x!==0 ? (diff/x*100) : 0;
      return [
        {label:"Change", value:formatNumber(diff)},
        {label: diff>=0 ? "% Increase":"% Decrease", value:formatNumber(Math.abs(pct))+"%", main:true}
      ];
    }},
  { id:"gst", icon:"🧾", name:"GST Calculator", cat:"finance",
    fields:[
      {id:"type", label:"Type", type:"select", options:[["add","Add GST"],["remove","Remove GST"]]},
      {id:"amount", label:"Amount (₹)", type:"number"},
      {id:"rate", label:"GST Rate (%)", type:"select", options:[["5","5%"],["12","12%"],["18","18%"],["28","28%"]]}
    ],
    compute:(v)=>{
      const amt=+v.amount||0, rate=+v.rate||0;
      if(v.type==="add"){
        const gst = amt*rate/100, total = amt+gst;
        return [{label:"GST Amount", value:"₹"+formatNumber(gst)}, {label:"Total (incl. GST)", value:"₹"+formatNumber(total), main:true}];
      }
      const base = amt/(1+rate/100), gst = amt-base;
      return [{label:"GST Amount", value:"₹"+formatNumber(gst)}, {label:"Base Amount", value:"₹"+formatNumber(base), main:true}];
    }},
  { id:"emi", icon:"🏦", name:"EMI Calculator", cat:"finance",
    fields:[
      {id:"principal", label:"Loan Amount (₹)", type:"number"},
      {id:"rate", label:"Annual Interest (%)", type:"number"},
      {id:"months", label:"Tenure (months)", type:"number"}
    ],
    compute:(v)=>{
      const P=+v.principal||0, annual=+v.rate||0, n=+v.months||0;
      const r = annual/12/100;
      let emi;
      if(r===0) emi = n>0 ? P/n : 0;
      else emi = P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
      const total = emi*n, interest = total-P;
      return [
        {label:"Monthly EMI", value:"₹"+formatNumber(emi), main:true},
        {label:"Total Interest", value:"₹"+formatNumber(interest)},
        {label:"Total Payment", value:"₹"+formatNumber(total)}
      ];
    }},
  { id:"loan", icon:"💰", name:"Loan Calculator", cat:"finance",
    fields:[
      {id:"principal", label:"Loan Amount (₹)", type:"number"},
      {id:"rate", label:"Flat Interest Rate (% / yr)", type:"number"},
      {id:"years", label:"Tenure (years)", type:"number"}
    ],
    compute:(v)=>{
      const P=+v.principal||0, rate=+v.rate||0, y=+v.years||0;
      const interest = P*rate*y/100;
      const total = P+interest;
      const monthly = y>0 ? total/(y*12) : 0;
      return [
        {label:"Total Interest", value:"₹"+formatNumber(interest)},
        {label:"Total Payable", value:"₹"+formatNumber(total), main:true},
        {label:"Approx. Monthly Payment", value:"₹"+formatNumber(monthly)}
      ];
    }},
  { id:"age", icon:"🎂", name:"Age Calculator", cat:"utility",
    fields:[
      {id:"dob", label:"Date of Birth", type:"date"},
      {id:"asof", label:"As of Date", type:"date"}
    ],
    compute:(v)=>{
      if(!v.dob) return [{label:"Enter date of birth", value:"—", main:true}];
      const dob = new Date(v.dob);
      const asOf = v.asof ? new Date(v.asof) : new Date();
      let years = asOf.getFullYear()-dob.getFullYear();
      let months = asOf.getMonth()-dob.getMonth();
      let days = asOf.getDate()-dob.getDate();
      if(days<0){ months--; days += new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate(); }
      if(months<0){ years--; months+=12; }
      const totalDays = Math.floor((asOf-dob)/86400000);
      return [
        {label:"Age", value:`${years}y ${months}m ${days}d`, main:true},
        {label:"Total Days Lived", value:formatNumber(totalDays)}
      ];
    }},
  { id:"bmi", icon:"⚖️", name:"BMI Calculator", cat:"utility",
    fields:[
      {id:"weight", label:"Weight (kg)", type:"number"},
      {id:"height", label:"Height (cm)", type:"number"}
    ],
    compute:(v)=>{
      const w=+v.weight||0, h=(+v.height||0)/100;
      if(h<=0) return [{label:"Enter a valid height", value:"—", main:true}];
      const bmi = w/(h*h);
      let cat = "Normal";
      if(bmi<18.5) cat="Underweight"; else if(bmi<25) cat="Normal"; else if(bmi<30) cat="Overweight"; else cat="Obese";
      return [{label:"BMI", value:formatNumber(bmi), main:true}, {label:"Category", value:cat}];
    }},
  { id:"discount", icon:"🏷️", name:"Discount Calculator", cat:"finance",
    fields:[
      {id:"price", label:"Original Price (₹)", type:"number"},
      {id:"discount", label:"Discount (%)", type:"number"}
    ],
    compute:(v)=>{
      const p=+v.price||0, d=+v.discount||0;
      const savings = p*d/100, final = p-savings;
      return [{label:"You Save", value:"₹"+formatNumber(savings)}, {label:"Final Price", value:"₹"+formatNumber(final), main:true}];
    }},
  { id:"tip", icon:"🍽️", name:"Tip Calculator", cat:"finance",
    fields:[
      {id:"bill", label:"Bill Amount (₹)", type:"number"},
      {id:"tip", label:"Tip (%)", type:"number"},
      {id:"people", label:"Split Between", type:"number"}
    ],
    compute:(v)=>{
      const bill=+v.bill||0, tipPct=+v.tip||0, people=Math.max(1,+v.people||1);
      const tipAmt = bill*tipPct/100, total = bill+tipAmt;
      return [
        {label:"Tip Amount", value:"₹"+formatNumber(tipAmt)},
        {label:"Total Bill", value:"₹"+formatNumber(total), main:true},
        {label:"Per Person", value:"₹"+formatNumber(total/people)}
      ];
    }},
  { id:"dateDiff", icon:"📅", name:"Date Difference", cat:"utility",
    fields:[ {id:"d1", label:"Start Date", type:"date"}, {id:"d2", label:"End Date", type:"date"} ],
    compute:(v)=>{
      if(!v.d1 || !v.d2) return [{label:"Pick both dates", value:"—", main:true}];
      const a=new Date(v.d1), b=new Date(v.d2);
      const days = Math.round((b-a)/86400000);
      return [
        {label:"Total Days", value:formatNumber(Math.abs(days)), main:true},
        {label:"Weeks", value:formatNumber(Math.abs(days)/7)},
        {label:"Months (approx.)", value:formatNumber(Math.abs(days)/30.44)}
      ];
    }},
  { id:"timeCalc", icon:"⏱️", name:"Time Calculator", cat:"utility",
    fields:[
      {id:"t1", label:"Time 1 (hh:mm)", type:"time"},
      {id:"op", label:"Operation", type:"select", options:[["add","Add"],["sub","Subtract"]]},
      {id:"t2", label:"Time 2 (hh:mm)", type:"time"}
    ],
    compute:(v)=>{
      if(!v.t1 || !v.t2) return [{label:"Enter both times", value:"—", main:true}];
      const toMin = (s)=>{ const [h,m]=s.split(":").map(Number); return h*60+m; };
      let total = v.op==="add" ? toMin(v.t1)+toMin(v.t2) : toMin(v.t1)-toMin(v.t2);
      const neg = total<0; total = ((total%1440)+1440)%1440;
      const h = Math.floor(total/60), m = total%60;
      return [{label:"Result", value:`${neg?"-":""}${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`, main:true}];
    }},
  { id:"fuel", icon:"⛽", name:"Fuel Cost Calculator", cat:"utility",
    fields:[
      {id:"distance", label:"Distance (km)", type:"number"},
      {id:"mileage", label:"Mileage (km/l)", type:"number"},
      {id:"price", label:"Fuel Price (₹/l)", type:"number"}
    ],
    compute:(v)=>{
      const d=+v.distance||0, m=+v.mileage||0, p=+v.price||0;
      if(m<=0) return [{label:"Enter valid mileage", value:"—", main:true}];
      const litres = d/m, cost = litres*p;
      return [{label:"Fuel Needed", value:formatNumber(litres)+" L"}, {label:"Total Cost", value:"₹"+formatNumber(cost), main:true}];
    }},
  { id:"pnl", icon:"📈", name:"Profit & Loss", cat:"finance",
    fields:[ {id:"cp", label:"Cost Price (₹)", type:"number"}, {id:"sp", label:"Selling Price (₹)", type:"number"} ],
    compute:(v)=>{
      const cp=+v.cp||0, sp=+v.sp||0;
      const diff = sp-cp; const pct = cp!==0 ? (diff/cp*100) : 0;
      return [
        {label: diff>=0 ? "Profit":"Loss", value:"₹"+formatNumber(Math.abs(diff)), main:true},
        {label:"Percentage", value:formatNumber(Math.abs(pct))+"%"}
      ];
    }},
  { id:"si", icon:"➗", name:"Simple Interest", cat:"finance",
    fields:[
      {id:"principal", label:"Principal (₹)", type:"number"},
      {id:"rate", label:"Rate (% / yr)", type:"number"},
      {id:"time", label:"Time (years)", type:"number"}
    ],
    compute:(v)=>{
      const p=+v.principal||0, r=+v.rate||0, t=+v.time||0;
      const si = p*r*t/100;
      return [{label:"Simple Interest", value:"₹"+formatNumber(si), main:true}, {label:"Total Amount", value:"₹"+formatNumber(p+si)}];
    }},
  { id:"ci", icon:"📊", name:"Compound Interest", cat:"finance",
    fields:[
      {id:"principal", label:"Principal (₹)", type:"number"},
      {id:"rate", label:"Rate (% / yr)", type:"number"},
      {id:"time", label:"Time (years)", type:"number"},
      {id:"n", label:"Compounds / Year", type:"select", options:[["1","Yearly"],["2","Half-Yearly"],["4","Quarterly"],["12","Monthly"]]}
    ],
    compute:(v)=>{
      const p=+v.principal||0, r=+v.rate||0, t=+v.time||0, n=+v.n||1;
      const total = p*Math.pow(1+r/(100*n), n*t);
      const ci = total-p;
      return [{label:"Compound Interest", value:"₹"+formatNumber(ci), main:true}, {label:"Total Amount", value:"₹"+formatNumber(total)}];
    }},
  { id:"unit", icon:"📐", name:"Unit Converter", cat:"utility", custom:"unit" },
  { id:"currency", icon:"💱", name:"Currency Converter", cat:"finance", custom:"currency" }
];

const UNIT_GROUPS = {
  Length:{ base:"m", units:{ m:1, km:1000, cm:0.01, mm:0.001, mile:1609.34, yard:0.9144, foot:0.3048, inch:0.0254 } },
  Weight:{ base:"kg", units:{ kg:1, g:0.001, mg:0.000001, tonne:1000, pound:0.453592, ounce:0.0283495 } },
  Volume:{ base:"l", units:{ l:1, ml:0.001, gallon:3.78541, cup:0.24, tbsp:0.0147868, tsp:0.00492892 } },
  Temperature:{ special:true }
};

function convertTemp(val, from, to){
  let c;
  if(from==="C") c = val; else if(from==="F") c=(val-32)*5/9; else c = val-273.15;
  if(to==="C") return c; if(to==="F") return c*9/5+32; return c+273.15;
}

/* ---------------- TOOL PANEL RENDERING ---------------- */
let activeTool = null;

function openTool(id){
  activeTool = TOOLS.find(t=>t.id===id);
  if(!activeTool) return;
  document.querySelectorAll(".view, .tool-panel").forEach(v=>v.classList.remove("active"));
  document.getElementById("toolPanel").classList.add("active");
  document.getElementById("toolPanelTitle").textContent = activeTool.name;
  document.getElementById("glowSetter").style.setProperty("--glow",
    activeTool.cat==="finance" ? "var(--accent-finance)" : "var(--accent-utility)");
  const body = document.getElementById("toolBody");
  body.innerHTML = "";

  if(activeTool.custom === "unit"){ renderUnitTool(body); }
  else if(activeTool.custom === "currency"){ renderCurrencyTool(body); }
  else { renderGenericTool(body, activeTool); }
}

function closeTool(){
  activeTool = null;
  document.getElementById("toolPanel").classList.remove("active");
  showView("tools");
}

function renderGenericTool(body, tool){
  const values = {};
  tool.fields.forEach(f=>{
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = f.label;
    wrap.appendChild(label);
    let input;
    if(f.type === "select"){
      input = document.createElement("select");
      f.options.forEach(([val,txt])=>{
        const opt = document.createElement("option");
        opt.value = val; opt.textContent = txt;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement("input");
      input.type = f.type;
      if(f.type === "number") input.inputMode = "decimal";
    }
    input.addEventListener("input", ()=>{ values[f.id]=input.value; renderToolResult(tool, values, body); });
    wrap.appendChild(input);
    body.appendChild(wrap);
    values[f.id] = input.value;
  });
  const resultBox = document.createElement("div");
  resultBox.id = "toolResultBox";
  resultBox.className = "tool-result";
  body.appendChild(resultBox);
  renderToolResult(tool, values, body);
}

function renderToolResult(tool, values, body){
  const box = body.querySelector("#toolResultBox") || document.getElementById("toolResultBox");
  if(!box) return;
  let rows;
  try{ rows = tool.compute(values); }catch(e){ rows = [{label:"Error", value:"—", main:true}]; }
  box.innerHTML = "";
  rows.forEach(r=>{
    const row = document.createElement("div");
    row.className = "r-row" + (r.main ? " main" : "");
    if(r.main){
      const l = document.createElement("div"); l.style.fontSize="12px"; l.style.color="var(--text-dim)"; l.style.marginBottom="2px"; l.textContent=r.label;
      const v = document.createElement("div"); v.textContent = r.value;
      row.appendChild(l); row.appendChild(v);
    } else {
      const l = document.createElement("span"); l.className="r-label"; l.textContent=r.label;
      const v = document.createElement("span"); v.textContent = r.value;
      row.appendChild(l); row.appendChild(v);
    }
    box.appendChild(row);
  });
  const actions = document.createElement("div");
  actions.className = "action-row";
  actions.innerHTML = `
    <button class="pill-btn" id="toolCopyBtn">Copy</button>
    <button class="pill-btn" id="toolShareBtn">Share</button>
    <button class="pill-btn primary" id="toolSaveBtn">Save</button>`;
  box.appendChild(actions);
  const mainRow = rows.find(r=>r.main);
  const summary = `${tool.name}: ` + rows.map(r=>`${r.label} = ${r.value}`).join(", ");
  actions.querySelector("#toolCopyBtn").onclick = ()=>copyText(mainRow ? mainRow.value : summary);
  actions.querySelector("#toolShareBtn").onclick = ()=>shareText(summary);
  actions.querySelector("#toolSaveBtn").onclick = ()=>{ pushHistory(tool.name, mainRow ? mainRow.value : "", "tool"); toast(t("saved")); };
}

function renderUnitTool(body){
  const groupSel = document.createElement("select");
  Object.keys(UNIT_GROUPS).forEach(g=>{
    const opt = document.createElement("option"); opt.value=g; opt.textContent=g; groupSel.appendChild(opt);
  });
  const wrapG = document.createElement("div"); wrapG.className="field";
  wrapG.innerHTML = `<label>Category</label>`; wrapG.appendChild(groupSel);
  body.appendChild(wrapG);

  const row = document.createElement("div");
  row.style.display="flex"; row.style.gap="10px";
  const fromWrap = document.createElement("div"); fromWrap.className="field"; fromWrap.style.flex="1";
  const toWrap = document.createElement("div"); toWrap.className="field"; toWrap.style.flex="1";
  fromWrap.innerHTML = "<label>From</label>"; toWrap.innerHTML = "<label>To</label>";
  const fromSel = document.createElement("select"); const toSel = document.createElement("select");
  fromWrap.appendChild(fromSel); toWrap.appendChild(toSel);
  row.appendChild(fromWrap); row.appendChild(toWrap);
  body.appendChild(row);

  const valWrap = document.createElement("div"); valWrap.className="field";
  valWrap.innerHTML = "<label>Value</label>";
  const valInput = document.createElement("input"); valInput.type="number"; valInput.inputMode="decimal"; valInput.value="1";
  valWrap.appendChild(valInput);
  body.appendChild(valWrap);

  const resultBox = document.createElement("div"); resultBox.className="tool-result"; resultBox.id="unitResultBox";
  body.appendChild(resultBox);

  function populateUnits(){
    const g = UNIT_GROUPS[groupSel.value];
    fromSel.innerHTML = ""; toSel.innerHTML = "";
    const keys = g.special ? ["C","F","K"] : Object.keys(g.units);
    keys.forEach(u=>{
      fromSel.appendChild(new Option(u,u));
      toSel.appendChild(new Option(u,u));
    });
    toSel.selectedIndex = keys.length>1 ? 1 : 0;
    compute();
  }
  function compute(){
    const g = UNIT_GROUPS[groupSel.value];
    const val = parseFloat(valInput.value)||0;
    let out;
    if(g.special){ out = convertTemp(val, fromSel.value, toSel.value); }
    else {
      const baseVal = val * g.units[fromSel.value];
      out = baseVal / g.units[toSel.value];
    }
    resultBox.innerHTML = `<div class="r-row main"><span>${valInput.value||0} ${fromSel.value} =</span></div>
      <div class="r-row main"><span>${formatNumber(out)} ${toSel.value}</span></div>
      <div class="action-row">
        <button class="pill-btn" id="uCopy">Copy</button>
        <button class="pill-btn" id="uShare">Share</button>
        <button class="pill-btn primary" id="uSave">Save</button>
      </div>`;
    const txt = `${val} ${fromSel.value} = ${formatNumber(out)} ${toSel.value}`;
    resultBox.querySelector("#uCopy").onclick = ()=>copyText(txt);
    resultBox.querySelector("#uShare").onclick = ()=>shareText(txt);
    resultBox.querySelector("#uSave").onclick = ()=>{ pushHistory("Unit Convert", txt, "tool"); toast(t("saved")); };
  }
  groupSel.onchange = populateUnits;
  fromSel.onchange = compute; toSel.onchange = compute; valInput.oninput = compute;
  populateUnits();
}

/* ---------------- CURRENCY CONVERTER ---------------- */
const FALLBACK_RATES = { USD:1, INR:83.3, EUR:0.92, GBP:0.79, AED:3.67, JPY:151.5, AUD:1.5, CAD:1.36 };

async function getRates(){
  const cacheAge = state.currencyRatesTime ? Date.now()-state.currencyRatesTime : Infinity;
  if(state.currencyRates && cacheAge < 6*3600*1000) return { rates: state.currencyRates, offline:false, cached:true };
  try{
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if(data && data.rates){
      state.currencyRates = data.rates;
      state.currencyRatesTime = Date.now();
      saveState();
      return { rates: data.rates, offline:false, cached:false };
    }
    throw new Error("bad response");
  }catch(e){
    return { rates: state.currencyRates || FALLBACK_RATES, offline:true, cached:!!state.currencyRates };
  }
}

function renderCurrencyTool(body){
  body.innerHTML = `<div class="field" id="curStatus" style="font-size:12px;color:var(--text-dim)">Loading rates…</div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>From</label><select id="curFrom"></select></div>
      <div class="field" style="flex:1"><label>To</label><select id="curTo"></select></div>
    </div>
    <div class="field"><label>Amount</label><input type="number" id="curAmount" inputmode="decimal" value="1"></div>
    <div class="tool-result" id="curResultBox"></div>`;

  getRates().then(({rates, offline, cached})=>{
    const status = document.getElementById("curStatus");
    status.textContent = offline
      ? (cached ? "Offline — showing last saved rates" : "Offline — showing built-in reference rates")
      : "Live rates updated";
    const codes = Object.keys(rates).sort();
    const fromSel = document.getElementById("curFrom"), toSel = document.getElementById("curTo");
    codes.forEach(c=>{ fromSel.appendChild(new Option(c,c)); toSel.appendChild(new Option(c,c)); });
    fromSel.value = "USD"; toSel.value = "INR";
    const amtInput = document.getElementById("curAmount");
    const resultBox = document.getElementById("curResultBox");

    function compute(){
      const amt = parseFloat(amtInput.value)||0;
      const from = fromSel.value, to = toSel.value;
      const out = amt / rates[from] * rates[to];
      resultBox.innerHTML = `<div class="r-row main"><span>${formatNumber(out)} ${to}</span></div>
        <div class="action-row">
          <button class="pill-btn" id="cCopy">Copy</button>
          <button class="pill-btn" id="cShare">Share</button>
          <button class="pill-btn primary" id="cSave">Save</button>
        </div>`;
      const txt = `${amt} ${from} = ${formatNumber(out)} ${to}`;
      resultBox.querySelector("#cCopy").onclick = ()=>copyText(txt);
      resultBox.querySelector("#cShare").onclick = ()=>shareText(txt);
      resultBox.querySelector("#cSave").onclick = ()=>{ pushHistory("Currency Convert", txt, "tool"); toast(t("saved")); };
    }
    fromSel.onchange = compute; toSel.onchange = compute; amtInput.oninput = compute;
    compute();
  });
}

/* ---------------- TOOL GRID / SEARCH ---------------- */
function renderToolGrid(filter=""){
  const grid = document.getElementById("toolGrid");
  grid.innerHTML = "";
  TOOLS.filter(tool => tool.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach(tool=>{
      const card = document.createElement("button");
      card.className = "tool-card";
      card.innerHTML = `<span class="t-icon">${tool.icon}</span><span class="t-name">${tool.name}</span><span class="t-cat">${tool.cat}</span>`;
      card.addEventListener("click", ()=>openTool(tool.id));
      grid.appendChild(card);
    });
}

/* ---------------- HISTORY ---------------- */
function pushHistory(expr, result, kind){
  state.history.unshift({ id: Date.now()+Math.random(), expr, result, kind, ts: new Date().toISOString() });
  state.history = state.history.slice(0, 300);
  saveState();
  renderHistory();
}

function renderHistory(filter=""){
  const list = document.getElementById("historyList");
  list.innerHTML = "";
  const items = state.history.filter(h => (h.expr+h.result).toLowerCase().includes(filter.toLowerCase()));
  if(items.length===0){
    list.innerHTML = `<div class="empty-state">${t("noHistory")}</div>`;
    return;
  }
  items.forEach(h=>{
    const isFav = state.favorites.includes(h.id);
    const el = document.createElement("div");
    el.className = "history-item";
    const time = new Date(h.ts).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
    el.innerHTML = `<div class="h-expr">${h.expr}</div>
      <div class="h-result">${h.result}</div>
      <div class="h-meta"><span class="h-time">${time}</span>
        <span>
          <button class="icon-btn" style="width:30px;height:30px;display:inline-flex" data-act="fav">${isFav ? "★" : "☆"}</button>
          <button class="icon-btn" style="width:30px;height:30px;display:inline-flex" data-act="copy">⧉</button>
        </span>
      </div>`;
    el.querySelector('[data-act="copy"]').onclick = ()=>copyText(h.result);
    el.querySelector('[data-act="fav"]').onclick = ()=>{
      if(isFav) state.favorites = state.favorites.filter(id=>id!==h.id);
      else state.favorites.push(h.id);
      saveState(); renderHistory(filter);
    };
    list.appendChild(el);
  });
}

function clearHistory(){
  state.history = []; state.favorites = [];
  saveState(); renderHistory();
  toast(t("clearHistory"));
}

function exportCsv(){
  const rows = [["Type","Expression","Result","Time"]];
  state.history.forEach(h=>rows.push([h.kind, h.expr, h.result, h.ts]));
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "calcura-history.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(){
  const w = window.open("", "_blank");
  const rows = state.history.map(h=>`<tr><td>${h.kind}</td><td>${h.expr}</td><td>${h.result}</td><td>${new Date(h.ts).toLocaleString()}</td></tr>`).join("");
  w.document.write(`<html><head><title>Calcura History</title>
    <style>body{font-family:sans-serif;padding:24px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}</style>
    </head><body><h2>Calcura — Calculation History</h2><table><tr><th>Type</th><th>Expression</th><th>Result</th><th>Time</th></tr>${rows}</table>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ---------------- VOICE ---------------- */
function speakResult(text){
  if(!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(String(text).replace(/,/g,""));
  u.lang = state.language === "hi" ? "hi-IN" : "en-IN";
  speechSynthesis.speak(u);
}

function startVoiceInput(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ toast("Voice input not supported on this browser"); return; }
  const rec = new SR();
  rec.lang = state.language === "hi" ? "hi-IN" : "en-IN";
  rec.interimResults = false;
  toast("Listening…");
  rec.onresult = (e)=>{
    const said = e.results[0][0].transcript.toLowerCase();
    const parsed = said
      .replace(/plus|add/g,"+").replace(/minus|subtract/g,"-")
      .replace(/times|multiplied by|into/g,"×").replace(/divided by|divide/g,"÷")
      .replace(/percent/g,"%").replace(/point/g,".")
      .replace(/[^0-9+\-×÷.%() ]/g,"").trim();
    if(parsed){ currentExpr += parsed.replace(/\s+/g,""); refreshDisplay(); }
    else toast("Could not understand");
  };
  rec.onerror = ()=>toast("Voice input error");
  rec.start();
}

/* ---------------- VIEW / NAV ---------------- */
function showView(mode){
  document.querySelectorAll(".view, .tool-panel").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.mode===mode));
  document.querySelectorAll(".mode-switch button").forEach(b=>b.classList.toggle("active", b.dataset.mode===mode));

  const glow = mode==="tools" ? "var(--accent-finance)" : "var(--accent-basic)";
  document.getElementById("glowSetter").style.setProperty("--glow", glow);

  if(mode==="basic"){ document.getElementById("view-basic").classList.add("active"); renderKeypad("basic"); }
  else if(mode==="scientific"){ document.getElementById("view-basic").classList.add("active"); renderKeypad("scientific"); }
  else if(mode==="tools"){ document.getElementById("view-tools").classList.add("active"); renderToolGrid(); }
  else if(mode==="history"){ document.getElementById("view-history").classList.add("active"); renderHistory(); }
}

/* ---------------- SETTINGS ---------------- */
function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.theme);
  document.documentElement.setAttribute("data-color", state.color);
}
function openSettings(){
  document.getElementById("sheetBackdrop").classList.add("show");
  document.getElementById("settingsSheet").classList.add("show");
  document.getElementById("darkToggle").classList.toggle("on", state.theme==="dark");
  document.getElementById("langToggle").classList.toggle("on", state.language==="hi");
  document.querySelectorAll(".swatch").forEach(s=>s.classList.toggle("active", s.dataset.color===state.color));
}
function closeSettings(){
  document.getElementById("sheetBackdrop").classList.remove("show");
  document.getElementById("settingsSheet").classList.remove("show");
}

/* ---------------- BOOTSTRAP ---------------- */
function refreshChrome(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.getElementById("historySearch").placeholder = t("search");
}

function init(){
  applyTheme();

  document.querySelectorAll(".mode-switch button, .nav-btn").forEach(b=>{
    b.addEventListener("click", ()=>showView(b.dataset.mode));
  });

  document.getElementById("backBtn").addEventListener("click", closeTool);
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("sheetBackdrop").addEventListener("click", closeSettings);
  document.getElementById("darkToggle").addEventListener("click", ()=>{
    state.theme = state.theme==="dark" ? "light" : "dark"; saveState(); applyTheme();
    document.getElementById("darkToggle").classList.toggle("on", state.theme==="dark");
  });
  document.getElementById("langToggle").addEventListener("click", ()=>{
    state.language = state.language==="en" ? "hi" : "en"; saveState();
    document.getElementById("langToggle").classList.toggle("on", state.language==="hi");
    refreshChrome();
  });
  document.querySelectorAll(".swatch").forEach(s=>{
    s.addEventListener("click", ()=>{
      state.color = s.dataset.color; saveState(); applyTheme();
      document.querySelectorAll(".swatch").forEach(x=>x.classList.remove("active"));
      s.classList.add("active");
    });
  });

  document.getElementById("clearHistoryBtn").addEventListener("click", clearHistory);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("exportPdfBtn").addEventListener("click", exportPdf);
  document.getElementById("historySearch").addEventListener("input", (e)=>renderHistory(e.target.value));
  document.getElementById("toolSearch").addEventListener("input", (e)=>renderToolGrid(e.target.value));
  document.getElementById("voiceBtn").addEventListener("click", startVoiceInput);

  refreshChrome();
  showView("basic");

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }
}

document.addEventListener("DOMContentLoaded", init);
