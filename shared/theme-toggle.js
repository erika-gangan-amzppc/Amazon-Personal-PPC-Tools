/* =====================================================================
   THEME TOGGLE — light/dark switch, matching the data-theme attribute
   pattern used by theme.css. Applies the saved/preferred theme
   immediately (before gate.js reveals the page) to avoid a flash, then
   renders a colorful icon toggle button next to the auth controls on
   DOMContentLoaded. All visual styling (gradient, glow, icon color)
   lives in shared/theme.css (.ppc-theme-btn) -- this file is markup/logic.

   Load order matters: this script must appear BEFORE gate.js so its
   deferred execution (which sets data-theme) runs before gate.js
   reveals the page.
===================================================================== */
(function(){
"use strict";

const KEY = "ppc_theme";

const ICON_SUN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.2 19.8L6 18M18 6l1.8-1.8"/></g></svg>';
const ICON_MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20.2 14.6A8.4 8.4 0 1 1 9.4 3.8a6.9 6.9 0 0 0 10.8 10.8Z" fill="currentColor"/><path d="M17.5 2.5l.55 1.3 1.3.55-1.3.55-.55 1.3-.55-1.3-1.3-.55 1.3-.55.55-1.3Z" fill="currentColor"/></svg>';

function getPreferred(){
  try{
    const saved = localStorage.getItem(KEY);
    if(saved === "light" || saved === "dark") return saved;
  } catch(e){}
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}

function apply(theme){
  document.documentElement.setAttribute("data-theme", theme);
}

let btnRef = null;
function updateIcon(theme){
  if(!btnRef) return;
  btnRef.innerHTML = theme === "dark" ? ICON_MOON : ICON_SUN;
  btnRef.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function toggle(){
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  try{ localStorage.setItem(KEY, next); } catch(e){}
  btnRef.classList.add("spin");
  setTimeout(()=>{
    apply(next);
    updateIcon(next);
    btnRef.classList.remove("spin");
  }, 180);
}

function render(){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ppc-theme-btn";
  btnRef = btn;
  updateIcon(document.documentElement.getAttribute("data-theme") || "light");
  btn.addEventListener("click", toggle);

  const slot = document.getElementById("ppcAuthSlot");
  if(slot && slot.parentNode){
    slot.parentNode.insertBefore(btn, slot);
  } else {
    document.body.appendChild(btn);
  }
}

apply(getPreferred());
document.addEventListener("DOMContentLoaded", render);

})();
