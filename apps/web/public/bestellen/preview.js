const samples = [
  { name: 'Testrestaurant Moabit', postcode: '10551', delivery: ['10551'], pickup: true, minutes: '25–40', fee: '2,50 €', minimum: '12,00 €', menu: [{name:'Hähnchen-Bowl',cents:1290},{name:'Gemüse-Bowl',cents:1090}], feeCents:250, minimumCents:1200 },
  { name: 'Testküche Kreuzberg', postcode: '10997', delivery: [], pickup: true, minutes: '15–25', menu: [{name:'Margherita',cents:890},{name:'Pizza mit Gemüse',cents:1190}] }
];

const form = document.getElementById('search');
const results = document.getElementById('restaurants');
const status = document.getElementById('status');

const customerMenu = document.getElementById('customerMenu');
const accountTrackOrder = document.getElementById('accountTrackOrder');
document.addEventListener('click', event => {
  if (!customerMenu.contains(event.target) || event.target.closest('a') === accountTrackOrder) {
    customerMenu.open = false;
  }
});
customerMenu.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !customerMenu.open) return;
  customerMenu.open = false;
  customerMenu.querySelector('summary').focus();
});


const initialSearch = new URLSearchParams(location.search);
const demo = initialSearch.get('demo') === '1';
const favoritesKey = 'bringness.ordering.favorites.' + (demo ? 'demo' : 'restaurants');
const favoritesList = document.getElementById('accountFavorites');
let favorites = new Map();
try {
  favorites = new Map(JSON.parse(localStorage.getItem(favoritesKey) || '[]'));
} catch {}

function renderFavorites() {
  favoritesList.replaceChildren();
  if (!favorites.size) {
    const empty = document.createElement('li');
    empty.textContent = 'Noch keine Restaurants gemerkt.';
    favoritesList.append(empty);
    return;
  }
  for (const entry of favorites.values()) {
    if (typeof entry?.name !== "string" || !/^\d{5}$/.test(entry.postcode) || !["delivery","pickup"].includes(entry.mode)) continue;
    const row = document.createElement('li');
    const link = document.createElement('a');
    const query = new URLSearchParams({postcode:entry.postcode,mode:entry.mode,restaurant:entry.name});
    if (demo) query.set('demo','1');
    link.href = '/bestellen/ergebnisse?' + query;
    link.textContent = entry.name;
    row.append(link);
    favoritesList.append(row);
  }
}
renderFavorites();

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
  accountTrackOrder.hidden = false;
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
  accountTrackOrder.hidden = false;
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
  document.getElementById('deliveryPostcode').textContent = addressFields.hidden ? '' : selection.postcode;
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
  basketMessage.textContent = onlinePickup || selection.mollieTestCheckout
    ? 'Weiterleitung zu Mollie wird vorbereitet …' : 'Testbestellung wird übertragen …';
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
    for (const field of Object.values(addressInputs)) field.value = '';
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
  if (!matches.length) {
    status.textContent = delivery
      ? 'Für diese Postleitzahl wurden keine liefernden Restaurants gefunden.'
      : 'Für diese Postleitzahl wurden keine Restaurants zur Abholung gefunden.';
    const alternate = document.createElement('a');
    const nextSearch = new URLSearchParams({postcode, mode: delivery ? 'pickup' : 'delivery'});
    if (demo) nextSearch.set('demo', '1');
    alternate.href = '/bestellen/ergebnisse?' + nextSearch;
    alternate.textContent = delivery ? 'Mit derselben PLZ nach Abholung suchen' : 'Mit derselben PLZ nach Lieferung suchen';
    results.append(alternate);
    return;
  }
  status.textContent = delivery ? 'Die Restaurants liefern mit eigenen Fahrern.' : 'Abholung direkt im Restaurant.';

  const cards = [];
  for (const restaurant of matches) {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const terms = document.createElement('p');
    title.textContent = restaurant.name;
    terms.textContent = delivery
      ? restaurant.minutes + ' Min. · ' + (demo ? restaurant.fee : money.format(restaurant.feeCents / 100)) +
        ' Lieferung · Mindestbestellwert ' + (demo ? restaurant.minimum : money.format(restaurant.minimumCents / 100))
      : 'Abholung in ' + restaurant.minutes + ' Min.';
    terms.className = 'restaurant-terms';
    const nameRow = document.createElement('div');
    nameRow.className = 'restaurant-name-row';
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'favorite-toggle';
    favorite.setAttribute('aria-label', restaurant.name + ' merken');
    const key = restaurant.id || restaurant.name;
    function updateFavorite() {
      favorite.textContent = favorites.has(key) ? '♥' : '♡';
      favorite.setAttribute('aria-pressed', String(favorites.has(key)));
    }
    updateFavorite();
    favorite.onclick = () => {
      if (favorites.has(key)) favorites.delete(key);
      else favorites.set(key,{name:restaurant.name,postcode,mode});
      try { localStorage.setItem(favoritesKey,JSON.stringify([...favorites])); } catch {}
      updateFavorite();
      renderFavorites();
      if (onlyFavorites.checked) {
        showResults();
        if (card.hidden) filterSummary.focus();
      }
    };
    nameRow.append(title,favorite);
    card.append(nameRow,terms);
    if (restaurant.menu) {
      const menu = document.createElement('details');
      const summary = document.createElement('summary');
      const dishes = document.createElement('ul');
      summary.textContent = 'Beispiel-Speisekarte';
      for (const dish of restaurant.menu) {
        const item = document.createElement('li');
        const add = document.createElement('button');
        item.textContent = dish.name + ' · ' + money.format(dish.cents / 100) + ' ';
        add.type = 'button';
        add.textContent = 'Hinzufügen';
        add.setAttribute('aria-label',dish.name + ' hinzufügen');
        add.onclick = () => addDish(restaurant,delivery,dish);
        item.append(add);
        dishes.append(item);
      }
      menu.open = true;
      menu.append(summary, dishes);
      card.append(menu);
    }
    if (!demo) {
      const menu = document.createElement('details');
      const summary = document.createElement('summary');
      const list = document.createElement('ul');
      summary.textContent = 'Speisekarte ansehen';
      menu.append(summary, list);
      card.append(menu);
      let menuVersion = 0;
      menu.addEventListener('toggle', async () => {
        const currentMenu = ++menuVersion;
        if (!menu.open) return;
        list.replaceChildren();
        const notice = document.createElement('li');
        notice.textContent = 'Speisekarte wird geladen …';
        list.append(notice);
        try {
          const query = new URLSearchParams({postcode,mode,restaurantId:restaurant.id});
          const response = await fetch('/api/v1/delivery-portal/menu?' + query);
          if (!response.ok) throw Error();
          const {menu: dishes,testOrders,mollieTestCheckout,onlinePickup,basketPreview} = await response.json();
          if (currentMenu !== menuVersion || !menu.open) return;
          if (!Array.isArray(dishes)) throw Error('Ungültige Speisekarte');
          if (!dishes.length) {
            notice.textContent = 'Derzeit sind hier keine Gerichte verfügbar.';
            return;
          }
          list.replaceChildren();
          for (const dish of dishes) {
            const item = document.createElement('li');
            item.textContent = dish.name + ' · ' + money.format(dish.cents / 100);
            if (testOrders || onlinePickup || basketPreview) {
              const add = document.createElement('button');
              add.type = 'button';
              add.textContent = onlinePickup ? 'Zum Warenkorb' : 'Zum Testwarenkorb';
              add.onclick = () => addDish(restaurant,delivery,dish,postcode,mollieTestCheckout,onlinePickup,Boolean(basketPreview));
              item.append(' ',add);
            }
            list.append(item);
          }
        } catch {
          notice.textContent = 'Speisekarte konnte nicht geladen werden.';
        }
      });
    }
    cards.push({restaurant, card});
  }

  const discovery = document.getElementById('discovery');
  const filter = document.getElementById('restaurantFilter');
  const sort = document.getElementById('restaurantSort');
  const free = document.getElementById('freeDelivery');
  const onlyFavorites = document.getElementById('onlyFavorites');
  const activeFilters = document.getElementById('activeFilters');
  const filterPanel = document.getElementById('resultFilters');
  const filterSummary = filterPanel.querySelector('summary');
  filterPanel.hidden = false;
  filterPanel.open = !window.matchMedia?.('(max-width: 720px)').matches;
  const count = document.getElementById('discoveryCount');
  discovery.hidden = false;
  count.hidden = false;
  document.getElementById('freeDeliveryFilter').hidden = !delivery;
  for (const option of sort.options) {
    if (['fee','minimum'].includes(option.value)) option.disabled = !delivery;
  }
  const sortFields = {time:'minutes',fee:'feeCents',minimum:'minimumCents'};
  function showResults() {
    const query = filter.value.trim().toLocaleLowerCase('de-DE');
    const field = sortFields[sort.value];
    const displayed = cards.filter(({restaurant}) =>
      restaurant.name.toLocaleLowerCase('de-DE').includes(query) &&
      (!delivery || !free.checked || restaurant.feeCents === 0) &&
      (!onlyFavorites.checked || favorites.has(restaurant.id || restaurant.name)));
    if (field) displayed.sort((a,b) => parseInt(a.restaurant[field],10) - parseInt(b.restaurant[field],10));
    for (const {card} of cards) card.hidden = true;
    for (const {card} of displayed) {
      card.hidden = false;
      results.append(card);
    }
    for (const {card} of cards) {
      if (!card.isConnected) results.append(card);
    }
    activeFilters.replaceChildren();
    for (const [input, label] of [
      [free, 'Kostenlose Lieferung'],
      [onlyFavorites, 'Gemerkte Restaurants']
    ]) {
      if (!input.checked || input.closest('label').hidden) continue;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = label + ' ×';
      remove.setAttribute('aria-label', 'Filter entfernen: ' + label);
      remove.onclick = () => {
        input.checked = false;
        updateFilters();
        filterSummary.focus();
      };
      activeFilters.append(remove);
    }
    activeFilters.hidden = !activeFilters.childElementCount;
    count.textContent = displayed.length === 0 ? 'Keine Restaurants mit diesen Filtern.' :
      displayed.length + (displayed.length === 1 ? ' Restaurant' : ' Restaurants');
  }
  const filterKey = 'bringness.ordering.filters.' + (demo ? 'demo.' : '') + mode + '.' + postcode;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(filterKey)) || {}; } catch {}
  filter.value = initialSearch.get('restaurant') ?? (typeof saved.name === 'string' ? saved.name : '');
  free.checked = delivery && saved.free === true;
  onlyFavorites.checked = saved.favorites === true;
  if ([...sort.options].some(option => option.value === saved.sort && !option.disabled)) {
    sort.value = saved.sort;
  }
  function updateFilters() {
    try {
      sessionStorage.setItem(filterKey, JSON.stringify({
        name:filter.value, free:free.checked, favorites:onlyFavorites.checked, sort:sort.value
      }));
    } catch {}
    showResults();
  }
  filter.oninput = updateFilters;
  free.onchange = updateFilters;
  onlyFavorites.onchange = updateFilters;
  sort.onchange = updateFilters;
  showResults();
}

const initialPostcode = initialSearch.get('postcode');
const initialMode = initialSearch.get('mode');
const hasSearch = /^\d{5}$/.test(initialPostcode ?? '') && ['pickup', 'delivery'].includes(initialMode);
if (demo) {
  form.elements.demo.disabled = false;
  document.getElementById('newSearch').href = '/bestellen/?demo=1';
}

if (hasSearch) {
  document.body.classList.add('search-page');
  document.title = 'Restaurants · Bringness';
  document.getElementById('landingHeading').hidden = true;
  document.getElementById('landingCopy').hidden = true;
  document.getElementById('searchHeading').hidden = false;
  document.getElementById('newSearch').hidden = false;
  const label = document.getElementById('searchLabel');
  const fulfillment = initialMode === 'pickup' ? 'Abholung' : 'Lieferung';
  label.textContent = `· ${fulfillment} · ${initialPostcode}${demo ? ' · Vorschau mit Testrestaurants' : ''}`;
  form.elements.postcode.value = initialPostcode;
  form.elements.mode.value = initialMode;
  void search();
} else if (demo) {
  form.elements.postcode.value = '10551';
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
if (!hasSearch) play(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
