(() => {
  const input = document.getElementById('volume');
  const output = document.getElementById('cost');
  const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  function render() {
    const volume = input.valueAsNumber;
    if (!Number.isFinite(volume) || volume < 0 || volume > 100000000) {
      output.textContent = 'Bitte einen gültigen Netto-Warenwert zwischen 0 und 100.000.000 € eingeben.';
      return;
    }
    const introduction = euro.format(volume * 0.02);
    output.textContent = `Während der Einführung: beide Shops ${introduction}. Danach: Basis ${euro.format(volume * 0.08)}, Profi ${euro.format(49 + volume * 0.02)}.`;
  }
  input.addEventListener('input', render);
  render();
})();
