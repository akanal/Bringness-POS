(() => {
  const rid = new URLSearchParams(location.search).get('restaurantId');
  const token = localStorage.getItem('bringness-pos-token');
  const form = document.getElementById('deliveryPortalSettings');
  if (!rid || !token || !form) return;

  const fields = form.elements;
  const status = form.querySelector('[role=status]');
  const inputs = form.querySelector('fieldset');
  const current = () => localStorage.getItem('bringness-pos-token') === token;
  const endpoint = '/api/v1/pos/delivery-portal?restaurantId=' + encodeURIComponent(rid);

  async function request(settings) {
    if (!current()) throw Error('Bitte den Betrieb erneut öffnen.');
    const response = await fetch(endpoint,{
      method:settings ? 'PUT' : 'GET',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:settings ? JSON.stringify(settings) : undefined
    });
    const data = await response.json();
    if (!current()) throw Error('Anmeldung geändert.');
    if (!response.ok) throw Object.assign(Error(data.error || 'Bestellportal nicht verfügbar.'),{status:response.status});
    return data;
  }

  const searchLinks = document.createElement('p');
  const menuNotice = document.createElement('p');
  status.after(searchLinks, menuNotice);
  let productsById = new Map();

  function showSavedSearches(settings) {
    searchLinks.replaceChildren();
    const searches = [
      ...(settings.pickup ? [['pickup', settings.postcode, 'Abholung']] : []),
      ...(settings.delivery ? settings.zones.map(zone => ['delivery', zone, 'Lieferung']) : [])
    ];
    for (const [mode, postcode, label] of searches) {
      if (!/^\d{5}$/.test(postcode)) continue;
      const link = document.createElement('a');
      link.href = '/bestellen/?' + new URLSearchParams({mode, postcode});
      link.textContent = label + ' für ' + postcode + ' ansehen';
      searchLinks.append(link, document.createElement('br'));
    }
    if (!searchLinks.childElementCount) searchLinks.textContent = 'Für diesen Standort ist keine Abhol- oder Liefersuche aktiviert.';
    menuNotice.textContent = searches.length && !settings.productIds.some(id => productsById.get(id)?.active)
      ? 'Für die Speisekarte ist kein aktiver Artikel ausgewählt.'
      : '';
  }

  request().then(({settings,products}) => {
    productsById = new Map(products.map(product => [product.id, product]));
    const list = document.getElementById('deliveryPortalProducts');
    const selected = new Set(settings.productIds);
    for (const product of products) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'productIds';
      checkbox.value = product.id;
      checkbox.checked = selected.has(product.id);
      label.append(checkbox, ' ' + product.name + (product.active ? '' : ' (inaktiv)'));
      list.append(label);
    }
    if (!products.length) list.textContent = 'Noch keine Artikel vorhanden.';
    fields.pickup.checked = settings.pickup;
    fields.delivery.checked = settings.delivery;
    fields.postcode.value = settings.postcode;
    fields.zones.value = settings.zones.join(', ');
    fields.minutes.value = settings.minutes;
    fields.fee.value = settings.feeCents / 100;
    fields.minimum.value = settings.minimumCents / 100;
    inputs.disabled = false;
    form.hidden = false;
    showSavedSearches(settings);
  }).catch(error => {
    if (!current() || [401,403].includes(error.status)) return;
    status.textContent = error.message;
    form.hidden = false;
  });

  const merchant = document.getElementById('deliveryMerchant');
  const verify = document.getElementById('verifyDeliveryMerchant');
  const unlink = document.getElementById('unlinkDeliveryMerchant');
  const merchantStatus = document.getElementById('deliveryMerchantStatus');
  const merchantUrl = '/api/v1/pos/delivery-portal/merchant?restaurantId=' + encodeURIComponent(rid);

  let merchantState;
  async function loadMerchant(method = 'GET') {
    if (!current()) return;
    verify.disabled = true;
    unlink.disabled = true;
    try {
      const response = await fetch(merchantUrl,{method,headers:{authorization:'Bearer '+token},cache:'no-store'});
      const data = await response.json();
      if (!current()) return;
      if ([401,403].includes(response.status)) { merchant.hidden = true; return; }
      merchant.hidden = false;
      if (!response.ok) throw Error(data.error || 'Mollie-Verbindung derzeit nicht verfügbar.');
      merchantState = data;
      merchantStatus.textContent = data.ready ? 'Mollie-Profil für diesen Standort verifiziert.'
        : data.configured && data.connectionReady === false ? 'Mollie-Verbindung im Bereich Center prüfen oder erneut verbinden.'
        : data.linked ? 'Die Freigabe für das Bestellportal ist abgelaufen. Bitte das Profil erneut prüfen.'
        : data.configured ? 'Mollie-Profil vorhanden. Zuordnung für das Bestellportal steht aus.'
        : 'Für diesen Standort ist noch kein Mollie-Profil hinterlegt.';
      verify.disabled = !data.configured;
      unlink.disabled = !data.linked;
    } catch (error) {
      if (!current()) return;
      merchantStatus.textContent = error.message;
      verify.disabled = !merchantState?.configured;
      unlink.disabled = !merchantState?.linked;
    }
  }

  verify.onclick = () => loadMerchant('PUT');
  unlink.onclick = () => loadMerchant('DELETE');
  void loadMerchant();
  addEventListener('storage', () => {
    if (!current()) {
      form.hidden = true;
      merchant.hidden = true;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const settings = {
      productIds:new FormData(form).getAll('productIds'),
      pickup:fields.pickup.checked, delivery:fields.delivery.checked,
      postcode:fields.postcode.value.trim(),
      zones:fields.zones.value.split(/[\s,]+/).filter(Boolean),
      minutes:fields.minutes.valueAsNumber,
      feeCents:Math.round(fields.fee.valueAsNumber * 100),
      minimumCents:Math.round(fields.minimum.valueAsNumber * 100)
    };
    inputs.disabled = true;
    try {
      const saved = await request(settings);
      showSavedSearches(saved.settings);
      status.textContent = 'Standorteinstellungen gespeichert.';
    } catch (error) { status.textContent = error.message; }
    finally { inputs.disabled = !current(); }
  });
})();
