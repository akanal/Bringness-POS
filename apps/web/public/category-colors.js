// Stable category colors shared by POS and Service; no stored category data.
window.categoryTone=function(id){let hash=0;for(const char of String(id))hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;return hash%6;};
