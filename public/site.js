document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
for (const group of document.querySelectorAll('.modules, .faq-list')) {
  for (const detail of group.querySelectorAll('details')) {
    detail.addEventListener('toggle', () => {
      if (detail.open) for (const sibling of group.querySelectorAll('details')) if (sibling !== detail) sibling.open = false;
    });
  }
}
