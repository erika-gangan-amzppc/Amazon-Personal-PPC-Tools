/* =====================================================================
   THEME TOGGLE — light/dark switch, matching the data-theme attribute
   pattern used by theme.css. Applies the saved/preferred theme
   immediately (before gate.js reveals the page) to avoid a flash, then
   renders a small toggle button next to the auth controls on
   DOMContentLoaded.

   Load order matters: this script must appear BEFORE gate.js so its
   deferred execution (which sets data-theme) runs before gate.js
   reveals the page.
===================================================================== */
(function(){
"use strict";

const KEY = "ppc_theme";

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
function updateButton(theme){
  if(btnRef) btnRef.textContent = theme === "dark" ? "☀" : "☾";
}

function toggle(){
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  try{ localStorage.setItem(KEY, next); } catch(e){}
  apply(next);
  updateButton(next);
}

function render(){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ppc-theme-btn";
  btn.setAttribute("aria-label", "Toggle dark mode");
  btnRef = btn;
  updateButton(document.documentElement.getAttribute("data-theme") || "light");
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
