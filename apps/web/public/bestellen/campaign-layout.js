// Local text preview only; no advertisement publication or restaurant data changes.
(() => {
  const rail = document.querySelector('.campaign-rail');
  const highlights = document.getElementById('restaurantHighlights');
  if (!rail || !highlights) return;
  const sync = () => { rail.hidden = highlights.hidden; };
  new MutationObserver(sync).observe(highlights, { attributes: true, attributeFilter: ['hidden'] });
  sync();
  const editing = location.hostname === 'sandbox-bestellen.bringness.de' &&
    new URLSearchParams(location.search).get('gestaltung') === '1';
  if (!editing) return;
  const key = 'bringness-campaign-design-preview-v1';
  let values = {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) values = saved;
  } catch {}
  document.querySelectorAll('[data-campaign-edit]').forEach(input => {
    const name = input.dataset.campaignEdit;
    const output = document.querySelector('[data-campaign-text="' + name + '"]');
    if (!output) return;
    if (typeof values[name] === 'string') input.value = values[name].slice(0, input.maxLength);
    const apply = () => { output.textContent = input.value; };
    apply();
    input.addEventListener('input', () => {
      apply();
      values[name] = input.value.slice(0, input.maxLength);
      try { localStorage.setItem(key, JSON.stringify(values)); } catch {}
    });
  });
  document.querySelectorAll('.campaign-editor').forEach(el => { el.hidden = false; });
})();
