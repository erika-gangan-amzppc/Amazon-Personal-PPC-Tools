/* =====================================================================
   GATE — lightweight client-side password gate.
   NOT real security (anything client-side can be bypassed via view-source
   or devtools) -- it just keeps casual visitors and search engines out of
   a personal tool that happens to sit on a public URL. No PPC report data
   ever touches this: every tool parses files entirely in-browser.

   Usage: <script src="../shared/gate.js" defer></script> in <head>, plus
   this critical inline style in <head> to prevent a flash of content:
     <style>body{visibility:hidden}</style>
   And an empty <span id="ppcAuthSlot"></span> somewhere in the header for
   the "Log out" control to attach to (falls back to a floating button).
   All visual styling lives in shared/theme.css (#ppcGateOverlay,
   .ppc-logout-btn) -- this file is markup/logic only.

   Unlock persists per-browser via localStorage. A bookmarkable magic link
   (?key=your-password) unlocks automatically and then scrubs the password
   out of the URL bar.
===================================================================== */
(function(){
"use strict";

const STORAGE_KEY = "ppc_tools_unlocked_v1";
const PASSWORD_HASH = "fb3bb8fc05da968868e8cadd1fb657978faabeeec7ecfc6b8ccaa28ba6fef699";

const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2.5" fill="currentColor"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
const ICON_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><polyline points="15 17 20 12 15 7"/><line x1="20" y1="12" x2="8" y2="12"/></svg>';

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function isUnlocked(){
  return localStorage.getItem(STORAGE_KEY) === "1";
}
function setUnlocked(){
  localStorage.setItem(STORAGE_KEY, "1");
}
function setLocked(){
  localStorage.removeItem(STORAGE_KEY);
}

function renderLogoutControl(){
  const slot = document.getElementById("ppcAuthSlot");
  const btn = document.createElement("button");
  btn.className = "ppc-logout-btn";
  btn.innerHTML = ICON_LOGOUT + "<span>Log out</span>";
  btn.addEventListener("click", ()=>{
    setLocked();
    location.reload();
  });
  if(slot){
    slot.appendChild(btn);
  } else {
    btn.style.position = "fixed";
    btn.style.bottom = "16px";
    btn.style.right = "16px";
    btn.style.zIndex = "9998";
    document.body.appendChild(btn);
  }
}

function reveal(){
  document.body.style.visibility = "visible";
  renderLogoutControl();
}

function renderGate(){
  const overlay = document.createElement("div");
  overlay.id = "ppcGateOverlay";
  overlay.innerHTML =
    '<div class="ppc-gate-card">' +
      '<div class="ppc-gate-icon">' + ICON_LOCK + '</div>' +
      '<h1>Personal PPC Tools</h1>' +
      '<p>Private workspace. Enter the password to continue.</p>' +
      '<form id="ppcGateForm">' +
        '<input type="password" id="ppcGateInput" placeholder="Password" autocomplete="current-password" autofocus>' +
        '<button type="submit">Unlock</button>' +
      '</form>' +
      '<div class="ppc-gate-error" id="ppcGateError" style="display:none;">Incorrect password — try again.</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.visibility = "visible"; // overlay itself must be visible; page content stays covered by it

  const form = document.getElementById("ppcGateForm");
  const input = document.getElementById("ppcGateInput");
  const err = document.getElementById("ppcGateError");
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const hash = await sha256(input.value);
    if(hash === PASSWORD_HASH){
      setUnlocked();
      overlay.remove();
      renderLogoutControl();
    } else {
      err.style.display = "block";
      input.value = "";
      input.focus();
    }
  });
}

async function checkUrlKey(){
  const params = new URLSearchParams(location.search);
  const key = params.get("key");
  if(!key) return false;
  const hash = await sha256(key);
  if(hash === PASSWORD_HASH){
    setUnlocked();
    params.delete("key");
    const qs = params.toString();
    const newUrl = location.pathname + (qs ? "?" + qs : "") + location.hash;
    history.replaceState({}, "", newUrl);
    return true;
  }
  return false;
}

async function init(){
  await checkUrlKey();
  if(isUnlocked()){
    reveal();
  } else {
    renderGate();
  }
}

init();

})();
