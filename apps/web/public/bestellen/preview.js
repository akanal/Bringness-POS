const samples = [
  { name: 'Testrestaurant Moabit', postcode: '10551', delivery: ['10551'], pickup: true, minutes: '25–40', fee: '2,50 €', minimum: '12,00 €', menu: [{name:'Hähnchen-Bowl',cents:1290},{name:'Gemüse-Bowl',cents:1090}], feeCents:250, minimumCents:1200 },
  { name: 'Testküche Kreuzberg', postcode: '10997', delivery: [], pickup: true, minutes: '15–25', menu: [{name:'Margherita',cents:890},{name:'Pizza mit Gemüse',cents:1190}] }
];

const form = document.getElementById('search');
const results = document.getElementById('restaurants');
const status = document.getElementById('status');

const demo = new URLSearchParams(location.search).get('demo') === '1';
const customerMenu = document.getElementById('customerMenu');
const favoritesList = document.getElementById('customerFavorites');
const favoritesMessage = document.getElementById('customerFavoritesMessage');
const favoritesKey = 'bringness.ordering.favorites';
let favorites = [];
let accountFavorites = null;
if (!demo) {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey));
    if (Array.isArray(saved)) favorites = saved.filter(item =>
      item && typeof item.id === 'string' && typeof item.name === 'string');
  } catch {}
}

function renderFavorites() {
  favoritesList.replaceChildren();
  favoritesMessage.textContent = favorites.length ? '' : 'Noch keine Restaurants gespeichert.';
  for (const restaurant of favorites) {
    const item = document.createElement('li');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Entfernen';
    remove.setAttribute('aria-label',restaurant.name+' aus Favoriten entfernen');
    remove.onclick = () => toggleFavorite(restaurant);
    item.append(restaurant.name, remove);
    favoritesList.append(item);
  }
  for (const button of document.querySelectorAll('[data-favorite-id]')) {
    const saved = favorites.some(item => item.id === button.dataset.favoriteId);
    button.setAttribute('aria-pressed',String(saved));
    button.textContent = saved ? 'Gespeichert' : 'Als Favorit merken';
  }
}

async function toggleFavorite({id,name}) {
  const update = accountFavorites;
  if (update) {
    try {
      const {favorites:stored} = await update({restaurantId:id,saved:!favorites.some(item=>item.id===id)});
      if (accountFavorites === update) {
        favorites = stored;
        renderFavorites();
      }
    } catch (error) { if (accountFavorites === update) favoritesMessage.textContent = error.message; }
    return;
  }
  const next = favorites.some(item => item.id === id)
    ? favorites.filter(item => item.id !== id)
    : [...favorites,{id,name}];
  try {
    localStorage.setItem(favoritesKey,JSON.stringify(next));
  } catch {
    favoritesMessage.textContent = 'Favoriten konnten auf diesem Gerät nicht gespeichert werden.';
    customerMenu.open = true;
    return;
  }
  favorites = next;
  renderFavorites();
}
if (!demo) {
  customerMenu.hidden = false;
  renderFavorites();
}

const money = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
let searchVersion = 0;
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
const arrival = document.getElementById('estimatedArrival');
const arrivalFormat = new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
const trackingKey = 'bringness.portal.testTracking';
const statusLabels = {
  open:'Eingegangen',kitchen:'Angenommen',preparing:'In Zubereitung',ready:'Abholbereit',
  dispatched:'Unterwegs',collected:'Abgeholt',delivered:'Zugestellt',cancelled:'Storniert'
};
function fulfillmentLabel(status, mode) {
  if (status === 'ready' && mode === 'delivery') return 'Fertig zur Übergabe';
  return Object.hasOwn(statusLabels, status) ? statusLabels[status] : undefined;
}

let tracked;
let trackingTimer;
if (!demo) {
  try { tracked = JSON.parse(sessionStorage.getItem(trackingKey)); } catch {}
}

function followTestOrder(order) {
  clearTimeout(trackingTimer);
  tracked = order;
  arrival.textContent = '';
  tracking.hidden = false;
  document.getElementById('customerCurrentOrder').hidden = false;
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
      const {status,mode,estimatedArrival} = await response.json();
      if (tracked !== order) return;
      const label = fulfillmentLabel(status, mode);
      if (!label) throw Error();
      trackingText.textContent = '#' + order.orderId.slice(0,8) + ' · ' + label;
      terminal = ['collected','delivered','cancelled'].includes(status);
      const estimate = Date.parse(estimatedArrival);
      arrival.textContent = mode === 'delivery' && !terminal && Number.isFinite(estimate)
        ? estimate > Date.now()
          ? 'Voraussichtliche Ankunft gegen ' + arrivalFormat.format(estimate) + ' Uhr'
          : 'Die geschätzte Lieferzeit ist verstrichen.'
        : '';
    } catch {
      if (tracked !== order) return;
      arrival.textContent = '';
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
  tracked = null;
  tracking.hidden = false;
  document.getElementById('customerCurrentOrder').hidden = false;
  trackingText.textContent = paymentLabel+' wird geprüft …';
  const refreshPayment = async () => {
    try {
      const endpoint = live ? 'payment-status' : 'test-payment-status';
      const response = await fetch('/api/v1/delivery-portal/'+endpoint,{
        headers:{authorization:'Bearer '+paymentRequest}
      });
      if (response.status===404) {
        trackingText.textContent = 'Zahlung derzeit nicht abrufbar.';
        return;
      }
      if (!response.ok) throw Error();
      const payment = await response.json();
      if (payment.status==='paid') {
        if (!live) {
          followTestOrder({orderId:payment.orderId,requestId:paymentRequest});
          return;
        }
        const status = fulfillmentLabel(payment.fulfillmentStatus, 'pickup') ?? 'Online bezahlt';
        trackingText.textContent = '#'+payment.orderId.slice(0,8)+' · '+status;
        if (['collected','cancelled'].includes(payment.fulfillmentStatus)) return;
        setTimeout(refreshPayment,5000);
        return;
      }
      if (['canceled','expired','failed','review'].includes(payment.status)) {
        trackingText.textContent = paymentLabel+' konnte nicht freigegeben werden.';
        return;
      }
    } catch {}
    trackingText.textContent = 'Bestätigung steht aus. Status wird erneut abgefragt …';
    setTimeout(refreshPayment,5000);
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
  finish.disabled = sending || Boolean(missing);
}

finish.addEventListener('click', async () => {
  if (basket.hidden || finish.disabled || sending) return;
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

function addDish(restaurant, delivery, dish, postcode = '', mollieTestCheckout = false, onlinePickup = false) {
  if (pendingOrder || sending) return;
  const sameRestaurant = demo ? selection?.restaurant === restaurant : selection?.restaurant.id === restaurant.id;
  if (!sameRestaurant || selection.delivery !== delivery || selection.postcode !== postcode || selection.onlinePickup !== onlinePickup) {
    if (quantities.size && !window.confirm('Den aktuellen Warenkorb ersetzen?')) return;
    quantities.clear();
    selection = {restaurant, delivery, postcode, mollieTestCheckout, onlinePickup};
  }
  if (!demo) dish = [...quantities.keys()].find(entry=>entry.id===dish.id) ?? dish;
  quantities.set(dish, (quantities.get(dish) ?? 0) + 1);
  basketMessage.textContent = '';
  renderBasket();
  basket.scrollIntoView?.({block:'nearest'});
}
if (demo) {
  document.getElementById('searchLabel').textContent = '· Vorschau mit Testrestaurants';
  status.textContent = 'Für die Vorschau kannst du 10551 oder 10997 eingeben.';
}

async function search(showResults = false) {
  const { mode, postcode } = Object.fromEntries(new FormData(form));
  const delivery = mode === 'delivery';
  const version = ++searchVersion;
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
      if (!response.ok) throw Error(data.error);
      matches = data.restaurants;
    }
  } catch {
    if (version === searchVersion) status.textContent = 'Suche derzeit nicht verfügbar. Bitte erneut versuchen.';
    return;
  }
  if (version !== searchVersion) return;
  status.textContent = matches.length
    ? delivery ? 'Die Restaurants liefern mit eigenen Fahrern.' : 'Abholung direkt im Restaurant.'
    : 'Für diese Postleitzahl und Bestellart wurden keine Restaurants gefunden.';

  for (const restaurant of matches) {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const terms = document.createElement('p');
    title.textContent = restaurant.name;
    terms.textContent = delivery
      ? restaurant.minutes + ' Min. · ' + (demo ? restaurant.fee : money.format(restaurant.feeCents / 100)) +
        ' Lieferung · Mindestbestellwert ' + (demo ? restaurant.minimum : money.format(restaurant.minimumCents / 100))
      : 'Abholung in ' + restaurant.minutes + ' Min.';
    card.append(title, terms);
    if (!demo && restaurant.id) {
      const favorite = document.createElement('button');
      favorite.type = 'button';
      favorite.dataset.favoriteId = restaurant.id;
      favorite.onclick = () => toggleFavorite(restaurant);
      card.append(favorite);
    }
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
      menu.addEventListener('toggle', async () => {
        if (!menu.open) return;
        list.replaceChildren();
        const notice = document.createElement('li');
        notice.textContent = 'Speisekarte wird geladen …';
        list.append(notice);
        try {
          const query = new URLSearchParams({postcode,mode,restaurantId:restaurant.id});
          const response = await fetch('/api/v1/delivery-portal/menu?' + query);
          if (!response.ok) throw Error();
          const {menu: dishes,testOrders,mollieTestCheckout,onlinePickup} = await response.json();
          if (!dishes.length) {
            notice.textContent = 'Derzeit sind hier keine Gerichte verfügbar.';
            return;
          }
          list.replaceChildren();
          for (const dish of dishes) {
            const item = document.createElement('li');
            item.textContent = dish.name + ' · ' + money.format(dish.cents / 100);
            if (testOrders || onlinePickup) {
              const add = document.createElement('button');
              add.type = 'button';
              add.textContent = onlinePickup ? 'Zum Warenkorb' : 'Zum Testwarenkorb';
              add.onclick = () => addDish(restaurant,delivery,dish,postcode,mollieTestCheckout,onlinePickup);
              item.append(' ',add);
            }
            list.append(item);
          }
        } catch {
          notice.textContent = 'Speisekarte konnte nicht geladen werden.';
        }
      });
    }
    results.append(card);
  }
  if (!demo) renderFavorites();
  if (showResults) document.getElementById('results-heading').scrollIntoView?.({block:'start'});
}

const postcodeCookie = 'bringness_order_postcode';
const postcodeInput = form.elements.postcode;
const rememberPostcode = form.elements.rememberPostcode;
if (!demo) {
  const stored = document.cookie.match(/(?:^|;\s*)bringness_order_postcode=(\d{5})(?:;|$)/)?.[1];
  if (stored) {
    postcodeInput.value = stored;
    rememberPostcode.checked = true;
  }
}
function savePostcode(value, maxAge) {
  document.cookie = postcodeCookie + '=' + value + '; Max-Age=' + maxAge +
    '; Path=/bestellen; SameSite=Lax; Secure';
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!demo && rememberPostcode.checked && /^\d{5}$/.test(postcodeInput.value)) {
    savePostcode(postcodeInput.value, 30 * 24 * 60 * 60);
  }
  void search(true);
});

form.addEventListener('change', event => {
  if (!demo && event.target === rememberPostcode && !rememberPostcode.checked) savePostcode('',0);
  if (event.target.name === 'mode' && form.reportValidity()) void search();
});

form.addEventListener('input', event => {
  if (event.target.name !== 'postcode') return;
  searchVersion++;
  results.replaceChildren();
  status.textContent = 'Suche starten, um passende Restaurants anzuzeigen.';
});

if (demo) { form.elements.postcode.value = "10551"; void search(); }
let connectAddressBook;
const addressBook = document.getElementById('testAddressBook');
if (!demo && location.hostname === 'sandbox-bestellen.bringness.de') {
  addressBook.hidden = false;
  const addressForm = document.getElementById('saveTestAddress');
  const addressSelect = document.getElementById('savedDeliveryAddress');
  const removeAddress = document.getElementById('removeTestAddress');
  const addressKey = 'bringness.ordering.testAddresses';
  let entries = [];
  let addressAccount = null;
  let addressRequestPending = false;
  const saveAddress = addressForm.querySelector('button');
  let appliedAddressId = '';
  const addressFeedback = document.getElementById('testAddressFeedback');
  function testAddresses() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(addressKey));
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  }
  entries = testAddresses();
  connectAddressBook = async update => {
    addressAccount = update;
    entries = update ? [] : testAddresses();
    addressForm.reset();
    addressFeedback.textContent = '';
    if (appliedAddressId) {
      for (const field of Object.values(addressInputs)) field.value = '';
    }
    appliedAddressId = '';
    renderAddresses();
    document.getElementById('testAddressStorage').textContent = update
      ? 'Bitte nur Beispieldaten eingeben. Adressen werden im Testkonto gespeichert.'
      : 'Bitte nur Beispieldaten eingeben. Adressen bleiben in diesem Tab.';
    setAddressRequestPending(Boolean(update));
    if (update) {
      try {
        const {addresses} = await update();
        if (addressAccount === update) { entries = addresses; renderAddresses(); }
      } finally {
        if (addressAccount === update) setAddressRequestPending(false);
      }
    }
  };

  function setAddressRequestPending(pending) {
    addressRequestPending = pending;
    saveAddress.disabled = pending;
    removeAddress.disabled = pending;
    addressSelect.disabled = pending;
  }
  function renderAddresses(value = '') {
    addressSelect.replaceChildren(new Option('Adresse auswählen',''));
    for (const address of entries) {
      addressSelect.add(new Option(address.label+' · '+address.postcode,address.id));
    }
    addressSelect.value = value;
    removeAddress.hidden = !addressSelect.value;
  }
  function storeAddresses() {
    try { sessionStorage.setItem(addressKey,JSON.stringify(entries)); } catch {}
  }
  function applyAddress() {
    const address = entries.find(entry => entry.id === addressSelect.value);
    removeAddress.hidden = !address;
    if (!address) return;
    if (pendingOrder || sending) {
      addressSelect.value = appliedAddressId;
      removeAddress.hidden = !addressSelect.value;
      addressFeedback.textContent = 'Bitte zuerst die laufende Bestellung abschließen.';
      return;
    }
    addressFeedback.textContent = '';
    appliedAddressId = address.id;
    for (const [key,field] of Object.entries(addressInputs)) field.value = address[key];
    const changed = selection && (!selection.delivery || selection.postcode !== address.postcode);
    postcodeInput.value = address.postcode;
    form.querySelector('[name=mode][value=delivery]').checked = true;
    if (changed && selection) {
      selection = null;
      renderBasket();
      document.getElementById('basketMessage').textContent = '';
    }
    void search();
  }
  addressForm.addEventListener('submit', async event => {
    event.preventDefault();
    const address = Object.fromEntries([...new FormData(addressForm)].map(([key,value])=>[key,value.trim()]));
    if (Object.values(address).some(value=>!value) || !/^\d{5}$/.test(address.postcode)) return;
    const update = addressAccount;
    if (update) {
      if (addressRequestPending) return;
      setAddressRequestPending(true);
      try {
        const {addresses} = await update(address);
        if (addressAccount !== update) return;
        entries = addresses;
        renderAddresses(appliedAddressId);
        addressForm.reset();
        addressFeedback.textContent = 'Adresse im Konto gespeichert.';
      } catch (error) {
        if (addressAccount === update) addressFeedback.textContent = error.message;
      } finally {
        if (addressAccount === update) setAddressRequestPending(false);
      }
      return;
    }
    address.id = crypto.randomUUID();
    entries.push(address);
    storeAddresses();
    renderAddresses(address.id);
    applyAddress();
    addressForm.reset();
  });
  addressSelect.addEventListener('change',applyAddress);
  removeAddress.addEventListener('click',async () => {
    const update = addressAccount;
    if (update) {
      if (addressRequestPending || !addressSelect.value) return;
      setAddressRequestPending(true);
      try {
        const {addresses} = await update({id:addressSelect.value,remove:true});
        if (addressAccount !== update) return;
        entries = addresses;
        renderAddresses();
        addressFeedback.textContent = 'Adresse aus dem Konto entfernt.';
      } catch (error) {
        if (addressAccount === update) addressFeedback.textContent = error.message;
      } finally {
        if (addressAccount === update) setAddressRequestPending(false);
      }
      return;
    }
    entries = entries.filter(address=>address.id!==addressSelect.value);
    storeAddresses();
    renderAddresses();
  });
  renderAddresses();
}
if (!demo && location.hostname === 'sandbox-bestellen.bringness.de') {
  const login = document.getElementById('customerLogin');
  const loginForm = document.getElementById('customerLoginForm');
  const email = document.getElementById('customerEmail');
  const logout = document.getElementById('customerLogout');
  const feedback = document.getElementById('customerLoginMessage');
  login.hidden = false;
  const orderHistory = document.getElementById('customerOrderHistory');
  const orderHistoryList = document.getElementById('customerOrderHistoryList');
  const orderHistoryMessage = document.getElementById('customerOrderHistoryMessage');

  const refreshOrders = document.getElementById('refreshCustomerOrders');

  async function loadOrderHistory() {
    const activeAccount = accountFavorites;
    if (!orderHistory.open || !activeAccount || refreshOrders.disabled) return;
    refreshOrders.disabled = true;
    orderHistoryMessage.textContent = 'Bestellungen werden geladen …';
    try {
      const {orders} = await account('orders');
      if (activeAccount !== accountFavorites || !orderHistory.open) return;
      const expanded = new Set([...orderHistoryList.querySelectorAll('[data-order-id] > details[open]')]
        .map(details => details.parentElement.dataset.orderId));
      orderHistoryList.replaceChildren();
      for (const order of orders) {
        const row = document.createElement('li');
        if (order.id) row.dataset.orderId = order.id;
        const date = new Date(order.date).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'});
        const mode = order.mode === 'delivery' ? 'Lieferung' : 'Abholung';
        const label = fulfillmentLabel(order.status, order.mode) ?? 'Status nicht verfügbar';
        row.textContent = [date, order.restaurant, mode, money.format(order.totalCents / 100), label].join(' · ');
        if (order.mode === 'delivery' && order.estimatedArrival) {
          const estimate = document.createElement('p');
          estimate.textContent = 'Voraussichtliche Ankunft: ' + arrivalFormat.format(new Date(order.estimatedArrival)) + ' Uhr';
          row.append(estimate);
        }
        if (order.items?.length) {
          const details = document.createElement('details');
          details.open = expanded.has(order.id);
          const summary = document.createElement('summary');
          summary.textContent = 'Artikel anzeigen';
          const items = document.createElement('ul');
          for (const item of order.items) {
            const line = document.createElement('li');
            line.textContent = item.quantity + ' × ' + item.name;
            items.append(line);
          }
          details.append(summary, items);
          row.append(details);
        }
        orderHistoryList.append(row);
      }
      orderHistoryMessage.textContent = orders.length ? '' : 'Noch keine bestätigten Testbestellungen.';
    } catch (error) {
      if (activeAccount === accountFavorites && orderHistory.open) orderHistoryMessage.textContent = error.message;
    } finally {
      if (activeAccount === accountFavorites) refreshOrders.disabled = false;
    }
  }
  orderHistory.addEventListener('toggle', loadOrderHistory);
  refreshOrders.addEventListener('click', loadOrderHistory);

  async function account(action,body) {
    const options = body === undefined ? {} : {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
    };
    const response = await fetch('/api/v1/delivery-portal/customer/'+action,options);
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Kundenkonto gerade nicht erreichbar.');
    return result;
  }
  async function showAccount(customer) {
    const update = customer ? body=>account('favorites',body) : null;
    accountFavorites = update;
    refreshOrders.disabled = false;
    orderHistory.open = false;
    orderHistory.hidden = !customer;
    orderHistoryList.replaceChildren();
    orderHistoryMessage.textContent = '';
    if (update) favorites = [];
    else {
      try { favorites = JSON.parse(localStorage.getItem(favoritesKey)) ?? []; }
      catch { favorites = []; }
    }
    document.getElementById('customerFavoritesHeading').textContent = customer ? 'Meine Favoriten' : 'Favoriten auf diesem Gerät';
    renderFavorites();
    loginForm.hidden = Boolean(customer);
    email.hidden = logout.hidden = !customer;
    email.textContent = customer?.email ?? '';
    await connectAddressBook?.(customer ? body=>account('addresses',body) : null);
    if (update) {
      const {favorites:stored} = await update();
      if (accountFavorites === update) {
        favorites = stored;
        renderFavorites();
      }
    }
  }
  loginForm.addEventListener('submit',async event => {
    event.preventDefault();
    try {
      await account('request',{email:loginForm.elements.email.value});
      feedback.textContent = 'Wenn der Link versendet werden konnte, findest du ihn in deinem Postfach.';
    } catch (error) { feedback.textContent = error.message; }
  });
  logout.addEventListener('click',async () => {
    try {
      const {customer} = await account('logout',{});
      await showAccount(customer);
      feedback.textContent = 'Abgemeldet.';
    } catch (error) { feedback.textContent = error.message; }
  });
  const token = /^#kundenlogin=([a-f0-9]{64})$/.exec(location.hash)?.[1];
  if (token) {
    customerMenu.open = true;
    history.replaceState(null,'',location.pathname+location.search);
  }
  (token ? account('confirm',{token}) : account('session')).then(({customer}) => showAccount(customer))
    .catch(error => { feedback.textContent = error.message; });
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
play(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
