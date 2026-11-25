if (location.hash === '#installieren') {
  document.getElementById('installieren').open = true;
}

const statusBadge = document.getElementById('delivery-status');
const dispatch = document.getElementById('dispatch');
const deliver = document.getElementById('deliver');

dispatch.addEventListener('click', () => {
  statusBadge.textContent = 'Unterwegs';
  dispatch.disabled = true;
  deliver.disabled = false;
  deliver.classList.add('primary');
});

deliver.addEventListener('click', () => {
  statusBadge.textContent = 'Zugestellt';
  deliver.disabled = true;
});
