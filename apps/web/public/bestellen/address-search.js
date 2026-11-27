(() => {
  if (location.hostname !== 'sandbox-bestellen.bringness.de') return;

  const form = document.getElementById('search');
  const postcode = form.elements.postcode;
  const input = document.getElementById('addressSearch');
  const suggestions = document.getElementById('addressSuggestions');
  const message = document.getElementById('addressMessage');
  const locate = document.getElementById('useLocation');
  const isPostcode = value => /^\d{5}$/.test(value);
  const readPostcode = value => value.match(/(?:^|[\s,])(\d{5})(?=$|[\s,])/)?.[1] ?? '';
  let request;
  let timer;
  let revision = 0;
  let chosen;

  input.value = postcode.value;
  postcode.required = false;
  document.getElementById('postcodeField').hidden = true;
  document.getElementById('addressField').hidden = false;
  document.getElementById('addressTools').hidden = false;

  function reset() {
    revision += 1;
    request?.abort();
    clearTimeout(timer);
    suggestions.replaceChildren();
    suggestions.hidden = true;
    locate.disabled = false;
    message.textContent = '';
    return revision;
  }

  async function lookup(path, params, current) {
    const controller = new AbortController();
    request?.abort();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const url = new URL(path, 'https://photon.komoot.io');
      url.search = new URLSearchParams({...params, lang:'de', limit:'6'});
      const response = await fetch(url, {signal:controller.signal, referrerPolicy:'no-referrer'});
      if (!response.ok) throw Error('Adresssuche fehlgeschlagen');
      const result = await response.json();
      if (current !== revision) return;

      const matches = new Map();
      for (const {properties: place} of result.features) {
        if (place.countrycode !== 'DE' || !isPostcode(place.postcode)) continue;
        const street = place.street || (place.type === 'street' ? place.name : '');
        if (!street && !place.city) continue;
        const label = [[street, street && place.housenumber].filter(Boolean).join(' '),
          [place.postcode, place.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        matches.set(label, place.postcode);
      }
      if (!matches.size) {
        message.textContent = 'Keine passende Adresse gefunden. Ergänze den Ort oder gib die PLZ ein.';
        return;
      }
      for (const [label, zip] of matches) {
        const item = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = label;
        option.addEventListener('click', () => {
          reset();
          chosen = {label, zip};
          input.value = label;
          postcode.value = zip;
          input.focus();
          form.requestSubmit();
        });
        item.append(option);
        suggestions.append(item);
      }
      suggestions.hidden = false;
      message.textContent = 'Wähle einen der Adressvorschläge aus.';
    } catch {
      if (current === revision) message.textContent = 'Adresssuche gerade nicht verfügbar. Du kannst direkt eine PLZ eingeben.';
    } finally {
      clearTimeout(timeout);
      if (current === revision) locate.disabled = false;
    }
  }

  input.addEventListener('input', () => {
    const current = reset();
    const value = input.value.trim();
    chosen = undefined;
    postcode.value = readPostcode(value);
    if (value.length >= 4 && /\p{L}/u.test(value)) {
      timer = setTimeout(() => lookup('/api/', {q:value, countrycode:'DE'}, current), 400);
    }
  });

  form.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !suggestions.hidden) {
      event.preventDefault();
      reset();
      input.focus();
    }
    if (event.key === 'ArrowDown' && event.target === input && !suggestions.hidden) {
      event.preventDefault();
      suggestions.querySelector('button')?.focus();
    }
  });

  form.addEventListener('submit', event => {
    const value = input.value.trim();
    postcode.value = chosen?.label === value ? chosen.zip : readPostcode(value);
    if (postcode.value) return;

    event.preventDefault();
    if (!suggestions.hidden) {
      suggestions.querySelector('button')?.focus();
      return;
    }
    const current = reset();
    if (value.length >= 4 && /\p{L}/u.test(value)) {
      message.textContent = 'Adresse wird gesucht …';
      void lookup('/api/', {q:value, countrycode:'DE'}, current);
    } else {
      message.textContent = 'Gib eine Adresse oder eine fünfstellige PLZ ein.';
      input.focus();
    }
  });

  locate.addEventListener('click', () => {
    const current = reset();
    if (!navigator.geolocation) {
      message.textContent = 'Die Standorterkennung ist nicht verfügbar. Gib deine Adresse oder PLZ ein.';
      return;
    }
    locate.disabled = true;
    message.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(({coords}) => {
      if (current !== revision) return;
      void lookup('/reverse', {lat:String(coords.latitude), lon:String(coords.longitude)}, current);
    }, () => {
      if (current !== revision) return;
      locate.disabled = false;
      message.textContent = 'Der Standort konnte nicht ermittelt werden. Gib deine Adresse oder PLZ ein.';
    }, {timeout:8000, maximumAge:60000});
  });
})();
