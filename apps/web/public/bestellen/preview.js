const samples = [
  { name: 'Testrestaurant Moabit', postcode: '10551', delivery: ['10551'], pickup: true, minutes: '25–40', fee: '2,50 €', minimum: '12,00 €', menu: [{name:'Hähnchen-Bowl',cents:1290},{name:'Gemüse-Bowl',cents:1090}], feeCents:250, minimumCents:1200 },
  { name: 'Testküche Kreuzberg', postcode: '10997', delivery: [], pickup: true, minutes: '15–25', menu: [{name:'Margherita',cents:890},{name:'Pizza mit Gemüse',cents:1190}] }
];

const form = document.getElementById('search');
const results = document.getElementById('restaurants');
const status = document.getElementById('status');

const initialSearch = new URLSearchParams(location.search);
const demo = initialSearch.get('demo') === '1';
const restaurantKey = initialSearch.get('restaurant');
const category = initialSearch.get('category');
const storefront = document.getElementById('storefront');

function orderingUrl(filters) {
  const params = new URLSearchParams(filters);
  if (demo) params.set('demo', '1');
  return '/bestellen/?' + params;
}

async function renderStorefront(restaurant, mode, postcode) {
  const heading = document.getElementById('storefrontName');
  const list = document.getElementById('storefrontMenu');
  if (!restaurant) {
    heading.textContent = 'Shop nicht verfügbar';
    status.textContent = 'Für diesen Bestellort und diese Bestellart ist der Shop nicht verfügbar.';
    return;
  }

  heading.textContent = restaurant.name;
  document.title = restaurant.name + ' · Bringness';
  const delivery = mode === 'delivery';
  document.getElementById('storefrontTerms').textContent = delivery
    ? `${restaurant.minutes} Min. · ${money.format(restaurant.feeCents / 100)} Lieferung · Mindestbestellwert ${money.format(restaurant.minimumCents / 100)}`
    : `Abholung in ${restaurant.minutes} Min.`;
  status.textContent = 'Speisekarte wird geladen …';

  try {
    let menu = restaurant.menu;
    let checkout = {};
    if (!demo) {
      const params = new URLSearchParams({postcode, mode, restaurantId: restaurant.id});
      const response = await fetch('/api/v1/delivery-portal/menu?' + params);
      if (!response.ok) throw Error('menu');
      checkout = await response.json();
      menu = checkout.menu;
    }
    if (!Array.isArray(menu)) throw Error('menu');
    status.textContent = menu.length ? '' : 'Derzeit sind keine Gerichte verfügbar.';
    document.getElementById('storefrontMenuHeading').hidden = !menu.length;
    for (const dish of menu) {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = dish.name;
      const price = document.createElement('span');
      price.textContent = money.format(dish.cents / 100);
      item.append(title, price);
      if (demo || checkout.testOrders || checkout.onlinePickup || checkout.basketPreview) {
        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = demo || !checkout.onlinePickup ? 'Zum Testwarenkorb' : 'Zum Warenkorb';
        add.setAttribute('aria-label', dish.name + ' · ' + add.textContent);
        add.onclick = () => addDish(restaurant, delivery, dish, postcode,
          checkout.mollieTestCheckout, checkout.onlinePickup, Boolean(checkout.basketPreview));
        item.append(add);
      }
      list.append(item);
    }
  } catch {
    status.textContent = 'Speisekarte konnte nicht geladen werden. Bitte lade die Seite erneut.';
  }
}

const money = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const basket = document.getElementById('demoBasket');
const basketItems = document.getElementById('basketItems');
const basketTotal = document.getElementById('basketTotal');
const basketMessage = document.getElementById('basketMessage');
const addressFields = document.getElementById('deliveryAddress');
const addressInputs = {
  recipient:document.getElementById('deliveryRecipient'),
  street:document.getElementById('deliveryStreet'),
  city:document.getElementById('deliveryCity')
};
const finish = document.getElementById('finishDemo');
let selection = null;
let pendingOrder = null;
let sending = false;
const tracking = document.getElementById('testTracking');
const trackingText = document.getElementById('testTrackingStatus');
const trackingKey = 'bringness.portal.testTracking';
const statusLabels = {
  open:'Eingegangen',kitchen:'Angenommen',preparing:'In Zubereitung',ready:'Abholbereit',
  dispatched:'Unterwegs',collected:'Abgeholt',delivered:'Zugestellt',cancelled:'Storniert'
};
let tracked;
let trackingTimer;
if (!demo) {
  try { tracked = JSON.parse(sessionStorage.getItem(trackingKey)); } catch {}
}

function followTestOrder(order) {
  clearTimeout(trackingTimer);
  tracked = order;
  tracking.hidden = false;
  trackingText.textContent = '#' + order.orderId.slice(0,8) + ' · Eingegangen';
  try { sessionStorage.setItem(trackingKey,JSON.stringify(order)); } catch {}

  async function refresh() {
    let terminal = false;
    try {
      const response = await fetch('/api/v1/delivery-portal/test-status',{
        headers:{authorization:'Bearer ' + order.requestId}
      });
      if (!response.ok) {
        terminal = response.status === 404;
        throw Error();
      }
      const {status,mode} = await response.json();
      if (tracked !== order) return;
      const label = status === 'ready' && mode === 'delivery' ? 'Fertig zur Übergabe' : statusLabels[status];
      if (!label) throw Error();
      trackingText.textContent = '#' + order.orderId.slice(0,8) + ' · ' + label;
      terminal = ['collected','delivered','cancelled'].includes(status);
    } catch {
      if (tracked !== order) return;
      trackingText.textContent = terminal ? 'Testbestellung nicht mehr verfügbar.' : 'Status wird erneut abgefragt …';
    }
    if (!terminal && tracked === order) trackingTimer = setTimeout(refresh,4000);
  }
  void refresh();
}
const paymentReturn = !demo && /^#(onlinezahlung|zahlung)=([a-f0-9-]{36})$/i.exec(location.hash);
if (!paymentReturn && tracked?.orderId && tracked.requestId) followTestOrder(tracked);
if (paymentReturn) {
  const [,kind,paymentRequest] = paymentReturn;
  const live = kind==='onlinezahlung';
  const paymentLabel = live ? 'Onlinezahlung' : 'Mollie-Testzahlung';
  if (live) document.getElementById('orderTrackingHeading').textContent = 'Status deiner Abholbestellung';
  clearTimeout(trackingTimer);
  const paymentTracking = {};
  tracked = paymentTracking;
  tracking.hidden = false;
  trackingText.textContent = paymentLabel+' wird geprüft …';
  const refreshPayment = async () => {
    try {
      const endpoint = live ? 'payment-status' : 'test-payment-status';
      const response = await fetch('/api/v1/delivery-portal/'+endpoint,{
        headers:{authorization:'Bearer '+paymentRequest}
      });
      if (tracked !== paymentTracking) return;
      if (response.status===404) {
        trackingText.textContent = 'Zahlung derzeit nicht abrufbar.';
        return;
      }
      if (!response.ok) throw Error();
      const payment = await response.json();
      if (tracked !== paymentTracking) return;
      if (payment.status==='paid') {
        if (typeof payment.orderId !== 'string' || !payment.orderId) throw Error();
        if (!live) {
          history.replaceState(null,'',location.pathname+location.search);
          followTestOrder({orderId:payment.orderId,requestId:paymentRequest});
          return;
        }
        const status = statusLabels[payment.fulfillmentStatus] ?? 'Online bezahlt';
        trackingText.textContent = '#'+payment.orderId.slice(0,8)+' · '+status;
        if (['collected','cancelled'].includes(payment.fulfillmentStatus)) return;
        trackingTimer = setTimeout(refreshPayment,5000);
        return;
      }
      if (['canceled','expired','failed','review'].includes(payment.status)) {
        trackingText.textContent = paymentLabel+' konnte nicht freigegeben werden.';
        return;
      }
    } catch {}
    if (tracked !== paymentTracking) return;
    trackingText.textContent = 'Bestätigung steht aus. Status wird erneut abgefragt …';
    trackingTimer = setTimeout(refreshPayment,5000);
  };
  void refreshPayment();
}
const quantities = new Map();

function renderBasket() {
  basket.hidden = !selection || quantities.size === 0;
  basketItems.replaceChildren();
  if (basket.hidden) return;
  const {restaurant, delivery} = selection;
  addressFields.hidden = !delivery || !selection.mollieTestCheckout;
  addressFields.disabled = addressFields.hidden || Boolean(pendingOrder);
  document.getElementById('basketRestaurant').textContent = restaurant.name + (delivery ? ' · Lieferung' : ' · Abholung');
  let subtotal = 0;
  for (const [dish, quantity] of quantities) {
    const row = document.createElement('li');
    const remove = document.createElement('button');
    row.textContent = quantity + ' × ' + dish.name + ' · ' + money.format(dish.cents * quantity / 100) + ' ';
    remove.type = 'button';
    remove.textContent = '1 entfernen';
    remove.setAttribute('aria-label','Eine Portion ' + dish.name + ' entfernen');
    remove.disabled = Boolean(pendingOrder);
    remove.onclick = () => {
      if (quantity === 1) quantities.delete(dish);
      else quantities.set(dish, quantity - 1);
      basketMessage.textContent = '';
      renderBasket();
    };
    row.append(remove);
    basketItems.append(row);
    subtotal += dish.cents * quantity;
  }
  const fee = delivery ? restaurant.feeCents : 0;
  const missing = delivery ? Math.max(0,restaurant.minimumCents - subtotal) : 0;
  basketTotal.textContent = 'Gesamt ' + money.format((subtotal + fee) / 100) +
    (fee ? ' · inkl. ' + money.format(fee / 100) + ' Lieferung' : '');
  document.getElementById('basketMinimum').textContent = missing
    ? 'Zum Mindestbestellwert fehlen ' + money.format(missing / 100) + '.' : '';
  document.getElementById('basketHeading').textContent = selection.onlinePickup ? 'Warenkorb' : 'Testwarenkorb';
  finish.textContent = selection.onlinePickup ? 'Zahlungspflichtig bestellen' : selection.mollieTestCheckout ? 'Mit Mollie testen' : 'Testbestellung senden';
  finish.hidden = selection.basketPreview;
  finish.disabled = selection.basketPreview || sending || Boolean(missing);
  document.getElementById('basketPreviewNotice').hidden = !selection.basketPreview;
}

finish.addEventListener('click', async () => {
  if (basket.hidden || finish.disabled || sending || selection.basketPreview) return;
  if (demo) {
    basketMessage.textContent = 'Testbestellung abgeschlossen. Es wird nichts bezahlt oder an das Restaurant gesendet.';
    finish.disabled = true;
    return;
  }

  const {restaurant, delivery, postcode, onlinePickup} = selection;
  let address;
  if (delivery && selection.mollieTestCheckout && !pendingOrder) {
    for (const field of Object.values(addressInputs)) {
      if (!field.value.trim()) {
        basketMessage.textContent = 'Bitte die Lieferadresse vollständig eingeben.';
        field.focus();
        return;
      }
    }
    address = Object.fromEntries(Object.entries(addressInputs).map(([key,field])=>[key,field.value.trim()]));
  }
  pendingOrder ??= {
    requestId:crypto.randomUUID(), restaurantId:restaurant.id, postcode,
    mode:delivery ? 'delivery' : 'pickup',
    address,
    items:[...quantities].map(([dish,qty])=>({id:dish.id,qty})),
    expectedTotalCents:[...quantities].reduce((sum,[dish,qty])=>sum+dish.cents*qty,0) +
      (delivery ? restaurant.feeCents : 0)
  };
  sending = true;
  renderBasket();
  basketMessage.textContent = onlinePickup ? 'Weiterleitung zu Mollie wird vorbereitet …' : 'Testbestellung wird übertragen …';
  try {
    const endpoint = onlinePickup ? 'checkout' : selection.mollieTestCheckout ? 'test-checkout' : 'test-order';
    const response = await fetch('/api/v1/delivery-portal/'+endpoint,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pendingOrder)
    });
    const result = await response.json();
    if (!response.ok) {
      if ([400,404,409].includes(response.status)) pendingOrder = null;
      throw Error(result.error || 'Übertragung fehlgeschlagen.');
    }
    if (onlinePickup || selection.mollieTestCheckout) {
      if (result.checkoutUrl) location.assign(result.checkoutUrl);
      else basketMessage.textContent = 'Mollie hat den Start noch nicht bestätigt. Erneut klicken, um denselben Vorgang abzurufen.';
      return;
    }
    basketMessage.textContent = 'In der Testkasse eingegangen · #' + result.orderId.slice(0,8);
    if (paymentReturn && location.hash === paymentReturn[0]) history.replaceState(null,'',location.pathname+location.search);
    followTestOrder({orderId:result.orderId,requestId:pendingOrder.requestId});
    pendingOrder = null;
    selection = null;
    quantities.clear();
    basket.hidden = true;
    status.textContent = basketMessage.textContent;
  } catch (error) {
    basketMessage.textContent = pendingOrder
      ? 'Antwort fehlt. Erneut klicken, um denselben Vorgang abzugleichen.'
      : error.message;
  } finally {
    sending = false;
    renderBasket();
  }
});

function addDish(restaurant, delivery, dish, postcode = '', mollieTestCheckout = false, onlinePickup = false, basketPreview = false) {
  if (pendingOrder || sending) return;
  const sameRestaurant = demo ? selection?.restaurant === restaurant : selection?.restaurant.id === restaurant.id;
  if (!sameRestaurant || selection.delivery !== delivery || selection.postcode !== postcode || selection.onlinePickup !== onlinePickup ||
      selection.mollieTestCheckout !== mollieTestCheckout || selection.basketPreview !== basketPreview) {
    if (quantities.size && !window.confirm('Den aktuellen Warenkorb ersetzen?')) return;
    quantities.clear();
    selection = {restaurant, delivery, postcode, mollieTestCheckout, onlinePickup, basketPreview};
  }
  const previousDish = demo ? dish : [...quantities.keys()].find(entry => entry.id === dish.id);
  const previousQuantity = quantities.get(previousDish) ?? 0;
  const changedPrice = previousQuantity > 0 && previousDish.cents !== dish.cents;
  const changedDelivery = delivery && quantities.size > 0 &&
    (selection.restaurant.feeCents !== restaurant.feeCents || selection.restaurant.minimumCents !== restaurant.minimumCents);
  if (previousDish && previousDish !== dish) quantities.delete(previousDish);
  selection.restaurant = restaurant;
  quantities.set(dish, previousQuantity + 1);
  basketMessage.textContent = changedPrice || changedDelivery
    ? 'Preis oder Lieferkonditionen wurden aktualisiert. Bitte prüfe den neuen Gesamtbetrag.'
    : '';
  renderBasket();
  basket.scrollIntoView?.({block:'nearest'});
}
if (demo) {
  document.getElementById('searchLabel').textContent = '· Vorschau mit Testrestaurants';
  status.textContent = 'Für die Vorschau kannst du 10551 oder 10997 eingeben.';
}

async function search() {
  const { mode, postcode } = Object.fromEntries(new FormData(form));
  const delivery = mode === 'delivery';
  results.replaceChildren();
  status.textContent = 'Restaurants werden gesucht …';
  let matches;
  try {
    if (demo) {
      matches = samples.filter(restaurant => delivery
        ? restaurant.delivery.includes(postcode)
        : restaurant.pickup && restaurant.postcode === postcode);
    } else {
      const query = new URLSearchParams({postcode,mode});
      const response = await fetch('/api/v1/delivery-portal/restaurants?' + query);
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.restaurants)) throw Error(data.error);
      matches = data.restaurants;
    }
  } catch {
    status.textContent = 'Suche derzeit nicht verfügbar. Bitte erneut versuchen.';
    return;
  }
  if (restaurantKey) {
    const restaurant = matches.find(entry => String(entry.id ?? entry.name) === restaurantKey);
    await renderStorefront(restaurant, mode, postcode);
    return;
  }
  status.textContent = matches.length
    ? delivery ? 'Die Restaurants liefern mit eigenen Fahrern.' : 'Abholung direkt im Restaurant.'
    : 'Für diese Postleitzahl und Bestellart wurden keine Restaurants gefunden.';

  for (const restaurant of matches) {
    const card = document.createElement('article');
    card.className = 'restaurant-card';
    card.dataset.name = restaurant.name;
    card.id = 'restaurant-result-' + results.childElementCount;
    card.dataset.lowFee = String(Number.isFinite(restaurant.feeCents) && restaurant.feeCents < 100);
    card.dataset.restaurantKey = restaurant.id ?? restaurant.name;
    card.dataset.minutes = Number.parseInt(restaurant.minutes, 10);
    card.dataset.maxMinutes = String(String(restaurant.minutes).match(/\d+$/)?.[0] ?? 'Infinity');
    card.dataset.freeDelivery = String(restaurant.feeCents === 0);
    const title = document.createElement('h3');
    const terms = document.createElement('p');
    title.textContent = restaurant.name;
    terms.textContent = delivery
      ? restaurant.minutes + ' Min. · ' + (demo ? restaurant.fee : money.format(restaurant.feeCents / 100)) +
        ' Lieferung · Mindestbestellwert ' + (demo ? restaurant.minimum : money.format(restaurant.minimumCents / 100))
      : 'Abholung in ' + restaurant.minutes + ' Min.';
    if (demo || (location.hostname === 'sandbox-bestellen.bringness.de' && restaurant.name === 'Bringness Sandbox Restaurant')) {
      const photo = document.createElement('img');
      photo.src = '/bestellen/pizza.webp';
      photo.alt = '';
      photo.className = 'restaurant-photo';
      const cover = document.createElement('div');
      cover.className = 'restaurant-cover';
      cover.append(photo, title);
      card.append(cover);
    }
    if (!title.parentNode) card.append(title);
    terms.className = 'restaurant-terms';
    const shopLink = document.createElement('a');
    shopLink.className = 'restaurant-shop-link';
    shopLink.href = orderingUrl({mode, postcode, restaurant: restaurant.id ?? restaurant.name});
    shopLink.setAttribute('aria-label', restaurant.name + ' · Shop öffnen');
    shopLink.append(...card.children, terms);
    card.append(shopLink);
    results.append(card);
  }
  if (hasSearch && matches.length) setUpRestaurantControls(delivery);
}

function setUpRailNavigation(track, prefix) {
  const arrows = document.getElementById(prefix + 'Arrows');
  const previous = document.getElementById(prefix + 'Previous');
  const next = document.getElementById(prefix + 'Next');
  function updateArrows() {
    const remaining = track.scrollWidth - track.clientWidth - track.scrollLeft;
    arrows.hidden = track.scrollWidth <= track.clientWidth + 1;
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = remaining <= 1;
  }
  previous.onclick = () => track.scrollBy({left:-track.clientWidth});
  next.onclick = () => track.scrollBy({left:track.clientWidth});
  track.onscroll = updateArrows;
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateArrows).observe(track);
  return updateArrows;
}

function setUpRestaurantControls(delivery) {
  const controls = document.getElementById('restaurantControls');
  const query = document.getElementById('restaurantQuery');
  const sort = document.getElementById('restaurantSort');
  const free = document.getElementById('freeDelivery');
  const lowFee = document.getElementById('lowFee');
  const quick = document.getElementById('quickSwitch');
  const favoriteSwitch = document.getElementById('favoriteSwitch');
  const count = document.getElementById('restaurantCount');
  const cards = [...results.children];
  const all = document.getElementById('showAllRestaurants');
  const fast = document.getElementById('showFastRestaurants');
  const favoritesOnly = document.getElementById('showFavorites');
  const storageKey = 'bringness-ordering-favorites';
  let favorites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) favorites = new Set(saved);
  } catch {}
  let onlyFavorites = false;
  document.getElementById('restaurantDiscovery').hidden = false;

  for (const card of cards) {
    const key = card.dataset.restaurantKey;
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'restaurant-favorite';
    favorite.setAttribute('aria-label', card.dataset.name + ' als Favorit speichern');
    const render = () => {
      favorite.textContent = favorites.has(key) ? '♥' : '♡';
      favorite.setAttribute('aria-pressed', String(favorites.has(key)));
    };
    favorite.onclick = () => {
      if (favorites.has(key)) favorites.delete(key);
      else favorites.add(key);
      try { localStorage.setItem(storageKey, JSON.stringify([...favorites])); } catch {}
      render();
      update();
    };
    render();
    card.append(favorite);
  }
  controls.hidden = false;
  document.getElementById('restaurantToolbar').hidden = false;
  document.getElementById('restaurantHighlights').hidden = false;
  count.hidden = false;
  document.getElementById('freeDeliveryField').hidden = !delivery;
  document.getElementById('lowFeeField').hidden = !delivery;

  const updateRestaurantArrows = setUpRailNavigation(results, 'restaurant');

  function update() {
    all.setAttribute('aria-pressed', String(!onlyFavorites && sort.value === 'default' && !free.checked && !lowFee.checked && !quick.checked && !query.value.trim()));
    fast.setAttribute('aria-pressed', String(sort.value === 'time'));
    favoritesOnly.setAttribute('aria-pressed', String(onlyFavorites));
    favoriteSwitch.checked = onlyFavorites;
    const ordered = [...cards];
    if (sort.value === 'time') ordered.sort((a, b) => Number(a.dataset.minutes) - Number(b.dataset.minutes));
    if (sort.value === 'name') ordered.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name, 'de'));
    const term = query.value.trim().toLocaleLowerCase('de');
    let shown = 0;
    for (const card of ordered) {
      card.hidden = !card.dataset.name.toLocaleLowerCase('de').includes(term) ||
        (delivery && free.checked && card.dataset.freeDelivery !== 'true') ||
        (delivery && lowFee.checked && card.dataset.lowFee !== 'true') ||
        (quick.checked && !(Number(card.dataset.maxMinutes) <= 30)) ||
        (onlyFavorites && !favorites.has(card.dataset.restaurantKey));
      if (!card.hidden) shown += 1;
      results.append(card);
    }
    updateRestaurantArrows();
    count.textContent = shown === 0 ? 'Keine Restaurants für diesen Filter.' :
      shown === 1 ? '1 Restaurant' : shown + ' Restaurants';
  }
  query.oninput = update;
  sort.onchange = update;
  free.onchange = update;
  lowFee.onchange = update;
  quick.onchange = update;
  favoriteSwitch.onchange = () => { onlyFavorites = favoriteSwitch.checked; update(); };
  function clearFilters() {
    query.value = '';
    sort.value = 'default';
    free.checked = false;
    lowFee.checked = false;
    quick.checked = false;
    onlyFavorites = false;
    update();
  }
  function showHighlightedResults() {
    (results.querySelector('article:not([hidden])') ?? count).scrollIntoView?.({block:'nearest'});
  }
  document.getElementById('highlightAll').onclick = () => { clearFilters(); showHighlightedResults(); };
  document.getElementById('highlightFast').onclick = () => {
    quick.checked = true;
    sort.value = 'time';
    update();
    showHighlightedResults();
  };
  document.getElementById('highlightFavorites').onclick = () => {
    onlyFavorites = true;
    update();
    showHighlightedResults();
  };
  all.onclick = clearFilters;
  document.getElementById('clearRestaurantFilters').onclick = clearFilters;
  fast.onclick = () => { sort.value = sort.value === 'time' ? 'default' : 'time'; update(); };
  favoritesOnly.onclick = () => { onlyFavorites = !onlyFavorites; update(); };
  update();
}

const initialPostcode = initialSearch.get('postcode');
const initialMode = initialSearch.get('mode');
const hasSearch = /^\d{5}$/.test(initialPostcode ?? '') && ['pickup', 'delivery'].includes(initialMode);
if (demo) {
  form.elements.demo.disabled = false;
  document.querySelector('.brand').href = '/bestellen/?demo=1';
}

const categoryLinks = Array.from(document.querySelectorAll('.shop-categories a'));
const activeCategory = categoryLinks.find(link => link.dataset.category === category);
const marketCategory = activeCategory && category !== 'essen';
for (const link of categoryLinks) {
  const filters = {category: link.dataset.category};
  if (hasSearch) Object.assign(filters, {mode: initialMode, postcode: initialPostcode});
  link.href = orderingUrl(filters);
  if (link === activeCategory) link.setAttribute('aria-current', 'page');
}
if (marketCategory || (category === 'essen' && !hasSearch)) {
  document.body.classList.add('category-page');
  const label = activeCategory.querySelector('strong').textContent;
  document.title = label + ' · Bringness';
  document.getElementById('results-heading').textContent = label;
  status.textContent = marketCategory ? 'Für diese Kategorie sind derzeit keine Angebote verfügbar.' : '';
  if (!marketCategory) {
    const chooseLocation = document.createElement('a');
    chooseLocation.href = orderingUrl({}) + '#search';
    chooseLocation.textContent = 'Bestellort auswählen';
    status.append(chooseLocation);
  }
}

if (hasSearch && !marketCategory) {
  document.body.classList.add('search-page');
  document.title = 'Restaurants · Bringness';
  document.getElementById('landingHeading').hidden = true;
  document.getElementById('landingCopy').hidden = true;
  document.getElementById('searchHeading').hidden = false;
  const label = document.getElementById('searchLabel');
  const fulfillment = initialMode === 'pickup' ? 'Abholung' : 'Lieferung';
  label.textContent = `· ${fulfillment} · ${initialPostcode}${demo ? ' · Vorschau mit Testrestaurants' : ''}`;
  const orderingMenu = document.getElementById('orderingMenu');
  const menuStatus = document.getElementById('orderingMenuStatus');
  orderingMenu.hidden = false;
  document.getElementById('orderingLanguage').hidden = false;
  orderingMenu.addEventListener('toggle', () => {
    if (!orderingMenu.open) menuStatus.textContent = '';
  });
  function openMenuSection(section, emptyMessage) {
    if (section.hidden) {
      menuStatus.textContent = emptyMessage;
      return;
    }
    orderingMenu.open = false;
    section.scrollIntoView?.({block:'start'});
    section.setAttribute('tabindex', '-1');
    section.focus({preventScroll:true});
  }
  document.getElementById('menuBasket').onclick = () => openMenuSection(basket, 'Dein Warenkorb ist leer.');
  document.getElementById('menuTracking').onclick = () => openMenuSection(tracking, 'Es gibt noch keine Bestellung in dieser Sitzung.');
  document.getElementById('menuFavorites').onclick = () => {
    const discovery = document.getElementById('restaurantDiscovery');
    if (!discovery.hidden) {
      const favoriteFilter = document.getElementById('showFavorites');
      if (favoriteFilter.getAttribute('aria-pressed') !== 'true') favoriteFilter.click();
    }
    openMenuSection(discovery, 'Für diese Suche sind keine Restaurants verfügbar.');
  };
  form.elements.postcode.value = initialPostcode;
  form.elements.mode.value = initialMode;
  document.getElementById('orderingLocation').hidden = false;
  document.getElementById('locationSummary').textContent = initialPostcode;
  document.getElementById('locationEditor').append(form);
  for (const [mode, id] of [['delivery','headerDelivery'], ['pickup','headerPickup']]) {
    const link = document.getElementById(id);
    const params = new URLSearchParams({mode, postcode:initialPostcode});
    if (demo) params.set('demo','1');
    link.href = '/bestellen/?' + params;
    if (mode === initialMode) link.setAttribute('aria-current','page');
  }
  if (restaurantKey) {
    document.body.classList.add('storefront-page');
    storefront.hidden = false;
    document.getElementById('storefrontBack').href = orderingUrl({mode: initialMode, postcode: initialPostcode});
    document.getElementById('menuFavorites').hidden = true;
  }
  void search();
}

const scenes = [...document.querySelectorAll('.scene')];
const selectors = [...document.querySelectorAll('[data-slide]')];
const campaign = document.getElementById('campaign');
const autoplay = document.getElementById('autoplay');
let activeSlide = 0;
let timer;
function showSlide(index) {
  activeSlide = index;
  scenes.forEach((scene, i) => scene.classList.toggle('active', i === index));
  selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  campaign.hidden = index !== 1;
}
function play(enabled) {
  clearInterval(timer);
  timer = enabled ? setInterval(() => {
    if (!document.hidden) showSlide((activeSlide + 1) % scenes.length);
  }, 6500) : null;
  autoplay.textContent = enabled ? 'Pause' : 'Abspielen';
}
selectors.forEach((button, index) => button.addEventListener('click', () => {
  play(false);
  showSlide(index);
}));
autoplay.addEventListener('click', () => play(!timer));
if (!hasSearch && !activeCategory) play(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
