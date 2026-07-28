/* =========================================================
   BharatCalc — script.js
   Modular, dependency-free calculator engine.
   Sections: State | Utils | Math Engine | Basic/Sci UI |
             Tools Engine | Currency | Voice | History |
             Settings | Bootstrap
   ========================================================= */

/* ---------------- STATE ---------------- */
const STORAGE_KEY = "calcura.state.v1";

const defaultState = {
  theme: "light",
  color: "violet",
  language: "en",
  angleMode: "deg",
  memory: 0,
  history: [],
  favorites: [],
  favoriteTools: [],
  recentTools: [],
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
       share:"Share", save:"Save", favorite:"Favorite", saved:"Saved to history",
       shareApp:"Share App", rateUs:"Rate Us", contactUs:"Contact Us",
       aboutUs:"About Us", privacyPolicy:"Privacy Policy", terms:"Terms & Conditions" },
  hi:{ basic:"बेसिक", scientific:"वैज्ञानिक", tools:"टूल्स", history:"इतिहास",
       clearHistory:"इतिहास साफ़ करें", noHistory:"अभी तक कोई गणना नहीं",
       settings:"सेटिंग्स", darkMode:"डार्क मोड", language:"भाषा",
       copied:"क्लिपबोर्ड पर कॉपी हुआ", exportCsv:"CSV निर्यात करें", exportPdf:"PDF निर्यात करें",
       search:"इतिहास खोजें…", back:"वापस", calculate:"परिणाम", copy:"कॉपी करें",
       share:"शेयर करें", save:"सेव करें", favorite:"पसंदीदा", saved:"इतिहास में सेव हुआ",
       shareApp:"ऐप शेयर करें", rateUs:"रेट करें", contactUs:"संपर्क करें",
       aboutUs:"हमारे बारे में", privacyPolicy:"गोपनीयता नीति", terms:"नियम व शर्तें" }
};
function t(key){ return (STR[state.language] && STR[state.language][key]) || STR.en[key] || key; }
// Inline bilingual helper for tool-specific text (field labels, options, result labels).
function L(en, hi){ return state.language === "hi" ? hi : en; }

/* ---------------- UTILS ---------------- */
function vibrate(ms=12){ if(navigator.vibrate) navigator.vibrate(ms); }

let toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.onclick = null;
  el.style.cursor = "default";
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
  const str = String(txt);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(str).then(()=>{ toast(t("copied")); vibrate(); })
      .catch(()=>legacyCopy(str));
  } else {
    legacyCopy(str);
  }
}
function legacyCopy(str){
  // Fallback for WebViews (e.g. inside an APK) that don't expose navigator.clipboard.
  try{
    const ta = document.createElement("textarea");
    ta.value = str;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if(ok){ toast(t("copied")); vibrate(); }
    else { toast(L(`Copy failed — long-press to copy: ${str}`,`कॉपी नहीं हुआ — कॉपी के लिए दबाकर रखें: ${str}`)); }
  }catch(e){
    toast(L(`Copy failed — long-press to copy: ${str}`,`कॉपी नहीं हुआ — कॉपी के लिए दबाकर रखें: ${str}`));
  }
}
function shareText(txt){
  try{
    if(navigator.share){
      navigator.share({ text: String(txt) }).catch(()=>copyText(txt));
    } else {
      copyText(txt);
    }
  }catch(e){
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
/* ---------------- CATEGORY TAXONOMY ---------------- */
const CATS = {
  finance:      { en:"Finance",      hi:"वित्त",       color:"#1FE0A8" },
  tax:          { en:"Tax",          hi:"टैक्स",       color:"#FF7A59" },
  investment:   { en:"Investment",   hi:"निवेश",       color:"#3E9CFF" },
  loan:         { en:"Loan",         hi:"लोन",         color:"#7C5CFF" },
  banking:      { en:"Banking",      hi:"बैंकिंग",      color:"#00B8D9" },
  business:     { en:"Business",     hi:"व्यवसाय",      color:"#FFB648" },
  health:       { en:"Health",       hi:"स्वास्थ्य",     color:"#FF5C93" },
  education:    { en:"Education",    hi:"शिक्षा",       color:"#8E6CFF" },
  dailylife:    { en:"Daily Life",   hi:"रोज़मर्रा",     color:"#36B37E" },
  math:         { en:"Math",         hi:"गणित",        color:"#6554C0" },
  construction: { en:"Construction", hi:"निर्माण",      color:"#C0771D" },
  automobile:   { en:"Automobile",   hi:"वाहन",        color:"#DE350B" },
  utility:      { en:"Utility",      hi:"उपयोगिता",     color:"#5E6C84" },
  agriculture:  { en:"Agriculture",  hi:"कृषि",         color:"#4CAF50" }
};
function catLabel(key){ const c = CATS[key]; if(!c) return key; return L(c.en, c.hi); }
function catColor(key){ return (CATS[key] && CATS[key].color) || "var(--accent-basic)"; }

const TOOLS = [
  { id:"percentage", icon:"％", get name(){ return L("Percentage","प्रतिशत"); }, cat:"math",
    get fields(){ return [
      {id:"mode", label:L("Mode","मोड"), type:"select", options:[
        ["of", L("X% of Y","X% ka Y")],
        ["what", L("X is what % of Y","X, Y ka kitna % hai")],
        ["change", L("% increase / decrease","% badhna / ghatna")]
      ]},
      {id:"x", label:"X", type:"number"},
      {id:"y", label:"Y", type:"number"}
    ]; },
    compute:(v)=>{
      const x=+v.x||0, y=+v.y||0;
      if(v.mode==="of") return [{label:L(`${x}% of ${y}`,`${x}% ka ${y}`), value:formatNumber(x/100*y), main:true}];
      if(v.mode==="what") return [{label:L(`${x} as % of ${y}`,`${x}, ${y} ka %`), value: y!==0 ? formatNumber(x/y*100)+"%" : "Error", main:true}];
      const diff = y-x; const pct = x!==0 ? (diff/x*100) : 0;
      return [
        {label:L("Change","बदलाव"), value:formatNumber(diff)},
        {label: diff>=0 ? L("% Increase","% बढ़ोतरी") : L("% Decrease","% कमी"), value:formatNumber(Math.abs(pct))+"%", main:true}
      ];
    }},
  { id:"gst", icon:"🧾", get name(){ return L("GST Calculator","GST कैलकुलेटर"); }, cat:"tax",
    get fields(){ return [
      {id:"type", label:L("Type","प्रकार"), type:"select", options:[["add",L("Add GST","GST जोड़ें")],["remove",L("Remove GST","GST हटाएं")]]},
      {id:"amount", label:L("Amount (₹)","राशि (₹)"), type:"number"},
      {id:"rate", label:L("GST Rate (%)","GST दर (%)"), type:"select", options:[["5","5%"],["12","12%"],["18","18%"],["28","28%"]]}
    ]; },
    compute:(v)=>{
      const amt=+v.amount||0, rate=+v.rate||0;
      if(v.type==="add"){
        const gst = amt*rate/100, total = amt+gst;
        return [{label:L("GST Amount","GST राशि"), value:"₹"+formatNumber(gst)}, {label:L("Total (incl. GST)","कुल (GST सहित)"), value:"₹"+formatNumber(total), main:true}];
      }
      const base = amt/(1+rate/100), gst = amt-base;
      return [{label:L("GST Amount","GST राशि"), value:"₹"+formatNumber(gst)}, {label:L("Base Amount","मूल राशि"), value:"₹"+formatNumber(base), main:true}];
    }},
  { id:"emi", icon:"🏦", get name(){ return L("EMI Calculator","EMI कैलकुलेटर"); }, cat:"loan",
    get fields(){ return [
      {id:"principal", label:L("Loan Amount (₹)","लोन राशि (₹)"), type:"number"},
      {id:"rate", label:L("Annual Interest (%)","वार्षिक ब्याज (%)"), type:"number"},
      {id:"months", label:L("Tenure (months)","अवधि (महीने)"), type:"number"}
    ]; },
    compute:(v)=>{
      const P=+v.principal||0, annual=+v.rate||0, n=+v.months||0;
      const r = annual/12/100;
      let emi;
      if(r===0) emi = n>0 ? P/n : 0;
      else emi = P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
      const total = emi*n, interest = total-P;
      return [
        {label:L("Monthly EMI","मासिक EMI"), value:"₹"+formatNumber(emi), main:true},
        {label:L("Total Interest","कुल ब्याज"), value:"₹"+formatNumber(interest)},
        {label:L("Total Payment","कुल भुगतान"), value:"₹"+formatNumber(total)}
      ];
    }},
  { id:"loan", icon:"💰", get name(){ return L("Loan Calculator","लोन कैलकुलेटर"); }, cat:"loan",
    get fields(){ return [
      {id:"principal", label:L("Loan Amount (₹)","लोन राशि (₹)"), type:"number"},
      {id:"rate", label:L("Flat Interest Rate (% / yr)","फ्लैट ब्याज दर (% / वर्ष)"), type:"number"},
      {id:"years", label:L("Tenure (years)","अवधि (वर्ष)"), type:"number"}
    ]; },
    compute:(v)=>{
      const P=+v.principal||0, rate=+v.rate||0, y=+v.years||0;
      const interest = P*rate*y/100;
      const total = P+interest;
      const monthly = y>0 ? total/(y*12) : 0;
      return [
        {label:L("Total Interest","कुल ब्याज"), value:"₹"+formatNumber(interest)},
        {label:L("Total Payable","कुल देय राशि"), value:"₹"+formatNumber(total), main:true},
        {label:L("Approx. Monthly Payment","लगभग मासिक भुगतान"), value:"₹"+formatNumber(monthly)}
      ];
    }},
  { id:"age", icon:"🎂", get name(){ return L("Age Calculator","आयु कैलकुलेटर"); }, cat:"dailylife",
    get fields(){ return [
      {id:"dob", label:L("Date of Birth","जन्म तिथि"), type:"date"},
      {id:"asof", label:L("As of Date","किस तारीख तक"), type:"date"}
    ]; },
    compute:(v)=>{
      if(!v.dob) return [{label:L("Enter date of birth","जन्म तिथि दर्ज करें"), value:"—", main:true}];
      const dob = new Date(v.dob);
      const asOf = v.asof ? new Date(v.asof) : new Date();
      let years = asOf.getFullYear()-dob.getFullYear();
      let months = asOf.getMonth()-dob.getMonth();
      let days = asOf.getDate()-dob.getDate();
      if(days<0){ months--; days += new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate(); }
      if(months<0){ years--; months+=12; }
      const totalDays = Math.floor((asOf-dob)/86400000);
      return [
        {label:L("Age","आयु"), value:L(`${years}y ${months}m ${days}d`, `${years} वर्ष ${months} माह ${days} दिन`), main:true},
        {label:L("Total Days Lived","कुल जीवित दिन"), value:formatNumber(totalDays)}
      ];
    }},
  { id:"bmi", icon:"⚖️", get name(){ return L("BMI Calculator","BMI कैलकुलेटर"); }, cat:"health",
    get fields(){ return [
      {id:"weight", label:L("Weight (kg)","वजन (kg)"), type:"number"},
      {id:"height", label:L("Height (cm)","लंबाई (cm)"), type:"number"}
    ]; },
    compute:(v)=>{
      const w=+v.weight||0, h=(+v.height||0)/100;
      if(h<=0) return [{label:L("Enter a valid height","सही लंबाई दर्ज करें"), value:"—", main:true}];
      const bmi = w/(h*h);
      let cat = L("Normal","सामान्य");
      if(bmi<18.5) cat=L("Underweight","कम वजन"); else if(bmi<25) cat=L("Normal","सामान्य"); else if(bmi<30) cat=L("Overweight","ज़्यादा वजन"); else cat=L("Obese","मोटापा");
      return [{label:"BMI", value:formatNumber(bmi), main:true}, {label:L("Category","श्रेणी"), value:cat}];
    }},
  { id:"discount", icon:"🏷️", get name(){ return L("Discount Calculator","डिस्काउंट कैलकुलेटर"); }, cat:"dailylife",
    get fields(){ return [
      {id:"price", label:L("Original Price (₹)","मूल कीमत (₹)"), type:"number"},
      {id:"discount", label:L("Discount (%)","छूट (%)"), type:"number"}
    ]; },
    compute:(v)=>{
      const p=+v.price||0, d=+v.discount||0;
      const savings = p*d/100, final = p-savings;
      return [{label:L("You Save","आपकी बचत"), value:"₹"+formatNumber(savings)}, {label:L("Final Price","अंतिम कीमत"), value:"₹"+formatNumber(final), main:true}];
    }},
  { id:"tip", icon:"🍽️", get name(){ return L("Tip Calculator","टिप कैलकुलेटर"); }, cat:"dailylife",
    get fields(){ return [
      {id:"bill", label:L("Bill Amount (₹)","बिल राशि (₹)"), type:"number"},
      {id:"tip", label:L("Tip (%)","टिप (%)"), type:"number"},
      {id:"people", label:L("Split Between","लोगों में बांटें"), type:"number"}
    ]; },
    compute:(v)=>{
      const bill=+v.bill||0, tipPct=+v.tip||0, people=Math.max(1,+v.people||1);
      const tipAmt = bill*tipPct/100, total = bill+tipAmt;
      return [
        {label:L("Tip Amount","टिप राशि"), value:"₹"+formatNumber(tipAmt)},
        {label:L("Total Bill","कुल बिल"), value:"₹"+formatNumber(total), main:true},
        {label:L("Per Person","प्रति व्यक्ति"), value:"₹"+formatNumber(total/people)}
      ];
    }},
  { id:"dateDiff", icon:"📅", get name(){ return L("Date Difference","दिनांक अंतर"); }, cat:"dailylife",
    get fields(){ return [ {id:"d1", label:L("Start Date","शुरुआत तिथि"), type:"date"}, {id:"d2", label:L("End Date","अंतिम तिथि"), type:"date"} ]; },
    compute:(v)=>{
      if(!v.d1 || !v.d2) return [{label:L("Pick both dates","दोनों तारीखें चुनें"), value:"—", main:true}];
      const a=new Date(v.d1), b=new Date(v.d2);
      const days = Math.round((b-a)/86400000);
      return [
        {label:L("Total Days","कुल दिन"), value:formatNumber(Math.abs(days)), main:true},
        {label:L("Weeks","सप्ताह"), value:formatNumber(Math.abs(days)/7)},
        {label:L("Months (approx.)","महीने (लगभग)"), value:formatNumber(Math.abs(days)/30.44)}
      ];
    }},
  { id:"timeCalc", icon:"⏱️", get name(){ return L("Time Calculator","समय कैलकुलेटर"); }, cat:"dailylife",
    get fields(){ return [
      {id:"t1", label:L("Time 1 (hh:mm)","समय 1 (hh:mm)"), type:"time"},
      {id:"op", label:L("Operation","ऑपरेशन"), type:"select", options:[["add",L("Add","जोड़ें")],["sub",L("Subtract","घटाएं")]]},
      {id:"t2", label:L("Time 2 (hh:mm)","समय 2 (hh:mm)"), type:"time"}
    ]; },
    compute:(v)=>{
      if(!v.t1 || !v.t2) return [{label:L("Enter both times","दोनों समय दर्ज करें"), value:"—", main:true}];
      const toMin = (s)=>{ const [h,m]=s.split(":").map(Number); return h*60+m; };
      let total = v.op==="add" ? toMin(v.t1)+toMin(v.t2) : toMin(v.t1)-toMin(v.t2);
      const neg = total<0; total = ((total%1440)+1440)%1440;
      const h = Math.floor(total/60), m = total%60;
      return [{label:L("Result","परिणाम"), value:`${neg?"-":""}${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`, main:true}];
    }},
  { id:"fuel", icon:"⛽", get name(){ return L("Fuel Cost Calculator","ईंधन लागत कैलकुलेटर"); }, cat:"automobile",
    get fields(){ return [
      {id:"distance", label:L("Distance (km)","दूरी (km)"), type:"number"},
      {id:"mileage", label:L("Mileage (km/l)","माइलेज (km/l)"), type:"number"},
      {id:"price", label:L("Fuel Price (₹/l)","ईंधन कीमत (₹/l)"), type:"number"}
    ]; },
    compute:(v)=>{
      const d=+v.distance||0, m=+v.mileage||0, p=+v.price||0;
      if(m<=0) return [{label:L("Enter valid mileage","सही माइलेज दर्ज करें"), value:"—", main:true}];
      const litres = d/m, cost = litres*p;
      return [{label:L("Fuel Needed","ज़रूरी ईंधन"), value:formatNumber(litres)+" L"}, {label:L("Total Cost","कुल लागत"), value:"₹"+formatNumber(cost), main:true}];
    }},
  { id:"pnl", icon:"📈", get name(){ return L("Profit & Loss","लाभ व हानि"); }, cat:"business",
    get fields(){ return [ {id:"cp", label:L("Cost Price (₹)","लागत मूल्य (₹)"), type:"number"}, {id:"sp", label:L("Selling Price (₹)","विक्रय मूल्य (₹)"), type:"number"} ]; },
    compute:(v)=>{
      const cp=+v.cp||0, sp=+v.sp||0;
      const diff = sp-cp; const pct = cp!==0 ? (diff/cp*100) : 0;
      return [
        {label: diff>=0 ? L("Profit","लाभ") : L("Loss","हानि"), value:"₹"+formatNumber(Math.abs(diff)), main:true},
        {label:L("Percentage","प्रतिशत"), value:formatNumber(Math.abs(pct))+"%"}
      ];
    }},
  { id:"si", icon:"➗", get name(){ return L("Simple Interest","साधारण ब्याज"); }, cat:"finance",
    get fields(){ return [
      {id:"principal", label:L("Principal (₹)","मूलधन (₹)"), type:"number"},
      {id:"rate", label:L("Rate (% / yr)","दर (% / वर्ष)"), type:"number"},
      {id:"time", label:L("Time (years)","समय (वर्ष)"), type:"number"}
    ]; },
    compute:(v)=>{
      const p=+v.principal||0, r=+v.rate||0, t=+v.time||0;
      const si = p*r*t/100;
      return [{label:L("Simple Interest","साधारण ब्याज"), value:"₹"+formatNumber(si), main:true}, {label:L("Total Amount","कुल राशि"), value:"₹"+formatNumber(p+si)}];
    }},
  { id:"ci", icon:"📊", get name(){ return L("Compound Interest","चक्रवृद्धि ब्याज"); }, cat:"investment",
    get fields(){ return [
      {id:"principal", label:L("Principal (₹)","मूलधन (₹)"), type:"number"},
      {id:"rate", label:L("Rate (% / yr)","दर (% / वर्ष)"), type:"number"},
      {id:"time", label:L("Time (years)","समय (वर्ष)"), type:"number"},
      {id:"n", label:L("Compounds / Year","चक्रवृद्धि / वर्ष"), type:"select", options:[["1",L("Yearly","वार्षिक")],["2",L("Half-Yearly","अर्धवार्षिक")],["4",L("Quarterly","तिमाही")],["12",L("Monthly","मासिक")]]}
    ]; },
    compute:(v)=>{
      const p=+v.principal||0, r=+v.rate||0, t=+v.time||0, n=+v.n||1;
      const total = p*Math.pow(1+r/(100*n), n*t);
      const ci = total-p;
      return [{label:L("Compound Interest","चक्रवृद्धि ब्याज"), value:"₹"+formatNumber(ci), main:true}, {label:L("Total Amount","कुल राशि"), value:"₹"+formatNumber(total)}];
    }},
  { id:"unit", icon:"📐", get name(){ return L("Unit Converter","यूनिट परिवर्तक"); }, cat:"utility", custom:"unit" },
  { id:"currency", icon:"💱", get name(){ return L("Currency Converter","मुद्रा परिवर्तक"); }, cat:"finance", custom:"currency" },

  /* ---- NEW: Tax ---- */
  { id:"incomeTax", icon:"🧮", get name(){ return L("Income Tax Calculator","आयकर कैलकुलेटर"); }, cat:"tax",
    get fields(){ return [
      {id:"income", label:L("Annual Income (₹)","वार्षिक आय (₹)"), type:"number"},
      {id:"regime", label:L("Tax Regime","कर व्यवस्था"), type:"select", options:[["new",L("New Regime","नई व्यवस्था")],["old",L("Old Regime","पुरानी व्यवस्था")]]},
      {id:"deductions", label:L("Deductions (₹, old regime only)","कटौती (₹, केवल पुरानी व्यवस्था)"), type:"number"}
    ]; },
    compute:(v)=>{
      const income = +v.income||0;
      const ded = v.regime==="old" ? (+v.deductions||0) : 0;
      const taxable = Math.max(0, income - ded - (v.regime==="old" ? 50000 : 75000));
      let tax = 0;
      if(v.regime==="new"){
        const slabs = [[400000,0],[800000,0.05],[1200000,0.10],[1600000,0.15],[2000000,0.20],[2400000,0.25],[Infinity,0.30]];
        let prev = 0;
        for(const [limit, rate] of slabs){ tax += Math.max(0, Math.min(taxable,limit)-prev)*rate; prev = limit; if(taxable<=limit) break; }
      } else {
        const slabs = [[250000,0],[500000,0.05],[1000000,0.20],[Infinity,0.30]];
        let prev = 0;
        for(const [limit, rate] of slabs){ tax += Math.max(0, Math.min(taxable,limit)-prev)*rate; prev = limit; if(taxable<=limit) break; }
      }
      const cess = tax*0.04;
      return [
        {label:L("Taxable Income","कर योग्य आय"), value:"₹"+formatNumber(taxable)},
        {label:L("Income Tax","आयकर"), value:"₹"+formatNumber(tax)},
        {label:L("Health & Education Cess (4%)","स्वास्थ्य व शिक्षा उपकर (4%)"), value:"₹"+formatNumber(cess)},
        {label:L("Total Tax Payable","कुल देय कर"), value:"₹"+formatNumber(tax+cess), main:true}
      ];
    }},
  { id:"hra", icon:"🏠", get name(){ return L("HRA Calculator","HRA कैलकुलेटर"); }, cat:"tax",
    get fields(){ return [
      {id:"basic", label:L("Basic Salary (monthly ₹)","मूल वेतन (मासिक ₹)"), type:"number"},
      {id:"hraReceived", label:L("HRA Received (monthly ₹)","प्राप्त HRA (मासिक ₹)"), type:"number"},
      {id:"rent", label:L("Rent Paid (monthly ₹)","किराया (मासिक ₹)"), type:"number"},
      {id:"metro", label:L("City Type","शहर प्रकार"), type:"select", options:[["metro",L("Metro","मेट्रो")],["nonmetro",L("Non-Metro","गैर-मेट्रो")]]}
    ]; },
    compute:(v)=>{
      const basic=+v.basic||0, hra=+v.hraReceived||0, rent=+v.rent||0;
      const pctBasic = v.metro==="metro" ? 0.5 : 0.4;
      const exemptions = [hra, Math.max(0, rent-0.1*basic), basic*pctBasic];
      const exempt = Math.max(0, Math.min(...exemptions));
      return [
        {label:L("HRA Exemption","HRA छूट"), value:"₹"+formatNumber(exempt), main:true},
        {label:L("Taxable HRA","कर योग्य HRA"), value:"₹"+formatNumber(Math.max(0,hra-exempt))}
      ];
    }},

  /* ---- NEW: Investment ---- */
  { id:"epf", icon:"🏛️", get name(){ return L("EPF Calculator","EPF कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"basic", label:L("Basic Salary (monthly ₹)","मूल वेतन (मासिक ₹)"), type:"number"},
      {id:"age", label:L("Current Age","वर्तमान आयु"), type:"number"},
      {id:"retireAge", label:L("Retirement Age","सेवानिवृत्ति आयु"), type:"number"},
      {id:"rate", label:L("Annual Interest (%)","वार्षिक ब्याज (%)"), type:"number"}
    ]; },
    compute:(v)=>{
      const basic=+v.basic||0, age=+v.age||0, retireAge=+v.retireAge||0, rate=+v.rate||0;
      const months = Math.max(0,(retireAge-age)*12);
      const monthlyContribution = basic*0.24; // 12% employee + 12% employer (simplified)
      const r = rate/12/100;
      let corpus = 0;
      for(let i=0;i<months;i++){ corpus = (corpus+monthlyContribution)*(1+r); }
      return [
        {label:L("Total Months","कुल महीने"), value:formatNumber(months)},
        {label:L("Estimated EPF Corpus","अनुमानित EPF राशि"), value:"₹"+formatNumber(corpus), main:true}
      ];
    }},
  { id:"nps", icon:"🧾", get name(){ return L("NPS Calculator","NPS कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"monthly", label:L("Monthly Contribution (₹)","मासिक योगदान (₹)"), type:"number"},
      {id:"age", label:L("Current Age","वर्तमान आयु"), type:"number"},
      {id:"rate", label:L("Expected Annual Return (%)","अपेक्षित वार्षिक रिटर्न (%)"), type:"number"}
    ]; },
    compute:(v)=>{
      const m=+v.monthly||0, age=+v.age||0, rate=+v.rate||0;
      const months = Math.max(0,(60-age)*12);
      const r = rate/12/100;
      let corpus = 0;
      for(let i=0;i<months;i++){ corpus = (corpus+m)*(1+r); }
      const annuity = corpus*0.4, lumpsum = corpus*0.6;
      return [
        {label:L("Corpus at 60","60 वर्ष की आयु पर राशि"), value:"₹"+formatNumber(corpus), main:true},
        {label:L("Lump Sum (60%)","एकमुश्त (60%)"), value:"₹"+formatNumber(lumpsum)},
        {label:L("Annuity Investment (40%)","वार्षिकी निवेश (40%)"), value:"₹"+formatNumber(annuity)}
      ];
    }},
  { id:"retirement", icon:"🌅", get name(){ return L("Retirement Calculator","सेवानिवृत्ति कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"age", label:L("Current Age","वर्तमान आयु"), type:"number"},
      {id:"retireAge", label:L("Retirement Age","सेवानिवृत्ति आयु"), type:"number"},
      {id:"monthlyExpense", label:L("Current Monthly Expense (₹)","वर्तमान मासिक खर्च (₹)"), type:"number"},
      {id:"inflation", label:L("Inflation (%)","महंगाई दर (%)"), type:"number"}
    ]; },
    compute:(v)=>{
      const age=+v.age||0, retireAge=+v.retireAge||0, exp=+v.monthlyExpense||0, inf=+v.inflation||0;
      const years = Math.max(0, retireAge-age);
      const futureMonthly = exp*Math.pow(1+inf/100, years);
      const corpusNeeded = futureMonthly*12*20; // 20 years post-retirement, rule-of-thumb
      return [
        {label:L("Future Monthly Expense","भविष्य मासिक खर्च"), value:"₹"+formatNumber(futureMonthly)},
        {label:L("Retirement Corpus Needed","आवश्यक सेवानिवृत्ति राशि"), value:"₹"+formatNumber(corpusNeeded), main:true}
      ];
    }},
  { id:"cagr", icon:"📈", get name(){ return L("CAGR Calculator","CAGR कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"initial", label:L("Initial Value (₹)","प्रारंभिक मूल्य (₹)"), type:"number"},
      {id:"final", label:L("Final Value (₹)","अंतिम मूल्य (₹)"), type:"number"},
      {id:"years", label:L("Duration (years)","अवधि (वर्ष)"), type:"number"}
    ]; },
    compute:(v)=>{
      const i=+v.initial||0, f=+v.final||0, y=+v.years||0;
      if(i<=0 || y<=0) return [{label:L("Enter valid values","सही मान दर्ज करें"), value:"—", main:true}];
      const cagr = (Math.pow(f/i, 1/y)-1)*100;
      return [{label:"CAGR", value:formatNumber(cagr)+"%", main:true}];
    }},
  { id:"swp", icon:"💸", get name(){ return L("SWP Calculator","SWP कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"corpus", label:L("Initial Corpus (₹)","प्रारंभिक राशि (₹)"), type:"number"},
      {id:"withdrawal", label:L("Monthly Withdrawal (₹)","मासिक निकासी (₹)"), type:"number"},
      {id:"rate", label:L("Expected Annual Return (%)","अपेक्षित वार्षिक रिटर्न (%)"), type:"number"}
    ]; },
    compute:(v)=>{
      let corpus=+v.corpus||0; const w=+v.withdrawal||0, rate=+v.rate||0;
      const r = rate/12/100;
      let months = 0;
      while(corpus>0 && months<1200){ corpus = corpus*(1+r)-w; months++; if(corpus<=0) break; }
      return [
        {label:L("Corpus Lasts","राशि इतने समय तक चलेगी"), value: months>=1200 ? L("100+ years","100+ वर्ष") : L(`${Math.floor(months/12)}y ${months%12}m`, `${Math.floor(months/12)} वर्ष ${months%12} माह`), main:true}
      ];
    }},
  { id:"stepUpSip", icon:"📶", get name(){ return L("Step-Up SIP Calculator","स्टेप-अप SIP कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"sip", label:L("Monthly SIP (₹)","मासिक SIP (₹)"), type:"number"},
      {id:"stepUp", label:L("Annual Step-Up (%)","वार्षिक वृद्धि (%)"), type:"number"},
      {id:"rate", label:L("Expected Annual Return (%)","अपेक्षित वार्षिक रिटर्न (%)"), type:"number"},
      {id:"years", label:L("Duration (years)","अवधि (वर्ष)"), type:"number"}
    ]; },
    compute:(v)=>{
      let sip=+v.sip||0; const stepUp=+v.stepUp||0, rate=+v.rate||0, years=+v.years||0;
      const r = rate/12/100;
      let corpus = 0, invested = 0;
      for(let y=0;y<years;y++){
        for(let m=0;m<12;m++){ corpus = (corpus+sip)*(1+r); invested += sip; }
        sip = sip*(1+stepUp/100);
      }
      return [
        {label:L("Total Invested","कुल निवेश"), value:"₹"+formatNumber(invested)},
        {label:L("Wealth Gained","अर्जित संपत्ति"), value:"₹"+formatNumber(corpus-invested)},
        {label:L("Final Corpus","अंतिम राशि"), value:"₹"+formatNumber(corpus), main:true}
      ];
    }},
  { id:"roi", icon:"📊", get name(){ return L("ROI Calculator","ROI कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"invested", label:L("Amount Invested (₹)","निवेशित राशि (₹)"), type:"number"},
      {id:"returned", label:L("Amount Returned (₹)","प्राप्त राशि (₹)"), type:"number"}
    ]; },
    compute:(v)=>{
      const inv=+v.invested||0, ret=+v.returned||0;
      const roi = inv!==0 ? ((ret-inv)/inv*100) : 0;
      return [{label:L("Net Gain","शुद्ध लाभ"), value:"₹"+formatNumber(ret-inv)}, {label:"ROI", value:formatNumber(roi)+"%", main:true}];
    }},

  /* ---- NEW: Finance ---- */
  { id:"savingsGoal", icon:"🎯", get name(){ return L("Savings Goal Calculator","बचत लक्ष्य कैलकुलेटर"); }, cat:"finance",
    get fields(){ return [
      {id:"goal", label:L("Target Amount (₹)","लक्ष्य राशि (₹)"), type:"number"},
      {id:"current", label:L("Current Savings (₹)","वर्तमान बचत (₹)"), type:"number"},
      {id:"months", label:L("Time to Reach Goal (months)","लक्ष्य तक समय (महीने)"), type:"number"}
    ]; },
    compute:(v)=>{
      const goal=+v.goal||0, cur=+v.current||0, m=+v.months||0;
      const needed = Math.max(0, goal-cur);
      const monthly = m>0 ? needed/m : 0;
      return [{label:L("Amount Still Needed","अभी और चाहिए"), value:"₹"+formatNumber(needed)}, {label:L("Required Monthly Saving","आवश्यक मासिक बचत"), value:"₹"+formatNumber(monthly), main:true}];
    }},
  { id:"netWorth", icon:"🧾", get name(){ return L("Net Worth Calculator","नेट वर्थ कैलकुलेटर"); }, cat:"finance",
    get fields(){ return [
      {id:"assets", label:L("Total Assets (₹)","कुल संपत्ति (₹)"), type:"number"},
      {id:"liabilities", label:L("Total Liabilities (₹)","कुल देनदारी (₹)"), type:"number"}
    ]; },
    compute:(v)=>{
      const a=+v.assets||0, l=+v.liabilities||0;
      return [{label:L("Net Worth","नेट वर्थ"), value:"₹"+formatNumber(a-l), main:true}];
    }},
  { id:"salary", icon:"💼", get name(){ return L("Salary Calculator","वेतन कैलकुलेटर"); }, cat:"finance",
    get fields(){ return [
      {id:"ctc", label:L("Annual CTC (₹)","वार्षिक CTC (₹)"), type:"number"},
      {id:"basicPct", label:L("Basic Salary (% of CTC)","मूल वेतन (CTC का %)"), type:"number"}
    ]; },
    compute:(v)=>{
      const ctc=+v.ctc||0, basicPct=+v.basicPct||40;
      const basic = ctc*basicPct/100;
      const pf = basic*0.12;
      const gross = ctc-pf;
      const monthlyInHand = gross/12;
      return [
        {label:L("Basic Salary (Annual)","मूल वेतन (वार्षिक)"), value:"₹"+formatNumber(basic)},
        {label:L("Employer PF Contribution","नियोक्ता PF योगदान"), value:"₹"+formatNumber(pf)},
        {label:L("Approx. Monthly In-Hand","लगभग मासिक इन-हैंड"), value:"₹"+formatNumber(monthlyInHand), main:true}
      ];
    }},
  { id:"depreciation", icon:"📉", get name(){ return L("Depreciation Calculator","मूल्यह्रास कैलकुलेटर"); }, cat:"business",
    get fields(){ return [
      {id:"cost", label:L("Asset Cost (₹)","संपत्ति लागत (₹)"), type:"number"},
      {id:"rate", label:L("Depreciation Rate (%/yr)","मूल्यह्रास दर (%/वर्ष)"), type:"number"},
      {id:"years", label:L("Years","वर्ष"), type:"number"}
    ]; },
    compute:(v)=>{
      const cost=+v.cost||0, rate=+v.rate||0, years=+v.years||0;
      let value = cost;
      for(let i=0;i<years;i++){ value -= value*rate/100; }
      return [
        {label:L("Total Depreciation","कुल मूल्यह्रास"), value:"₹"+formatNumber(cost-value)},
        {label:L("Current Value","वर्तमान मूल्य"), value:"₹"+formatNumber(value), main:true}
      ];
    }},
  { id:"profitMargin", icon:"💹", get name(){ return L("Profit Margin Calculator","लाभ मार्जिन कैलकुलेटर"); }, cat:"business",
    get fields(){ return [
      {id:"revenue", label:L("Revenue (₹)","राजस्व (₹)"), type:"number"},
      {id:"cost", label:L("Cost (₹)","लागत (₹)"), type:"number"}
    ]; },
    compute:(v)=>{
      const rev=+v.revenue||0, cost=+v.cost||0;
      const profit = rev-cost;
      const margin = rev!==0 ? (profit/rev*100) : 0;
      const markup = cost!==0 ? (profit/cost*100) : 0;
      return [
        {label:L("Profit","लाभ"), value:"₹"+formatNumber(profit)},
        {label:L("Profit Margin","लाभ मार्जिन"), value:formatNumber(margin)+"%", main:true},
        {label:L("Markup","मार्कअप"), value:formatNumber(markup)+"%"}
      ];
    }},

  /* ---- NEW: Health ---- */
  { id:"calorie", icon:"🍎", get name(){ return L("Calorie Calculator","कैलोरी कैलकुलेटर"); }, cat:"health",
    get fields(){ return [
      {id:"gender", label:L("Gender","लिंग"), type:"select", options:[["male",L("Male","पुरुष")],["female",L("Female","महिला")]]},
      {id:"weight", label:L("Weight (kg)","वजन (kg)"), type:"number"},
      {id:"height", label:L("Height (cm)","लंबाई (cm)"), type:"number"},
      {id:"age", label:L("Age","आयु"), type:"number"},
      {id:"activity", label:L("Activity Level","गतिविधि स्तर"), type:"select", options:[["1.2",L("Sedentary","बैठे रहने वाला")],["1.375",L("Light Activity","हल्की गतिविधि")],["1.55",L("Moderate Activity","मध्यम गतिविधि")],["1.725",L("Very Active","अत्यधिक सक्रिय")]]}
    ]; },
    compute:(v)=>{
      const w=+v.weight||0, h=+v.height||0, age=+v.age||0, act=+v.activity||1.2;
      let bmr = v.gender==="male" ? (10*w+6.25*h-5*age+5) : (10*w+6.25*h-5*age-161);
      const calories = bmr*act;
      return [{label:L("Daily Calorie Needs","दैनिक कैलोरी आवश्यकता"), value:formatNumber(calories)+" kcal", main:true}];
    }},
  { id:"bmr", icon:"🔥", get name(){ return L("BMR Calculator","BMR कैलकुलेटर"); }, cat:"health",
    get fields(){ return [
      {id:"gender", label:L("Gender","लिंग"), type:"select", options:[["male",L("Male","पुरुष")],["female",L("Female","महिला")]]},
      {id:"weight", label:L("Weight (kg)","वजन (kg)"), type:"number"},
      {id:"height", label:L("Height (cm)","लंबाई (cm)"), type:"number"},
      {id:"age", label:L("Age","आयु"), type:"number"}
    ]; },
    compute:(v)=>{
      const w=+v.weight||0, h=+v.height||0, age=+v.age||0;
      const bmr = v.gender==="male" ? (10*w+6.25*h-5*age+5) : (10*w+6.25*h-5*age-161);
      return [{label:"BMR", value:formatNumber(bmr)+" kcal/day", main:true}];
    }},
  { id:"tdee", icon:"⚡", get name(){ return L("TDEE Calculator","TDEE कैलकुलेटर"); }, cat:"health",
    get fields(){ return [
      {id:"gender", label:L("Gender","लिंग"), type:"select", options:[["male",L("Male","पुरुष")],["female",L("Female","महिला")]]},
      {id:"weight", label:L("Weight (kg)","वजन (kg)"), type:"number"},
      {id:"height", label:L("Height (cm)","लंबाई (cm)"), type:"number"},
      {id:"age", label:L("Age","आयु"), type:"number"},
      {id:"activity", label:L("Activity Level","गतिविधि स्तर"), type:"select", options:[["1.2",L("Sedentary","बैठे रहने वाला")],["1.375",L("Light Activity","हल्की गतिविधि")],["1.55",L("Moderate Activity","मध्यम गतिविधि")],["1.725",L("Very Active","अत्यधिक सक्रिय")],["1.9",L("Extremely Active","बेहद सक्रिय")]]}
    ]; },
    compute:(v)=>{
      const w=+v.weight||0, h=+v.height||0, age=+v.age||0, act=+v.activity||1.2;
      const bmr = v.gender==="male" ? (10*w+6.25*h-5*age+5) : (10*w+6.25*h-5*age-161);
      return [{label:"TDEE", value:formatNumber(bmr*act)+" kcal/day", main:true}];
    }},
  { id:"bodyFat", icon:"📏", get name(){ return L("Body Fat Calculator","बॉडी फैट कैलकुलेटर"); }, cat:"health",
    get fields(){ return [
      {id:"gender", label:L("Gender","लिंग"), type:"select", options:[["male",L("Male","पुरुष")],["female",L("Female","महिला")]]},
      {id:"waist", label:L("Waist (cm)","कमर (cm)"), type:"number"},
      {id:"neck", label:L("Neck (cm)","गर्दन (cm)"), type:"number"},
      {id:"height", label:L("Height (cm)","लंबाई (cm)"), type:"number"},
      {id:"hip", label:L("Hip (cm, female only)","कूल्हा (cm, केवल महिला)"), type:"number"}
    ]; },
    compute:(v)=>{
      const waist=+v.waist||0, neck=+v.neck||0, height=+v.height||0, hip=+v.hip||0;
      let bf;
      if(v.gender==="male"){
        bf = 495/(1.0324-0.19077*Math.log10(waist-neck)+0.15456*Math.log10(height))-450;
      } else {
        bf = 495/(1.29579-0.35004*Math.log10(waist+hip-neck)+0.22100*Math.log10(height))-450;
      }
      if(!isFinite(bf) || isNaN(bf)) return [{label:L("Enter valid measurements","सही माप दर्ज करें"), value:"—", main:true}];
      return [{label:L("Estimated Body Fat","अनुमानित बॉडी फैट"), value:formatNumber(bf)+"%", main:true}];
    }},
  { id:"pregnancyDueDate", icon:"👶", get name(){ return L("Pregnancy Due Date","प्रसव तिथि कैलकुलेटर"); }, cat:"health",
    get fields(){ return [ {id:"lmp", label:L("First Day of Last Period","अंतिम माहवारी का पहला दिन"), type:"date"} ]; },
    compute:(v)=>{
      if(!v.lmp) return [{label:L("Enter last period date","अंतिम माहवारी तिथि दर्ज करें"), value:"—", main:true}];
      const lmp = new Date(v.lmp);
      const due = new Date(lmp.getTime() + 280*86400000);
      return [{label:L("Estimated Due Date","अनुमानित प्रसव तिथि"), value: due.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}), main:true}];
    }},

  /* ---- NEW: Education ---- */
  { id:"attendance", icon:"📋", get name(){ return L("Attendance Calculator","उपस्थिति कैलकुलेटर"); }, cat:"education",
    get fields(){ return [
      {id:"attended", label:L("Classes Attended","उपस्थित कक्षाएं"), type:"number"},
      {id:"total", label:L("Total Classes","कुल कक्षाएं"), type:"number"},
      {id:"target", label:L("Target Attendance (%)","लक्ष्य उपस्थिति (%)"), type:"number"}
    ]; },
    compute:(v)=>{
      const att=+v.attended||0, total=+v.total||0, target=+v.target||75;
      const pct = total>0 ? (att/total*100) : 0;
      let extra = 0;
      if(pct < target && total>0){
        extra = Math.ceil((target*total-100*att)/(100-target));
      }
      return [
        {label:L("Current Attendance","वर्तमान उपस्थिति"), value:formatNumber(pct)+"%", main:true},
        {label:L("Classes Needed to Reach Target","लक्ष्य तक पहुंचने हेतु आवश्यक कक्षाएं"), value: pct>=target ? L("Target met","लक्ष्य पूरा") : formatNumber(extra)}
      ];
    }},
  { id:"gpa", icon:"🎓", get name(){ return L("GPA Calculator","GPA कैलकुलेटर"); }, cat:"education",
    get fields(){ return [
      {id:"grades", label:L("Grade Points (comma separated, e.g. 9,8.5,10)","ग्रेड पॉइंट्स (कॉमा से अलग करें)"), type:"text"},
      {id:"credits", label:L("Credits (comma separated, e.g. 4,3,4)","क्रेडिट (कॉमा से अलग करें)"), type:"text"}
    ]; },
    compute:(v)=>{
      const grades = String(v.grades||"").split(",").map(s=>parseFloat(s.trim())).filter(n=>!isNaN(n));
      const credits = String(v.credits||"").split(",").map(s=>parseFloat(s.trim())).filter(n=>!isNaN(n));
      if(grades.length===0 || grades.length!==credits.length) return [{label:L("Enter matching grades & credits","बराबर संख्या में ग्रेड व क्रेडिट डालें"), value:"—", main:true}];
      const totalCredits = credits.reduce((a,b)=>a+b,0);
      const weighted = grades.reduce((sum,g,i)=>sum+g*credits[i],0);
      return [{label:"GPA", value:formatNumber(weighted/totalCredits), main:true}];
    }},
  { id:"cgpa", icon:"📚", get name(){ return L("CGPA Calculator","CGPA कैलकुलेटर"); }, cat:"education",
    get fields(){ return [
      {id:"sgpas", label:L("Semester GPAs (comma separated)","सेमेस्टर GPA (कॉमा से अलग करें)"), type:"text"}
    ]; },
    compute:(v)=>{
      const sgpas = String(v.sgpas||"").split(",").map(s=>parseFloat(s.trim())).filter(n=>!isNaN(n));
      if(sgpas.length===0) return [{label:L("Enter semester GPAs","सेमेस्टर GPA दर्ज करें"), value:"—", main:true}];
      const avg = sgpas.reduce((a,b)=>a+b,0)/sgpas.length;
      return [{label:"CGPA", value:formatNumber(avg), main:true}];
    }},

  /* ---- NEW: Daily Life ---- */
  { id:"electricityBill", icon:"💡", get name(){ return L("Electricity Bill Calculator","बिजली बिल कैलकुलेटर"); }, cat:"dailylife",
    get fields(){ return [
      {id:"units", label:L("Units Consumed (kWh)","खपत यूनिट (kWh)"), type:"number"},
      {id:"rate", label:L("Rate per Unit (₹)","प्रति यूनिट दर (₹)"), type:"number"},
      {id:"fixedCharge", label:L("Fixed Charges (₹)","निश्चित शुल्क (₹)"), type:"number"}
    ]; },
    compute:(v)=>{
      const units=+v.units||0, rate=+v.rate||0, fixed=+v.fixedCharge||0;
      const total = units*rate+fixed;
      return [{label:L("Energy Charges","ऊर्जा शुल्क"), value:"₹"+formatNumber(units*rate)}, {label:L("Total Bill","कुल बिल"), value:"₹"+formatNumber(total), main:true}];
    }},
  { id:"waterBill", icon:"💧", get name(){ return L("Water Bill Calculator","पानी बिल कैलकुलेटर"); }, cat:"dailylife",
    get fields(){ return [
      {id:"units", label:L("Units Consumed (KL)","खपत यूनिट (KL)"), type:"number"},
      {id:"rate", label:L("Rate per Unit (₹)","प्रति यूनिट दर (₹)"), type:"number"},
      {id:"fixedCharge", label:L("Fixed Charges (₹)","निश्चित शुल्क (₹)"), type:"number"}
    ]; },
    compute:(v)=>{
      const units=+v.units||0, rate=+v.rate||0, fixed=+v.fixedCharge||0;
      const total = units*rate+fixed;
      return [{label:L("Total Water Bill","कुल पानी बिल"), value:"₹"+formatNumber(total), main:true}];
    }},

  /* ---- NEW: Automobile ---- */
  { id:"mileage", icon:"🚗", get name(){ return L("Mileage Calculator","माइलेज कैलकुलेटर"); }, cat:"automobile",
    get fields(){ return [
      {id:"distance", label:L("Distance Travelled (km)","चली गई दूरी (km)"), type:"number"},
      {id:"fuelUsed", label:L("Fuel Used (litres)","इस्तेमाल ईंधन (लीटर)"), type:"number"}
    ]; },
    compute:(v)=>{
      const d=+v.distance||0, f=+v.fuelUsed||0;
      if(f<=0) return [{label:L("Enter valid fuel used","सही ईंधन मात्रा दर्ज करें"), value:"—", main:true}];
      return [{label:L("Mileage","माइलेज"), value:formatNumber(d/f)+" km/l", main:true}];
    }},

  /* ---- NEW: Construction ---- */
  { id:"cement", icon:"🧱", get name(){ return L("Cement Calculator","सीमेंट कैलकुलेटर"); }, cat:"construction",
    get fields(){ return [
      {id:"volume", label:L("Concrete Volume (m³)","कंक्रीट आयतन (m³)"), type:"number"},
      {id:"ratio", label:L("Mix Ratio","मिश्रण अनुपात"), type:"select", options:[["1:1.5:3","1:1.5:3 (M20)"],["1:2:4","1:2:4 (M15)"],["1:3:6","1:3:6 (M10)"]]}
    ]; },
    compute:(v)=>{
      const vol=+v.volume||0;
      const parts = (v.ratio||"1:2:4").split(":").map(Number);
      const totalParts = parts.reduce((a,b)=>a+b,0);
      const dryVol = vol*1.54; // dry volume factor
      const cementVol = dryVol*(parts[0]/totalParts);
      const bags = cementVol*1440/50; // 1440 kg/m3 density, 50kg per bag
      return [
        {label:L("Cement Volume","सीमेंट आयतन"), value:formatNumber(cementVol)+" m³"},
        {label:L("Cement Bags Needed","आवश्यक सीमेंट बैग"), value:formatNumber(bags)+" bags", main:true}
      ];
    }},
  { id:"brick", icon:"🧱", get name(){ return L("Brick Calculator","ईंट कैलकुलेटर"); }, cat:"construction",
    get fields(){ return [
      {id:"wallLength", label:L("Wall Length (m)","दीवार लंबाई (m)"), type:"number"},
      {id:"wallHeight", label:L("Wall Height (m)","दीवार ऊंचाई (m)"), type:"number"},
      {id:"wallThickness", label:L("Wall Thickness (m)","दीवार मोटाई (m)"), type:"number"}
    ]; },
    compute:(v)=>{
      const l=+v.wallLength||0, h=+v.wallHeight||0, t=+v.wallThickness||0.23;
      const wallVol = l*h*t;
      const brickVol = 0.19*0.09*0.09; // standard brick with mortar
      const bricks = wallVol/brickVol;
      return [{label:L("Bricks Needed","आवश्यक ईंटें"), value:formatNumber(bricks)+" bricks", main:true}];
    }},
  { id:"paint", icon:"🎨", get name(){ return L("Paint Calculator","पेंट कैलकुलेटर"); }, cat:"construction",
    get fields(){ return [
      {id:"area", label:L("Wall Area (m²)","दीवार क्षेत्रफल (m²)"), type:"number"},
      {id:"coats", label:L("Number of Coats","कोट की संख्या"), type:"number"}
    ]; },
    compute:(v)=>{
      const area=+v.area||0, coats=+v.coats||2;
      const litresNeeded = (area*coats)/10; // ~10 sqm per litre per coat
      return [{label:L("Paint Needed","आवश्यक पेंट"), value:formatNumber(litresNeeded)+" L", main:true}];
    }},
  { id:"tile", icon:"🀫", get name(){ return L("Tile Calculator","टाइल कैलकुलेटर"); }, cat:"construction",
    get fields(){ return [
      {id:"floorArea", label:L("Floor Area (m²)","फर्श क्षेत्रफल (m²)"), type:"number"},
      {id:"tileLength", label:L("Tile Length (cm)","टाइल लंबाई (cm)"), type:"number"},
      {id:"tileWidth", label:L("Tile Width (cm)","टाइल चौड़ाई (cm)"), type:"number"}
    ]; },
    compute:(v)=>{
      const area=+v.floorArea||0, l=(+v.tileLength||0)/100, w=(+v.tileWidth||0)/100;
      const tileArea = l*w;
      if(tileArea<=0) return [{label:L("Enter valid tile size","सही टाइल आकार दर्ज करें"), value:"—", main:true}];
      const tiles = Math.ceil(area/tileArea*1.1); // 10% wastage
      return [{label:L("Tiles Needed (incl. 10% wastage)","आवश्यक टाइलें (10% बर्बादी सहित)"), value:formatNumber(tiles)+" tiles", main:true}];
    }},
  { id:"steelWeight", icon:"⚙️", get name(){ return L("Steel Weight Calculator","स्टील वजन कैलकुलेटर"); }, cat:"construction",
    get fields(){ return [
      {id:"diameter", label:L("Bar Diameter (mm)","बार व्यास (mm)"), type:"number"},
      {id:"length", label:L("Length (m)","लंबाई (m)"), type:"number"}
    ]; },
    compute:(v)=>{
      const d=+v.diameter||0, len=+v.length||0;
      const weightPerMeter = (d*d)/162;
      return [{label:L("Weight","वजन"), value:formatNumber(weightPerMeter*len)+" kg", main:true}];
    }},

  /* ---- NEW: Utility (generators) ---- */
  { id:"qr", icon:"🔲", get name(){ return L("QR Code Generator","QR कोड जनरेटर"); }, cat:"utility", custom:"qr" },
  { id:"password", icon:"🔑", get name(){ return L("Password Generator","पासवर्ड जनरेटर"); }, cat:"utility", custom:"password" },
  { id:"randomNumber", icon:"🎲", get name(){ return L("Random Number Generator","रैंडम नंबर जनरेटर"); }, cat:"utility", custom:"randomNumber" },
  { id:"uuid", icon:"🆔", get name(){ return L("UUID Generator","UUID जनरेटर"); }, cat:"utility", custom:"uuid" },

  /* ---- NEW: Finance (Banking-adjacent) ---- */
  { id:"sip", icon:"📈", get name(){ return L("SIP Calculator","SIP कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"sip", label:L("Monthly SIP (₹)","मासिक SIP (₹)"), type:"number"},
      {id:"rate", label:L("Expected Annual Return (%)","अपेक्षित वार्षिक रिटर्न (%)"), type:"number"},
      {id:"years", label:L("Duration (years)","अवधि (वर्ष)"), type:"number"}
    ]; },
    compute:(v)=>{
      const sip=+v.sip||0, rate=+v.rate||0, years=+v.years||0;
      const months = years*12, r = rate/12/100;
      let corpus = 0;
      for(let i=0;i<months;i++){ corpus = (corpus+sip)*(1+r); }
      const invested = sip*months;
      return [
        {label:L("Total Invested","कुल निवेश"), value:"₹"+formatNumber(invested)},
        {label:L("Wealth Gained","अर्जित संपत्ति"), value:"₹"+formatNumber(corpus-invested)},
        {label:L("Maturity Value","परिपक्वता राशि"), value:"₹"+formatNumber(corpus), main:true}
      ];
    }},
  { id:"fd", icon:"🏦", get name(){ return L("FD Calculator","FD कैलकुलेटर"); }, cat:"banking",
    get fields(){ return [
      {id:"principal", label:L("Deposit Amount (₹)","जमा राशि (₹)"), type:"number"},
      {id:"rate", label:L("Annual Interest (%)","वार्षिक ब्याज (%)"), type:"number"},
      {id:"years", label:L("Tenure (years)","अवधि (वर्ष)"), type:"number"},
      {id:"n", label:L("Compounding","चक्रवृद्धि"), type:"select", options:[["1",L("Yearly","वार्षिक")],["4",L("Quarterly","तिमाही")],["12",L("Monthly","मासिक")]]}
    ]; },
    compute:(v)=>{
      const p=+v.principal||0, rate=+v.rate||0, years=+v.years||0, n=+v.n||1;
      const maturity = p*Math.pow(1+rate/(100*n), n*years);
      return [
        {label:L("Interest Earned","अर्जित ब्याज"), value:"₹"+formatNumber(maturity-p)},
        {label:L("Maturity Value","परिपक्वता राशि"), value:"₹"+formatNumber(maturity), main:true}
      ];
    }},
  { id:"rd", icon:"💵", get name(){ return L("RD Calculator","RD कैलकुलेटर"); }, cat:"banking",
    get fields(){ return [
      {id:"monthly", label:L("Monthly Deposit (₹)","मासिक जमा (₹)"), type:"number"},
      {id:"rate", label:L("Annual Interest (%)","वार्षिक ब्याज (%)"), type:"number"},
      {id:"months", label:L("Tenure (months)","अवधि (महीने)"), type:"number"}
    ]; },
    compute:(v)=>{
      const m=+v.monthly||0, rate=+v.rate||0, months=+v.months||0;
      const r = rate/4/100; // quarterly compounding, standard RD convention
      let maturity = 0;
      for(let i=0;i<months;i++){
        const remainingQuarters = (months-i)/3;
        maturity += m*Math.pow(1+r, remainingQuarters);
      }
      const invested = m*months;
      return [
        {label:L("Total Deposited","कुल जमा"), value:"₹"+formatNumber(invested)},
        {label:L("Interest Earned","अर्जित ब्याज"), value:"₹"+formatNumber(maturity-invested)},
        {label:L("Maturity Value","परिपक्वता राशि"), value:"₹"+formatNumber(maturity), main:true}
      ];
    }},
  { id:"ppf", icon:"🪙", get name(){ return L("PPF Calculator","PPF कैलकुलेटर"); }, cat:"investment",
    get fields(){ return [
      {id:"yearly", label:L("Yearly Investment (₹)","वार्षिक निवेश (₹)"), type:"number"},
      {id:"rate", label:L("Annual Interest (%)","वार्षिक ब्याज (%)"), type:"number"},
      {id:"years", label:L("Duration (years, 15 min.)","अवधि (वर्ष, न्यूनतम 15)"), type:"number"}
    ]; },
    compute:(v)=>{
      const yearly=+v.yearly||0, rate=+v.rate||0, years=+v.years||15;
      let corpus = 0;
      for(let i=0;i<years;i++){ corpus = (corpus+yearly)*(1+rate/100); }
      const invested = yearly*years;
      return [
        {label:L("Total Invested","कुल निवेश"), value:"₹"+formatNumber(invested)},
        {label:L("Interest Earned","अर्जित ब्याज"), value:"₹"+formatNumber(corpus-invested)},
        {label:L("Maturity Value","परिपक्वता राशि"), value:"₹"+formatNumber(corpus), main:true}
      ];
    }},
  { id:"gratuity", icon:"🎁", get name(){ return L("Gratuity Calculator","ग्रेच्युटी कैलकुलेटर"); }, cat:"finance",
    get fields(){ return [
      {id:"salary", label:L("Last Drawn Basic + DA (₹)","अंतिम मूल वेतन + DA (₹)"), type:"number"},
      {id:"years", label:L("Years of Service","सेवा के वर्ष"), type:"number"}
    ]; },
    compute:(v)=>{
      const salary=+v.salary||0, years=Math.floor(+v.years||0);
      const gratuity = (salary*15*years)/26;
      const capped = Math.min(gratuity, 2000000); // statutory cap ₹20 lakh
      return [
        {label:L("Gratuity Amount (capped at ₹20,00,000 by law)","ग्रेच्युटी राशि (कानून अनुसार अधिकतम ₹20,00,000)"), value:"₹"+formatNumber(capped), main:true}
      ];
    }},

  /* ---- NEW: Health ---- */
  { id:"waterIntake", icon:"💧", get name(){ return L("Water Intake Calculator","पानी सेवन कैलकुलेटर"); }, cat:"health",
    get fields(){ return [
      {id:"weight", label:L("Weight (kg)","वजन (kg)"), type:"number"},
      {id:"activity", label:L("Activity Level","गतिविधि स्तर"), type:"select", options:[["0.03",L("Sedentary","बैठे रहने वाला")],["0.04",L("Moderate Activity","मध्यम गतिविधि")],["0.05",L("Very Active","अत्यधिक सक्रिय")]]}
    ]; },
    compute:(v)=>{
      const w=+v.weight||0, factor=+v.activity||0.03;
      const litres = w*factor;
      return [{label:L("Recommended Daily Water Intake","अनुशंसित दैनिक पानी सेवन"), value:formatNumber(litres)+" L", main:true}];
    }}
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
  document.getElementById("glowSetter").style.setProperty("--glow", catColor(activeTool.cat));

  // Track recently used (most-recent-first, capped, de-duplicated)
  state.recentTools = [id, ...state.recentTools.filter(t=>t!==id)].slice(0, 8);
  saveState();

  const favBtn = document.getElementById("toolFavBtn");
  if(favBtn){
    const isFav = state.favoriteTools.includes(id);
    favBtn.textContent = isFav ? "★" : "☆";
    favBtn.onclick = ()=>{
      if(state.favoriteTools.includes(id)) state.favoriteTools = state.favoriteTools.filter(t=>t!==id);
      else state.favoriteTools.push(id);
      saveState();
      favBtn.textContent = state.favoriteTools.includes(id) ? "★" : "☆";
    };
  }

  const body = document.getElementById("toolBody");
  body.innerHTML = "";

  if(activeTool.custom === "unit"){ renderUnitTool(body); }
  else if(activeTool.custom === "currency"){ renderCurrencyTool(body); }
  else if(activeTool.custom === "qr"){ renderQrTool(body); }
  else if(activeTool.custom === "password"){ renderPasswordTool(body); }
  else if(activeTool.custom === "randomNumber"){ renderRandomNumberTool(body); }
  else if(activeTool.custom === "uuid"){ renderUuidTool(body); }
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
    <button class="pill-btn" id="toolCopyBtn">${t("copy")}</button>
    <button class="pill-btn" id="toolShareBtn">${t("share")}</button>
    <button class="pill-btn primary" id="toolSaveBtn">${t("save")}</button>`;
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
  wrapG.innerHTML = `<label>${L("Category","श्रेणी")}</label>`; wrapG.appendChild(groupSel);
  body.appendChild(wrapG);

  const row = document.createElement("div");
  row.style.display="flex"; row.style.gap="10px";
  const fromWrap = document.createElement("div"); fromWrap.className="field"; fromWrap.style.flex="1";
  const toWrap = document.createElement("div"); toWrap.className="field"; toWrap.style.flex="1";
  fromWrap.innerHTML = `<label>${L("From","से")}</label>`; toWrap.innerHTML = `<label>${L("To","तक")}</label>`;
  const fromSel = document.createElement("select"); const toSel = document.createElement("select");
  fromWrap.appendChild(fromSel); toWrap.appendChild(toSel);
  row.appendChild(fromWrap); row.appendChild(toWrap);
  body.appendChild(row);

  const valWrap = document.createElement("div"); valWrap.className="field";
  valWrap.innerHTML = `<label>${L("Value","मान")}</label>`;
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
        <button class="pill-btn" id="uCopy">${t("copy")}</button>
        <button class="pill-btn" id="uShare">${t("share")}</button>
        <button class="pill-btn primary" id="uSave">${t("save")}</button>
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
  body.innerHTML = `<div class="field" id="curStatus" style="font-size:12px;color:var(--text-dim)">${L("Loading rates…","दरें लोड हो रही हैं…")}</div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>${L("From","से")}</label><select id="curFrom"></select></div>
      <div class="field" style="flex:1"><label>${L("To","तक")}</label><select id="curTo"></select></div>
    </div>
    <div class="field"><label>${L("Amount","राशि")}</label><input type="number" id="curAmount" inputmode="decimal" value="1"></div>
    <div class="tool-result" id="curResultBox"></div>`;

  getRates().then(({rates, offline, cached})=>{
    const status = document.getElementById("curStatus");
    status.textContent = offline
      ? (cached ? L("Offline — showing last saved rates","ऑफ़लाइन — पिछली सेव की गई दरें दिखा रहे हैं") : L("Offline — showing built-in reference rates","ऑफ़लाइन — डिफ़ॉल्ट दरें दिखा रहे हैं"))
      : L("Live rates updated","लाइव दरें अपडेट हुईं");
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
          <button class="pill-btn" id="cCopy">${t("copy")}</button>
          <button class="pill-btn" id="cShare">${t("share")}</button>
          <button class="pill-btn primary" id="cSave">${t("save")}</button>
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

/* ---------------- GENERATORS (QR / Password / Random Number / UUID) ---------------- */
function renderQrTool(body){
  body.innerHTML = `
    <div class="field"><label>${L("Text or URL","टेक्स्ट या URL")}</label><input type="text" id="qrInput" placeholder="${L("Enter text, phone number, or link…","टेक्स्ट, फोन नंबर या लिंक दर्ज करें…")}"></div>
    <div class="tool-result" style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <div id="qrCanvasWrap" style="background:#fff;padding:14px;border-radius:12px"></div>
      <div class="action-row" style="width:100%">
        <button class="pill-btn" id="qrDownload">${L("Download","डाउनलोड करें")}</button>
        <button class="pill-btn primary" id="qrShare">${t("share")}</button>
      </div>
    </div>`;
  const input = document.getElementById("qrInput");
  const wrap = document.getElementById("qrCanvasWrap");
  let qrInstance = null;

  function draw(){
    wrap.innerHTML = "";
    const text = input.value.trim() || "https://mirashyam.com";
    if(window.QRCode){
      qrInstance = new QRCode(wrap, { text, width:200, height:200, colorDark:"#0B0E14", colorLight:"#ffffff" });
    } else {
      wrap.innerHTML = `<div style="padding:20px;color:#333;font-size:12px;max-width:200px">${L("QR library failed to load — check your internet connection once, then it works offline.","QR लाइब्रेरी लोड नहीं हुई — एक बार इंटरनेट चेक करें, फिर ऑफ़लाइन भी काम करेगी।")}</div>`;
    }
  }
  input.addEventListener("input", draw);
  draw();

  document.getElementById("qrDownload").onclick = ()=>{
    const canvas = wrap.querySelector("canvas");
    if(!canvas){ toast(L("Nothing to download yet","अभी डाउनलोड करने के लिए कुछ नहीं")); return; }
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "qr-code.png";
    a.click();
  };
  document.getElementById("qrShare").onclick = ()=>shareText(input.value.trim() || "https://mirashyam.com");
}

function renderPasswordTool(body){
  body.innerHTML = `
    <div class="field"><label>${L("Length","लंबाई")}: <span id="pwLenVal">14</span></label>
      <input type="range" id="pwLen" min="6" max="32" value="14" style="width:100%"></div>
    <div class="field" style="display:flex;flex-direction:column;gap:8px">
      <label style="display:flex;align-items:center;gap:8px;font-weight:500;color:var(--text)"><input type="checkbox" id="pwUpper" checked> ${L("Uppercase (A-Z)","बड़े अक्षर (A-Z)")}</label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:500;color:var(--text)"><input type="checkbox" id="pwLower" checked> ${L("Lowercase (a-z)","छोटे अक्षर (a-z)")}</label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:500;color:var(--text)"><input type="checkbox" id="pwNum" checked> ${L("Numbers (0-9)","अंक (0-9)")}</label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:500;color:var(--text)"><input type="checkbox" id="pwSym" checked> ${L("Symbols (!@#$…)","चिह्न (!@#$…)")}</label>
    </div>
    <div class="tool-result">
      <div class="r-row main" style="word-break:break-all"><span id="pwOutput">—</span></div>
      <div class="action-row">
        <button class="pill-btn" id="pwCopy">${t("copy")}</button>
        <button class="pill-btn primary" id="pwRegen">${L("Regenerate","फिर से बनाएं")}</button>
      </div>
    </div>`;
  const lenEl = document.getElementById("pwLen"), lenVal = document.getElementById("pwLenVal"), out = document.getElementById("pwOutput");
  function gen(){
    const len = +lenEl.value; lenVal.textContent = len;
    let chars = "";
    if(document.getElementById("pwUpper").checked) chars += "ABCDEFGHJKLMNPQRSTUVWXYZ";
    if(document.getElementById("pwLower").checked) chars += "abcdefghijkmnpqrstuvwxyz";
    if(document.getElementById("pwNum").checked) chars += "23456789";
    if(document.getElementById("pwSym").checked) chars += "!@#$%^&*()_+-=";
    if(!chars){ out.textContent = L("Select at least one option","कम से कम एक विकल्प चुनें"); return; }
    const arr = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    let pw = "";
    for(let i=0;i<len;i++){ pw += chars[arr[i] % chars.length]; }
    out.textContent = pw;
  }
  [...body.querySelectorAll("input")].forEach(el=>el.addEventListener("input", gen));
  document.getElementById("pwRegen").onclick = gen;
  document.getElementById("pwCopy").onclick = ()=>copyText(out.textContent);
  gen();
}

function renderRandomNumberTool(body){
  body.innerHTML = `
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>${L("Min","न्यूनतम")}</label><input type="number" id="rnMin" value="1"></div>
      <div class="field" style="flex:1"><label>${L("Max","अधिकतम")}</label><input type="number" id="rnMax" value="100"></div>
    </div>
    <div class="field"><label>${L("How Many","कितने")}</label><input type="number" id="rnCount" value="1" min="1" max="20"></div>
    <div class="tool-result">
      <div class="r-row main" style="word-break:break-all"><span id="rnOutput">—</span></div>
      <div class="action-row">
        <button class="pill-btn" id="rnCopy">${t("copy")}</button>
        <button class="pill-btn primary" id="rnGen">${L("Generate","बनाएं")}</button>
      </div>
    </div>`;
  const out = document.getElementById("rnOutput");
  function gen(){
    const min = Math.round(+document.getElementById("rnMin").value||0);
    const max = Math.round(+document.getElementById("rnMax").value||0);
    const count = Math.min(20, Math.max(1, Math.round(+document.getElementById("rnCount").value||1)));
    if(min>=max){ out.textContent = L("Max must be greater than Min","अधिकतम, न्यूनतम से बड़ा होना चाहिए"); return; }
    const nums = [];
    for(let i=0;i<count;i++){ nums.push(Math.floor(Math.random()*(max-min+1))+min); }
    out.textContent = nums.join(", ");
  }
  document.getElementById("rnGen").onclick = gen;
  document.getElementById("rnCopy").onclick = ()=>copyText(out.textContent);
  gen();
}

function renderUuidTool(body){
  body.innerHTML = `
    <div class="tool-result">
      <div class="r-row main" style="word-break:break-all;font-family:var(--font-mono);font-size:16px"><span id="uuidOutput">—</span></div>
      <div class="action-row">
        <button class="pill-btn" id="uuidCopy">${t("copy")}</button>
        <button class="pill-btn primary" id="uuidGen">${L("Generate New","नया बनाएं")}</button>
      </div>
    </div>`;
  const out = document.getElementById("uuidOutput");
  function gen(){
    if(crypto.randomUUID){ out.textContent = crypto.randomUUID(); return; }
    // Fallback for older WebViews without crypto.randomUUID
    out.textContent = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v = c==="x" ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
  document.getElementById("uuidGen").onclick = gen;
  document.getElementById("uuidCopy").onclick = ()=>copyText(out.textContent);
  gen();
}

/* ---------------- TOOL GRID / SEARCH / CATEGORIES ---------------- */
const POPULAR_TOOL_IDS = ["gst","emi","sip","percentage","bmi","age","fd","incomeTax","discount","currency"];
let activeToolCategory = "all";

function buildToolCard(tool){
  const card = document.createElement("button");
  card.className = "tool-card";
  card.style.setProperty("--cat-color", catColor(tool.cat));
  const isFav = state.favoriteTools.includes(tool.id);
  card.innerHTML = `<span class="t-icon">${tool.icon}</span><span class="t-name">${tool.name}</span><span class="t-cat" style="color:${catColor(tool.cat)}">${catLabel(tool.cat)}</span>${isFav ? '<span class="t-fav">★</span>' : ''}`;
  card.addEventListener("click", ()=>openTool(tool.id));
  return card;
}

function renderToolSection(container, titleText, tools){
  if(tools.length===0) return;
  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.textContent = titleText;
  container.appendChild(heading);
  const grid = document.createElement("div");
  grid.className = "tool-grid";
  tools.forEach(tool => grid.appendChild(buildToolCard(tool)));
  container.appendChild(grid);
}

function renderCatChips(){
  const chipRow = document.getElementById("catChips");
  chipRow.innerHTML = "";
  const usedCats = [...new Set(TOOLS.map(t=>t.cat))];
  const allChip = document.createElement("button");
  allChip.className = "chip" + (activeToolCategory==="all" ? " active" : "");
  allChip.textContent = L("All","सभी");
  allChip.onclick = ()=>{ activeToolCategory = "all"; renderCatChips(); renderToolGrid(document.getElementById("toolSearch").value); };
  chipRow.appendChild(allChip);
  usedCats.forEach(catKey=>{
    const chip = document.createElement("button");
    chip.className = "chip" + (activeToolCategory===catKey ? " active" : "");
    chip.style.setProperty("--chip-color", catColor(catKey));
    chip.textContent = catLabel(catKey);
    chip.onclick = ()=>{ activeToolCategory = catKey; renderCatChips(); renderToolGrid(document.getElementById("toolSearch").value); };
    chipRow.appendChild(chip);
  });
}

function renderToolGrid(filter=""){
  const container = document.getElementById("toolSections");
  container.innerHTML = "";
  const q = filter.trim().toLowerCase();

  let pool = TOOLS;
  if(activeToolCategory !== "all") pool = pool.filter(t=>t.cat===activeToolCategory);
  if(q) pool = pool.filter(t=>t.name.toLowerCase().includes(q));

  // Search or a specific category selected: flat, no sections.
  if(q || activeToolCategory !== "all"){
    renderToolSection(container, activeToolCategory!=="all" ? catLabel(activeToolCategory) : L("Results","परिणाम"), pool);
    if(pool.length===0){
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = L("No calculators found","कोई कैलकुलेटर नहीं मिला");
      container.appendChild(empty);
    }
    return;
  }

  // Default view: Favorites, Recently Used, Popular, then everything.
  const favTools = state.favoriteTools.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);
  const recentTools = state.recentTools.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);
  const popularTools = POPULAR_TOOL_IDS.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);

  renderToolSection(container, L("⭐ Favorites","⭐ पसंदीदा"), favTools);
  renderToolSection(container, L("🕐 Recently Used","🕐 हाल में इस्तेमाल किया"), recentTools);
  renderToolSection(container, L("🔥 Popular","🔥 लोकप्रिय"), popularTools);
  renderToolSection(container, L("All Calculators","सभी कैलकुलेटर"), TOOLS);
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
  w.document.write(`<html><head><title>BharatCalc History</title>
    <style>body{font-family:sans-serif;padding:24px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}</style>
    </head><body><h2>BharatCalc — Calculation History</h2><table><tr><th>Type</th><th>Expression</th><th>Result</th><th>Time</th></tr>${rows}</table>
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
  else if(mode==="tools"){ document.getElementById("view-tools").classList.add("active"); renderCatChips(); renderToolGrid(); }
  else if(mode==="history"){ document.getElementById("view-history").classList.add("active"); renderHistory(); }
}

/* ---------------- SETTINGS ---------------- */
function applyTheme(){
  document.body.setAttribute("data-theme", state.theme);
  document.body.setAttribute("data-color", state.color);
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

/* ---------------- INFO SHEET (About / Privacy / Terms) + SHARE / RATE / CONTACT ---------------- */
// TODO: replace with your real Play Store listing URL once BharatCalc is published, and your real support email.
const PLAY_STORE_URL = "";
const SUPPORT_EMAIL = "support@bharatcalc.app";
const APP_SHARE_URL = "https://bharatcalc-chi.vercel.app";

function getInfoContent(key){
  const map = {
    about:{
      title: L("About BharatCalc","BharatCalc के बारे में"),
      body: L(
        `<p><strong>BharatCalc — India's Smart Calculator Hub.</strong></p>
         <p>BharatCalc brings together 50+ everyday calculators — Finance, Tax, Health, Education, Construction and more — in one fast, offline-friendly app, in both English and Hindi.</p>
         <p>Built for quick, accurate, on-the-go calculations, whether you're checking an EMI, your BMI, or how many bags of cement you need.</p>`,
        `<p><strong>BharatCalc — भारत का स्मार्ट कैलकुलेटर हब।</strong></p>
         <p>BharatCalc में वित्त, टैक्स, स्वास्थ्य, शिक्षा, निर्माण जैसी श्रेणियों के 50+ कैलकुलेटर एक ही तेज़, ऑफ़लाइन-फ्रेंडली ऐप में मिलते हैं — अंग्रेज़ी और हिंदी दोनों में।</p>
         <p>चाहे EMI चेक करनी हो, BMI जाननी हो, या सीमेंट के बैग गिनने हों — तेज़ और सटीक गणना के लिए बनाया गया।</p>`
      )
    },
    privacy:{
      title: L("Privacy Policy","गोपनीयता नीति"),
      body: L(
        `<p>BharatCalc respects your privacy. Calculations you perform, your history, and your settings are stored only on your own device (local storage) — we do not collect or transmit this data to any server.</p>
         <p>The Currency Converter fetches live exchange rates from a third-party rate provider over the internet; no personal data is sent with that request.</p>
         <p>If this app is downloaded from an app store, that store may collect standard install/usage analytics under its own privacy policy.</p>
         <p><em>This is placeholder text — please review and customize it with your business details before publishing.</em></p>`,
        `<p>BharatCalc आपकी गोपनीयता का सम्मान करता है। आपकी गणनाएं, इतिहास और सेटिंग्स केवल आपके डिवाइस पर (लोकल स्टोरेज में) सेव होती हैं — हम इसे किसी सर्वर पर नहीं भेजते।</p>
         <p>करेंसी कन्वर्टर लाइव दरों के लिए एक थर्ड-पार्टी सेवा से इंटरनेट पर संपर्क करता है; इसमें कोई व्यक्तिगत जानकारी नहीं भेजी जाती।</p>
         <p>अगर यह ऐप किसी ऐप स्टोर से डाउनलोड की गई है, तो वह स्टोर अपनी नीति अनुसार सामान्य इंस्टॉल/उपयोग डेटा एकत्र कर सकता है।</p>
         <p><em>यह प्लेसहोल्डर टेक्स्ट है — कृपया प्रकाशित करने से पहले अपनी जानकारी के अनुसार इसे बदलें।</em></p>`
      )
    },
    terms:{
      title: L("Terms & Conditions","नियम व शर्तें"),
      body: L(
        `<p>BharatCalc is provided for general informational and estimation purposes only. Results (EMI, tax, health metrics, construction quantities, etc.) are approximate and should not be treated as professional financial, medical, legal, or engineering advice.</p>
         <p>Always verify important calculations with a qualified professional (CA, doctor, structural engineer, etc.) before making decisions based on them.</p>
         <p>We aim for accuracy but do not guarantee the app is error-free or uninterrupted.</p>
         <p><em>This is placeholder text — please review and customize it with your business details before publishing.</em></p>`,
        `<p>BharatCalc केवल सामान्य जानकारी व अनुमान हेतु उपलब्ध है। परिणाम (EMI, टैक्स, स्वास्थ्य, निर्माण मात्रा आदि) अनुमानित हैं और इन्हें पेशेवर वित्तीय, चिकित्सा, कानूनी या इंजीनियरिंग सलाह न समझें।</p>
         <p>महत्वपूर्ण निर्णय लेने से पहले किसी योग्य विशेषज्ञ (CA, डॉक्टर, इंजीनियर आदि) से पुष्टि अवश्य करें।</p>
         <p>हम सटीकता का प्रयास करते हैं लेकिन ऐप के पूर्णतः त्रुटि-रहित होने की गारंटी नहीं देते।</p>
         <p><em>यह प्लेसहोल्डर टेक्स्ट है — कृपया प्रकाशित करने से पहले अपनी जानकारी के अनुसार इसे बदलें।</em></p>`
      )
    }
  };
  return map[key];
}

function openInfoSheet(key){
  const info = getInfoContent(key);
  if(!info) return;
  document.getElementById("infoSheetTitle").textContent = info.title;
  document.getElementById("infoSheetBody").innerHTML = info.body;
  document.getElementById("infoBackdrop").classList.add("show");
  document.getElementById("infoSheet").classList.add("show");
}
function closeInfoSheet(){
  document.getElementById("infoBackdrop").classList.remove("show");
  document.getElementById("infoSheet").classList.remove("show");
}

function handleShareApp(){
  openShareSheet();
}

function openShareSheet(){
  closeSettings();
  const msg = L("Check out BharatCalc — India's Smart Calculator Hub!","BharatCalc देखें — भारत का स्मार्ट कैलकुलेटर हब!");
  const encodedMsg = encodeURIComponent(msg);
  const encodedUrl = encodeURIComponent(APP_SHARE_URL);
  const combined = encodeURIComponent(`${msg} ${APP_SHARE_URL}`);

  const platforms = [
    { icon:"💬", label:"WhatsApp", action:()=>openLink(`https://wa.me/?text=${combined}`) },
    { icon:"📘", label:"Facebook", action:()=>openLink(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`) },
    { icon:"✈️", label:"Telegram", action:()=>openLink(`https://t.me/share/url?url=${encodedUrl}&text=${encodedMsg}`) },
    { icon:"𝕏", label:L("Twitter / X","Twitter / X"), action:()=>openLink(`https://twitter.com/intent/tweet?text=${encodedMsg}&url=${encodedUrl}`) },
    { icon:"✉️", label:L("Email","ईमेल"), action:()=>{ window.location.href = `mailto:?subject=${encodeURIComponent("BharatCalc")}&body=${combined}`; } },
    { icon:"💬", label:L("SMS","एसएमएस"), action:()=>{ window.location.href = `sms:?body=${combined}`; } },
    { icon:"🔗", label:L("Copy Link","लिंक कॉपी करें"), action:()=>copyText(APP_SHARE_URL) }
  ];
  if(navigator.share){
    platforms.push({ icon:"⋯", label:L("More apps","अन्य ऐप्स"), action:()=>{
      navigator.share({ title:"BharatCalc", text:msg, url:APP_SHARE_URL }).catch(()=>{});
    }});
  }

  const body = document.getElementById("shareSheetBody");
  body.innerHTML = "";
  platforms.forEach(p=>{
    const row = document.createElement("div");
    row.className = "menu-row";
    row.innerHTML = `${p.icon} <span>${p.label}</span>`;
    row.addEventListener("click", ()=>{ try{ p.action(); }catch(e){ copyText(APP_SHARE_URL); } });
    body.appendChild(row);
  });

  document.getElementById("shareSheetTitle").textContent = L("Share App","ऐप शेयर करें");
  document.getElementById("shareBackdrop").classList.add("show");
  document.getElementById("shareSheet").classList.add("show");
}
function closeShareSheet(){
  document.getElementById("shareBackdrop").classList.remove("show");
  document.getElementById("shareSheet").classList.remove("show");
}
function openLink(url){
  try{
    const win = window.open(url, "_blank");
    if(!win){ window.location.href = url; }
  }catch(e){
    window.location.href = url;
  }
}
function handleRateUs(){
  if(PLAY_STORE_URL){
    try{
      const win = window.open(PLAY_STORE_URL, "_blank");
      // Some in-app WebViews (including APK wrappers) silently block window.open —
      // if it didn't return a window handle, fall back to direct navigation.
      if(!win){ window.location.href = PLAY_STORE_URL; }
    }catch(e){
      window.location.href = PLAY_STORE_URL;
    }
  } else {
    toast(L("Not on Play Store yet — sharing the app instead","अभी Play Store पर नहीं — ऐप शेयर कर रहे हैं"));
    handleShareApp();
  }
}
function handleContactUs(){
  try{
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("BharatCalc Support")}`;
  }catch(e){
    copyText(SUPPORT_EMAIL);
    toast(L("Couldn't open mail app — email address copied instead","मेल ऐप नहीं खुला — ईमेल कॉपी कर दिया"));
  }
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
    if(activeTool){ openTool(activeTool.id); }
    else if(document.getElementById("view-tools").classList.contains("active")){ renderCatChips(); renderToolGrid(document.getElementById("toolSearch").value); }
    if(document.getElementById("view-history").classList.contains("active")){ renderHistory(document.getElementById("historySearch").value); }
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

  document.getElementById("shareAppBtn").addEventListener("click", handleShareApp);
  document.getElementById("rateUsBtn").addEventListener("click", handleRateUs);
  document.getElementById("contactUsBtn").addEventListener("click", handleContactUs);
  document.getElementById("aboutUsBtn").addEventListener("click", ()=>openInfoSheet("about"));
  document.getElementById("privacyBtn").addEventListener("click", ()=>openInfoSheet("privacy"));
  document.getElementById("termsBtn").addEventListener("click", ()=>openInfoSheet("terms"));
  document.getElementById("infoCloseBtn").addEventListener("click", closeInfoSheet);
  document.getElementById("infoBackdrop").addEventListener("click", closeInfoSheet);
  document.getElementById("shareCloseBtn").addEventListener("click", closeShareSheet);
  document.getElementById("shareBackdrop").addEventListener("click", closeShareSheet);

  refreshChrome();
  showView("basic");

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").then(reg=>{
      if(!reg) return;
      // A new SW is already waiting (e.g. app was updated while closed)
      if(reg.waiting){ showUpdateBanner(reg.waiting); }
      // A new SW just finished installing while the app was open
      reg.addEventListener("updatefound", ()=>{
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener("statechange", ()=>{
          if(newWorker.state === "installed" && navigator.serviceWorker.controller){
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch(()=>{});
    // Once the new SW takes control, reload once to serve the fresh version
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{
      if(refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

function showUpdateBanner(waitingWorker){
  const el = document.getElementById("toast");
  clearTimeout(toastTimer);
  el.innerHTML = `${L("New version available.","नया वर्शन उपलब्ध है।")} <strong style="text-decoration:underline">${L("Tap to update","अपडेट के लिए टैप करें")}</strong>`;
  el.classList.add("show");
  el.style.cursor = "pointer";
  el.onclick = ()=>{ waitingWorker.postMessage({type:"SKIP_WAITING"}); };
}

document.addEventListener("DOMContentLoaded", init);
