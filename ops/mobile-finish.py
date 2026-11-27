from pathlib import Path
p=Path('/opt/bringness-delivery-sandbox/apps/web/public/bestellen')
f=p/'style.css'
s=f.read_text()
if 'mobile-contrast-finish' not in s:f.write_text(s+'\n/* mobile-contrast-finish */\n'+"\nmain>section[aria-labelledby=\"results-heading\"]{padding:20px clamp(16px,6vw,96px) 48px;background:#242a2e;color:#f3ede4}\n.search-page #restaurantControls:not([hidden]),.search-page .restaurant-card{background:#343b40;color:#f3ede4;border-color:#788087}\n.restaurant-card summary{color:#ffbe8d}.search-page #restaurantCount,#orderingLanguage{color:#ded5c9}\n.restaurant-switch input{min-height:22px}.restaurant-switch{min-height:44px}\n#search input[type=radio],#search input[type=checkbox]{min-height:0;width:auto}\n@media(max-width:650px){.search-page #restaurantControls:not([hidden]){grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px}.search-page #restaurantControls h3,.search-page #restaurantControls>button{grid-column:1/-1}.search-page .result-layout{grid-template-columns:minmax(0,1fr)}.search-page #restaurantControls .restaurant-switch:not([hidden]){font-size:.9rem}.search-page #restaurantControls button{min-height:44px}}\n@media(max-width:350px){.search-page #restaurantControls:not([hidden]){grid-template-columns:minmax(0,1fr)}}\n")
f=p/'index.html'
f.write_text(f.read_text().replace('mobile-icons-20261127','mobile-icons-20261127b'))
print('CONTRAST_OK')
