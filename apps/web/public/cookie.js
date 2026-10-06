const box=document.querySelector("#cookie-banner");if(box&&!localStorage.getItem("bringness-cookie-choice"))box.classList.add("show");
function cookieChoice(v){localStorage.setItem("bringness-cookie-choice",v);box?.classList.remove("show")}
window.cookieChoice=cookieChoice;