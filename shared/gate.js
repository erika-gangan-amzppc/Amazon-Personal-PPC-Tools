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

   Unlock persists per-browser via localStorage. A bookmarkable magic link
   (?key=your-password) unlocks automatically and then scrubs the password
   out of the URL bar.
===================================================================== */
(function(){
"use strict";

const STORAGE_KEY = "ppc_tools_unlocked_v1";
const PASSWORD_HASH = "fb3bb8fc05da968868e8cadd1fb657978faabeeec7ecfc6b8ccaa28ba6fef699";

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

function injectStyles(){
  if(document.getElementById("ppcGateStyles")) return;
  const style = document.createElement("style");
  style.id = "ppcGateStyles";
  style.textContent = `
    #ppcGateOverlay{
      position:fixed; inset:0; z-index:9999; visibility:visible;
      display:flex; align-items:center; justify-content:center;
      background:radial-gradient(circle at 30% 20%, #1f2e29 0%, #12181a 60%, #0c1012 100%);
      padding:20px;
    }
    #ppcGateOverlay .ppc-gate-card{
      background:#ffffff; border-radius:16px; padding:36px 32px; max-width:360px; width:100%;
      box-shadow:0 24px 60px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.15);
      text-align:center; animation:ppcGateIn .35s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes ppcGateIn{ from{ opacity:0; transform:translateY(8px) scale(.98); } to{ opacity:1; transform:none; } }
    #ppcGateOverlay .ppc-gate-icon{
      width:48px; height:48px; margin:0 auto 16px; border-radius:12px;
      background:linear-gradient(135deg,#2f6f5e,#4a9c85); display:flex; align-items:center; justify-content:center;
      font-size:22px; box-shadow:0 8px 20px rgba(47,111,94,.35);
    }
    #ppcGateOverlay h1{ font-size:18px; margin:0 0 6px; color:#1b2430; letter-spacing:-.01em; }
    #ppcGateOverlay p{ font-size:13px; color:#5b6472; margin:0 0 22px; line-height:1.5; }
    #ppcGateOverlay input{
      width:100%; padding:11px 14px; border:1.5px solid #e2e6ec; border-radius:9px; font-size:14px;
      outline:none; transition:border-color .15s, box-shadow .15s; text-align:center; letter-spacing:.02em;
    }
    #ppcGateOverlay input:focus{ border-color:#2f6f5e; box-shadow:0 0 0 3px rgba(47,111,94,.15); }
    #ppcGateOverlay button{
      width:100%; margin-top:12px; padding:11px; border:none; border-radius:9px;
      background:linear-gradient(135deg,#2f6f5e,#3f8a74); color:#fff; font-size:14px; font-weight:600;
      cursor:pointer; transition:filter .15s, transform .1s;
    }
    #ppcGateOverlay button:hover{ filter:brightness(1.08); }
    #ppcGateOverlay button:active{ transform:scale(.98); }
    #ppcGateOverlay .ppc-gate-error{
      margin-top:14px; font-size:12.5px; color:#b3452c; font-weight:600;
      animation:ppcGateShake .3s;
    }
    @keyframes ppcGateShake{ 0%,100%{transform:translateX(0);} 25%{transform:translateX(-4px);} 75%{transform:translateX(4px);} }
    .ppc-logout-btn{
      font-size:12px; color:#5b6472; background:none; border:1px solid #e2e6ec; border-radius:999px;
      padding:4px 12px; cursor:pointer; transition:border-color .15s, color .15s;
    }
    .ppc-logout-btn:hover{ border-color:#b3452c; color:#b3452c; }
  `;
  document.head.appendChild(style);
}

function renderLogoutControl(){
  const slot = document.getElementById("ppcAuthSlot");
  const btn = document.createElement("button");
  btn.className = "ppc-logout-btn";
  btn.textContent = "Log out";
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
    btn.style.background = "#fff";
    document.body.appendChild(btn);
  }
}

function reveal(){
  document.body.style.visibility = "visible";
  renderLogoutControl();
}

function renderGate(){
  injectStyles();
  const overlay = document.createElement("div");
  overlay.id = "ppcGateOverlay";
  overlay.innerHTML =
    '<div class="ppc-gate-card">' +
      '<div class="ppc-gate-icon">&#128274;</div>' +
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
