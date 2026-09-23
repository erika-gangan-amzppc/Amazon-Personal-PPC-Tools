/* =====================================================================
   PPC-LIB — shared parsing/analysis logic for every tool in this repo.
   Loaded via <script src="../shared/ppc-lib.js"></script> after xlsx.js.
   Exposes window.PPC = {Utils, Loader, Cols, Metrics, BulkParser,
   SearchTermParser, Rules, Render}.
===================================================================== */
(function(){
"use strict";

/* ---------------- UTILS ---------------- */
const Utils = (function(){

  function detectCurrencySymbol(str){
    if(typeof str !== "string") return null;
    const m = str.match(/[$£€¥₹]/);
    return m ? m[0] : null;
  }

  // Robust locale-agnostic number parser.
  // Handles: "$1,234.50", "£12.50", "12,50 €", "1.234,50", "(123.45)" negative, "45%", "1.2E+03"
  function parseNumber(raw){
    if(raw === null || raw === undefined) return null;
    if(typeof raw === "number") return isFinite(raw) ? raw : null;
    let s = String(raw).trim();
    if(s === "" || s === "-" || s.toLowerCase() === "n/a") return null;

    let negative = false;
    if(/^\(.*\)$/.test(s)){ negative = true; s = s.slice(1,-1); }
    if(s.startsWith("-")){ negative = true; s = s.slice(1); }

    const isPercent = /%\s*$/.test(s);
    s = s.replace(/[$£€¥₹%\s]/g,"");

    if(s === "") return null;

    if(/^[0-9]+\.?[0-9]*e[+-]?[0-9]+$/i.test(s)){
      const v = parseFloat(s);
      return isFinite(v) ? (negative? -v : v) : null;
    }

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if(hasComma && hasDot){
      if(s.lastIndexOf(",") > s.lastIndexOf(".")){
        s = s.replace(/\./g,"").replace(",", ".");
      } else {
        s = s.replace(/,/g,"");
      }
    } else if(hasComma && !hasDot){
      const parts = s.split(",");
      if(parts.length === 2 && parts[1].length <= 2){
        s = parts[0] + "." + parts[1];
      } else {
        s = s.replace(/,/g,"");
      }
    }

    let v = parseFloat(s);
    if(!isFinite(v)) return null;
    if(isPercent) v = v / 100;
    return negative ? -v : v;
  }

  function fmtMoney(v, symbol){
    symbol = symbol || "";
    if(v === null || v === undefined || !isFinite(v)) return "—";
    const neg = v < 0;
    const out = symbol + Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
    return neg ? "-" + out : out;
  }
  function fmtInt(v){
    if(v === null || v === undefined || !isFinite(v)) return "—";
    return Math.round(v).toLocaleString();
  }
  function fmtPct(v, digits){
    digits = digits === undefined ? 2 : digits;
    if(v === null || v === undefined || !isFinite(v)) return "—";
    return (v*100).toFixed(digits) + "%";
  }
  function fmtRatio(v, digits){
    digits = digits === undefined ? 2 : digits;
    if(v === null || v === undefined || !isFinite(v)) return "—";
    return v.toFixed(digits);
  }

  function norm(h){
    return String(h||"").toLowerCase().replace(/\s+/g," ").trim();
  }

  return {detectCurrencySymbol, parseNumber, fmtMoney, fmtInt, fmtPct, fmtRatio, norm};
})();

/* ---------------- FILE LOADERS ---------------- */
const Loader = (function(){

  function readFileAsArrayBuffer(file){
    return new Promise((resolve,reject)=>{
      const r = new FileReader();
      r.onload = ()=>resolve(r.result);
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }
  function readFileAsText(file){
    return new Promise((resolve,reject)=>{
      const r = new FileReader();
      r.onload = ()=>resolve(r.result);
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  async function loadWorkbook(file){
    const buf = await readFileAsArrayBuffer(file);
    return XLSX.read(buf, {type:"array", cellDates:false});
  }

  function findHeaderRowIndex(aoa, mustContainAny){
    const limit = Math.min(aoa.length, 10);
    for(let i=0;i<limit;i++){
      const row = aoa[i].map(c=>Utils.norm(c));
      const hit = row.some(cell => mustContainAny.some(k => cell.includes(k)));
      const nonEmptyCount = row.filter(c=>c!=="").length;
      if(hit && nonEmptyCount >= 3) return i;
    }
    return 0;
  }

  function sheetToObjects(sheet, mustContainAny){
    const aoa = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:""});
    if(aoa.length === 0) return {rows:[], headers:[]};
    const headerIdx = findHeaderRowIndex(aoa, mustContainAny || ["entity","campaign"]);
    const headers = aoa[headerIdx].map(h=>String(h||"").trim());
    const rows = [];
    for(let i=headerIdx+1;i<aoa.length;i++){
      const line = aoa[i];
      if(!line || line.every(c=>c===""||c===undefined||c===null)) continue;
      const obj = {};
      headers.forEach((h,ci)=>{ if(h) obj[h] = line[ci]; });
      rows.push(obj);
    }
    return {rows, headers};
  }

  function parseCSV(text){
    const firstLine = text.split(/\r?\n/).find(l=>l.trim()!=="") || "";
    const counts = {",":0,";":0,"\t":0};
    for(const d of Object.keys(counts)){
      counts[d] = (firstLine.match(new RegExp("\\"+d,"g"))||[]).length;
    }
    const delim = Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0] || ",";

    const rows = [];
    let row = [], field = "", inQuotes = false;
    for(let i=0;i<text.length;i++){
      const c = text[i], next = text[i+1];
      if(inQuotes){
        if(c === '"' && next === '"'){ field+='"'; i++; }
        else if(c === '"'){ inQuotes = false; }
        else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === delim){ row.push(field); field=""; }
        else if(c === "\n"){ row.push(field); rows.push(row); row=[]; field=""; }
        else if(c === "\r"){ /* skip */ }
        else field += c;
      }
    }
    if(field !== "" || row.length){ row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c=>String(c).trim()!==""));
  }

  function csvToObjects(text, mustContainAny){
    const aoa = parseCSV(text);
    if(aoa.length === 0) return {rows:[], headers:[]};
    const headerIdx = findHeaderRowIndex(aoa, mustContainAny || ["asin","sku"]);
    const headers = aoa[headerIdx].map(h=>String(h||"").trim());
    const rows = [];
    for(let i=headerIdx+1;i<aoa.length;i++){
      const line = aoa[i];
      const obj = {};
      headers.forEach((h,ci)=>{ if(h) obj[h] = line[ci]; });
      rows.push(obj);
    }
    return {rows, headers};
  }

  return {loadWorkbook, sheetToObjects, csvToObjects, readFileAsText, parseCSV};
})();

/* ---------------- HEADER MAPPING ---------------- */
const Cols = (function(){

  function pick(obj, patterns, opts){
    opts = opts || {};
    const keys = Object.keys(obj);
    for(const p of patterns){
      for(const k of keys){
        const nk = Utils.norm(k);
        if(opts.exclude && opts.exclude.some(x=>nk.includes(x))) continue;
        if(nk.includes(p)) return obj[k];
      }
    }
    return undefined;
  }

  function getEntity(row){ return String(pick(row, ["entity"]) || "").trim(); }
  function getCampaignName(row){
    return String(pick(row, ["campaign name"], {exclude:["informational"]})
      ?? pick(row, ["campaign name"]) ?? "").trim();
  }
  function getAdGroupName(row){
    return String(pick(row, ["ad group name"], {exclude:["informational"]})
      ?? pick(row, ["ad group name"]) ?? "").trim();
  }
  function getState(row){ return String(pick(row, ["state"], {exclude:["campaign state","ad group state","portfolio"]}) || "").trim().toUpperCase(); }
  function getCampaignId(row){ return String(pick(row, ["campaign id"]) || "").trim(); }
  function getTargetingType(row){ return String(pick(row, ["targeting type"]) || "").trim().toUpperCase(); }
  function getMatchType(row){ return String(pick(row, ["match type"]) || "").trim().toUpperCase(); }
  function getKeywordText(row){ return String(pick(row, ["keyword text"]) || "").trim(); }
  function getTargetingExpr(row){ return String(pick(row, ["product targeting expression"], {exclude:["resolved"]}) || "").trim(); }
  function getAsin(row){
    return String(
      pick(row, ["child) asin","child asin"], {exclude:["targeting"]})
      ?? pick(row, ["asin"], {exclude:["targeting","parent"]})
      ?? pick(row, ["asin"], {exclude:["targeting"]})
      ?? ""
    ).trim().toUpperCase();
  }
  function getSku(row){ return String(pick(row, ["sku"]) || "").trim(); }
  function getSearchTerm(row){ return String(pick(row, ["customer search term"]) ?? pick(row, ["search term"]) ?? "").trim(); }
  function getTargeting(row){ return String(pick(row, ["targeting"], {exclude:["targeting type","targeting expression"]}) || "").trim(); }
  function getDailyBudget(row){ return Utils.parseNumber(pick(row, ["daily budget","budget"], {exclude:["budget rule"]})); }

  function getImpressions(row){ return Utils.parseNumber(pick(row, ["impressions"])) || 0; }
  function getClicks(row){ return Utils.parseNumber(pick(row, ["clicks"], {exclude:["click-through","click thru","ctr"]})) || 0; }
  function getSpend(row){ return Utils.parseNumber(pick(row, ["spend","cost"], {exclude:["cost per click","cpc"]})) || 0; }
  function getSales(row){ return Utils.parseNumber(pick(row, ["sales"], {exclude:["target","acos","advertising cost","roas","return on"]})) || 0; }
  function getOrders(row){ return Utils.parseNumber(pick(row, ["orders","order items"])) || 0; }
  function getUnits(row){ return Utils.parseNumber(pick(row, ["units"])) || 0; }

  return {pick, getEntity, getCampaignName, getAdGroupName, getState, getCampaignId,
    getTargetingType, getMatchType, getKeywordText, getTargetingExpr, getAsin, getSku,
    getSearchTerm, getTargeting, getDailyBudget,
    getImpressions, getClicks, getSpend, getSales, getOrders, getUnits};
})();

/* ---------------- BASE METRICS ---------------- */
const Metrics = (function(){
  function empty(){ return {impressions:0, clicks:0, spend:0, sales:0, orders:0, units:0}; }
  function add(totals, row){
    totals.impressions += Cols.getImpressions(row);
    totals.clicks += Cols.getClicks(row);
    totals.spend += Cols.getSpend(row);
    totals.sales += Cols.getSales(row);
    totals.orders += Cols.getOrders(row);
    totals.units += Cols.getUnits(row);
    return totals;
  }
  function sum(rows){ return rows.reduce(add, empty()); }
  function ratios(t){
    return {
      ctr: t.impressions>0 ? t.clicks/t.impressions : null,
      cpc: t.clicks>0 ? t.spend/t.clicks : null,
      cvr: t.clicks>0 ? t.orders/t.clicks : null,
      acos: t.sales>0 ? t.spend/t.sales : (t.spend>0 ? Infinity : null),
      roas: t.spend>0 ? t.sales/t.spend : null
    };
  }
  return {empty, add, sum, ratios};
})();

/* ---------------- BULK PARSER ---------------- */
const BulkParser = (function(){

  const SHEET_TYPE_HINTS = [
    {type:"Sponsored Products", hints:["sponsored products"]},
    {type:"Sponsored Brands", hints:["sponsored brands"]},
    {type:"Sponsored Display", hints:["sponsored display"]},
  ];

  function classifySheet(name){
    const n = Utils.norm(name);
    for(const h of SHEET_TYPE_HINTS){
      if(h.hints.some(k=>n.includes(k))) return h.type;
    }
    return null;
  }

  async function parse(file){
    const wb = await Loader.loadWorkbook(file);
    const campaigns = [];          // Entity = Campaign
    const targets = [];            // Entity = Keyword | Product targeting
    const productAds = [];         // Entity = Product Ad
    const negatives = [];          // Entity = Negative keyword | Campaign Negative Keyword
    const negativeTargets = [];    // Entity = Negative product targeting
    const placements = [];         // Entity = Bidding adjustment
    const sheetsUsed = [];

    for(const sheetName of wb.SheetNames){
      const adType = classifySheet(sheetName);
      if(!adType) continue;
      sheetsUsed.push(sheetName);
      const {rows} = Loader.sheetToObjects(wb.Sheets[sheetName], ["entity","campaign"]);
      for(const row of rows){
        const entity = Cols.getEntity(row);
        if(entity === "Campaign"){
          campaigns.push({
            adType,
            campaignId: Cols.getCampaignId(row),
            campaignName: Cols.getCampaignName(row),
            state: Cols.getState(row),
            targetingType: Cols.getTargetingType(row) || "MANUAL",
            dailyBudget: Cols.getDailyBudget(row),
            impressions: Cols.getImpressions(row),
            clicks: Cols.getClicks(row),
            spend: Cols.getSpend(row),
            sales: Cols.getSales(row),
            orders: Cols.getOrders(row),
            units: Cols.getUnits(row)
          });
        } else if(entity === "Keyword" || entity === "Product targeting" || entity === "Product Targeting"){
          const isKeyword = entity === "Keyword";
          targets.push({
            adType,
            campaignId: Cols.getCampaignId(row),
            campaignName: Cols.getCampaignName(row),
            adGroupName: Cols.getAdGroupName(row),
            kind: isKeyword ? "keyword" : "productTargeting",
            matchType: isKeyword ? Cols.getMatchType(row) : "",
            text: isKeyword ? Cols.getKeywordText(row) : Cols.getTargetingExpr(row),
            state: Cols.getState(row),
            impressions: Cols.getImpressions(row),
            clicks: Cols.getClicks(row),
            spend: Cols.getSpend(row),
            sales: Cols.getSales(row),
            orders: Cols.getOrders(row),
            units: Cols.getUnits(row)
          });
        } else if(entity === "Product Ad" || entity === "Product ad"){
          const asin = Cols.getAsin(row);
          if(asin){
            productAds.push({adType, campaignId: Cols.getCampaignId(row), campaignName: Cols.getCampaignName(row), asin, sku: Cols.getSku(row), state: Cols.getState(row)});
          }
        } else if(/negative keyword/i.test(entity)){
          const scope = /^campaign/i.test(entity) ? "campaign" : "adGroup";
          negatives.push({
            adType, campaignId: Cols.getCampaignId(row), campaignName: Cols.getCampaignName(row),
            adGroupName: Cols.getAdGroupName(row), scope,
            matchType: Cols.getMatchType(row), text: Cols.getKeywordText(row), state: Cols.getState(row)
          });
        } else if(/negative product targeting/i.test(entity)){
          negativeTargets.push({
            adType, campaignId: Cols.getCampaignId(row), campaignName: Cols.getCampaignName(row),
            adGroupName: Cols.getAdGroupName(row), text: Cols.getTargetingExpr(row), state: Cols.getState(row)
          });
        } else if(entity === "Bidding adjustment"){
          placements.push({
            adType, campaignId: Cols.getCampaignId(row), campaignName: Cols.getCampaignName(row),
            placement: String(Cols.pick(row, ["placement"]) || "").trim(),
            percentage: Utils.parseNumber(Cols.pick(row, ["percentage"])),
            impressions: Cols.getImpressions(row), clicks: Cols.getClicks(row), spend: Cols.getSpend(row),
            sales: Cols.getSales(row), orders: Cols.getOrders(row), units: Cols.getUnits(row)
          });
        }
      }
    }

    const campaignTargetingType = {};
    const campaignAdType = {};
    const campaignDailyBudget = {};
    campaigns.forEach(c=>{
      campaignTargetingType[c.campaignId] = c.targetingType;
      campaignAdType[c.campaignId] = c.adType;
      campaignDailyBudget[c.campaignId] = c.dailyBudget;
    });
    targets.forEach(t=>{ t.campaignTargetingType = campaignTargetingType[t.campaignId] || "MANUAL"; });

    return {campaigns, targets, productAds, negatives, negativeTargets, placements, sheetsUsed,
      campaignTargetingType, campaignAdType, campaignDailyBudget};
  }

  return {parse};
})();

/* ---------------- SEARCH TERM REPORT PARSER ---------------- */
const SearchTermParser = (function(){

  async function parse(file, campaignNameToAdType){
    let sheetsData = [];
    const isCSV = /\.csv$/i.test(file.name);
    if(isCSV){
      const text = await Loader.readFileAsText(file);
      const {rows} = Loader.csvToObjects(text, ["customer search term","search term"]);
      sheetsData.push(rows);
    } else {
      const wb = await Loader.loadWorkbook(file);
      for(const sheetName of wb.SheetNames){
        const {rows} = Loader.sheetToObjects(wb.Sheets[sheetName], ["customer search term","search term"]);
        if(rows.length) sheetsData.push(rows);
      }
    }

    const out = [];
    for(const rows of sheetsData){
      for(const row of rows){
        const searchTerm = Cols.getSearchTerm(row);
        if(!searchTerm) continue;
        const campaignName = Cols.getCampaignName(row);
        let matchType = Cols.getMatchType(row);
        if(!matchType || matchType === "-") matchType = "AUTO";
        out.push({
          searchTerm,
          campaignName,
          adGroupName: Cols.getAdGroupName(row),
          targeting: Cols.getTargeting(row),
          matchType,
          adType: (campaignNameToAdType && campaignNameToAdType[campaignName]) || "Unknown",
          impressions: Cols.getImpressions(row),
          clicks: Cols.getClicks(row),
          spend: Cols.getSpend(row),
          sales: Cols.getSales(row),
          orders: Cols.getOrders(row),
          units: Cols.getUnits(row)
        });
      }
    }
    return out;
  }

  return {parse};
})();

/* ---------------- SHARED RULES ----------------
   Domain rules reused across tools (audit, negation, harvest, ...).
   Kept together so the strict "proven"/"already harvested" definitions
   only ever live in one place. */
const Rules = (function(){

  // Proven = 3+ orders AND >5 impressions AND >5 clicks, judged per row —
  // never aggregate the same term across campaigns to fake this.
  function isProven(r){
    return r.orders >= 3 && r.impressions > 5 && r.clicks > 5;
  }

  // Every Exact keyword text in the account (lowercased), account-wide —
  // NOT scoped to one campaign, because a harvested term is typically
  // promoted into its own dedicated campaign, not the discovery campaign
  // it was found in.
  function existingExactTexts(bulk){
    const set = new Set();
    bulk.targets.forEach(t=>{
      if(t.kind === "keyword" && t.matchType === "EXACT" && t.text){
        set.add(t.text.toLowerCase());
      }
    });
    return set;
  }

  // Every keyword text of a given match type (lowercased), account-wide.
  // Used to check "does this term already have its own dedicated keyword
  // at this same match type" (same-match-type harvest, not promotion).
  function existingKeywordTexts(bulk, matchType){
    const set = new Set();
    bulk.targets.forEach(t=>{
      if(t.kind === "keyword" && t.matchType === matchType && t.text){
        set.add(t.text.toLowerCase());
      }
    });
    return set;
  }

  // Proven search terms (outside Exact) that don't yet have a dedicated
  // Exact keyword anywhere in the account — candidates to promote/graduate
  // into their own Exact keyword.
  function harvestToExactCandidates(bulk, stRows){
    const existingExact = existingExactTexts(bulk);
    const candidates = [];
    for(const r of stRows){
      if(r.matchType === "EXACT") continue;
      if(!isProven(r)) continue;
      if(existingExact.has(r.searchTerm.toLowerCase())) continue;
      candidates.push(r);
    }
    return candidates.sort((a,b)=>b.sales-a.sales);
  }

  // Proven Broad/Phrase search terms that don't yet have their own
  // dedicated keyword AT THE SAME match type — isolating for bid/budget
  // control without necessarily tightening to Exact.
  function harvestSameMatchTypeCandidates(bulk, stRows){
    const existingByType = {
      BROAD: existingKeywordTexts(bulk, "BROAD"),
      PHRASE: existingKeywordTexts(bulk, "PHRASE")
    };
    const candidates = [];
    for(const r of stRows){
      if(r.matchType !== "BROAD" && r.matchType !== "PHRASE") continue;
      if(!isProven(r)) continue;
      const existing = existingByType[r.matchType];
      if(existing.has(r.searchTerm.toLowerCase())) continue;
      candidates.push(r);
    }
    return candidates.sort((a,b)=>b.sales-a.sales);
  }

  // Index of existing negatives so a tool never re-recommends a negative
  // that's already in place. Campaign-scoped negatives suppress the whole
  // campaign; ad-group-scoped negatives only suppress that ad group.
  function buildNegatedIndex(bulk){
    const campaignScoped = new Map();
    const adGroupScoped = new Map();
    (bulk.negatives || []).forEach(n=>{
      const t = (n.text || "").toLowerCase();
      if(!t) return;
      if(n.scope === "campaign"){
        if(!campaignScoped.has(n.campaignId)) campaignScoped.set(n.campaignId, new Set());
        campaignScoped.get(n.campaignId).add(t);
      } else {
        const k = n.campaignId + "||" + n.adGroupName;
        if(!adGroupScoped.has(k)) adGroupScoped.set(k, new Set());
        adGroupScoped.get(k).add(t);
      }
    });
    return {
      isNegated(campaignId, adGroupName, text){
        const t = (text || "").toLowerCase();
        if(!t) return false;
        if(campaignScoped.has(campaignId) && campaignScoped.get(campaignId).has(t)) return true;
        const k = campaignId + "||" + adGroupName;
        if(adGroupScoped.has(k) && adGroupScoped.get(k).has(t)) return true;
        return false;
      }
    };
  }

  function campaignNameToAdTypeMap(campaigns){
    const m = {};
    campaigns.forEach(c=>{ m[c.campaignName] = c.adType; });
    return m;
  }

  function campaignIdByName(campaigns){
    const m = {};
    campaigns.forEach(c=>{ m[c.campaignName] = c.campaignId; });
    return m;
  }

  // Wasted spend: dollars, no click-count gate — even a couple of clicks
  // at real spend with zero orders is a real loss.
  function wastedSpend(rows){
    return rows
      .filter(r=>r.orders===0 && r.spend>0)
      .sort((a,b)=>b.spend-a.spend);
  }

  return {isProven, existingExactTexts, existingKeywordTexts, harvestToExactCandidates,
    harvestSameMatchTypeCandidates, buildNegatedIndex, campaignNameToAdTypeMap, campaignIdByName, wastedSpend};
})();

/* ---------------- RENDER HELPERS ---------------- */
const Render = (function(){
  let chartRefs = [];

  function el(tag, attrs, children){
    const e = document.createElement(tag);
    if(attrs) for(const k in attrs){
      if(k==="class") e.className = attrs[k];
      else if(k==="html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children||[]).forEach(c=>{ if(c) e.appendChild(c); });
    return e;
  }

  function kpiTile(label, value, sub){
    return el("div",{class:"kpi"},[
      el("div",{class:"label",html:label}),
      el("div",{class:"value",html:value}),
      sub ? el("div",{class:"sub",html:sub}) : null
    ]);
  }

  function table(headers, rows, footerRow){
    const t = el("table");
    const thead = el("thead");
    const htr = el("tr");
    headers.forEach(h=>htr.appendChild(el("th",{html:h})));
    thead.appendChild(htr);
    t.appendChild(thead);
    const tbody = el("tbody");
    rows.forEach(r=>{
      const tr = el("tr");
      r.forEach(c=>tr.appendChild(el("td",{html:c})));
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    if(footerRow){
      const tfoot = el("tfoot");
      const tr = el("tr");
      footerRow.forEach(c=>tr.appendChild(el("td",{html:c})));
      tfoot.appendChild(tr);
      t.appendChild(tfoot);
    }
    return el("div",{class:"table-scroll"},[t]);
  }

  function doughnut(canvasId, labels, data, colors){
    const ctx = document.getElementById(canvasId).getContext("2d");
    const chart = new Chart(ctx, {
      type:"doughnut",
      data:{labels, datasets:[{data, backgroundColor:colors, borderWidth:1}]},
      options:{plugins:{legend:{position:"bottom", labels:{boxWidth:10, font:{size:11}}}}, maintainAspectRatio:false}
    });
    chartRefs.push(chart);
  }

  function sectionHeader(root, title, sub){
    root.appendChild(el("h2",{class:"section-title",html:title}));
    if(sub) root.appendChild(el("p",{class:"section-sub",html:sub}));
  }

  return {el, kpiTile, table, doughnut, sectionHeader, get chartRefs(){return chartRefs;}, resetCharts(){ chartRefs.forEach(c=>c.destroy()); chartRefs=[]; }};
})();

window.PPC = {Utils, Loader, Cols, Metrics, BulkParser, SearchTermParser, Rules, Render};

})();
