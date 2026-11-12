// Confirmare la trimiterea formularelor cu data-confirm="mesaj"
document.addEventListener('submit', (e) => {
  const msg = e.target.dataset && e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});

// Trimitere automată la schimbarea unui <select data-autosubmit>
document.addEventListener('change', (e) => {
  if (e.target.matches && e.target.matches('[data-autosubmit]')) e.target.form.submit();
});

// Fallback pentru avatar: dacă imaginea nu se încarcă, afișează prima literă
function applyFallback(img) {
  const span = document.createElement('span');
  span.textContent = img.dataset.fallback;
  img.replaceWith(span);
}
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.dataset.fallback !== undefined) applyFallback(e.target);
}, true);
document.querySelectorAll('img[data-fallback]').forEach((img) => {
  if (img.complete && img.naturalWidth === 0) applyFallback(img);
});