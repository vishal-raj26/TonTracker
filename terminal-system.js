(() => {
  const GLYPHS = {
    "A":["01110","10001","10001","11111","10001","10001","10001"],"B":["11110","10001","10001","11110","10001","10001","11110"],"C":["01111","10000","10000","10000","10000","10000","01111"],"D":["11110","10001","10001","10001","10001","10001","11110"],
    "E":["11111","10000","10000","11110","10000","10000","11111"],"F":["11111","10000","10000","11110","10000","10000","10000"],"G":["01111","10000","10000","10111","10001","10001","01111"],"H":["10001","10001","10001","11111","10001","10001","10001"],
    "I":["11111","00100","00100","00100","00100","00100","11111"],"J":["00111","00010","00010","00010","10010","10010","01100"],"K":["10001","10010","10100","11000","10100","10010","10001"],"L":["10000","10000","10000","10000","10000","10000","11111"],
    "M":["10001","11011","10101","10101","10001","10001","10001"],"N":["10001","11001","10101","10011","10001","10001","10001"],"O":["01110","10001","10001","10001","10001","10001","01110"],"P":["11110","10001","10001","11110","10000","10000","10000"],
    "Q":["01110","10001","10001","10001","10101","10010","01101"],"R":["11110","10001","10001","11110","10100","10010","10001"],"S":["01111","10000","10000","01110","00001","00001","11110"],"T":["11111","00100","00100","00100","00100","00100","00100"],
    "U":["10001","10001","10001","10001","10001","10001","01110"],"V":["10001","10001","10001","10001","10001","01010","00100"],"W":["10001","10001","10001","10101","10101","11011","10001"],"X":["10001","10001","01010","00100","01010","10001","10001"],
    "Y":["10001","10001","01010","00100","00100","00100","00100"],"Z":["11111","00001","00010","00100","01000","10000","11111"],
    "0":["01110","10001","10011","10101","11001","10001","01110"],"1":["00100","01100","00100","00100","00100","00100","01110"],"2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11110","00001","00001","01110","00001","00001","11110"],
    "4":["00010","00110","01010","10010","11111","00010","00010"],"5":["11111","10000","10000","11110","00001","00001","11110"],"6":["01110","10000","10000","11110","10001","10001","01110"],"7":["11111","00001","00010","00100","01000","01000","01000"],
    "8":["01110","10001","10001","01110","10001","10001","01110"],"9":["01110","10001","10001","01111","00001","00001","01110"],
    "$ ":["00100","01111","10100","01110","00101","11110","00100"],"$":["00100","01111","10100","01110","00101","11110","00100"],"%":["11001","11010","00100","01000","10110","00110","00000"],"+":["000","010","010","111","010","010","000"],"-":["000","000","000","111","000","000","000"],".":["0","0","0","0","0","0","1"],",":["0","0","0","0","0","1","1"],":":["0","1","0","0","1","0","0"],"/":["00001","00010","00010","00100","01000","01000","10000"]," ":["00","00","00","00","00","00","00"]
  };

  const TITLE_SELECTORS = [
    '[data-screen="assets"] .assets-header h1',
    '[data-screen="tokens"] .page-header h1',
    '[data-screen="gifts"] .page-header h1',
    '[data-screen="stickers"] .page-header h1'
  ];
  const VALUE_SELECTORS = [
    '[data-screen="home"] .graph-head h1',
    '[data-screen="assets"] .portfolio-strip article:first-child b',
    '[data-screen="tokens"] .summary-card h2',
    '[data-screen="gifts"] .asset-total-banner h2',
    '[data-screen="stickers"] .asset-total-banner h2'
  ];
  const COMPACT_SELECTORS = [
    '[data-screen="assets"] .portfolio-strip article:nth-child(2) b',
    '[data-screen="assets"] .category-stack article > strong',
    '[data-screen="tokens"] .holdings-list article aside > b'
  ];  function sourceText(element) {
    if (!element) return "";
    if (element.querySelector('.metric-skeleton')) return "";
    if (element.querySelector('.dot-matrix-character')) return element.dataset.dotText || "";
    return element.textContent.trim();
  }

  function render(element, variant) {
    const raw = sourceText(element);
    const text = raw.toUpperCase();
    if (!text || (element.dataset.dotText === text && element.querySelector('.dot-matrix-character'))) return;
    element.dataset.dotText = text;
    element.setAttribute('aria-label', raw);
    element.classList.add('dot-matrix-text', `dot-matrix-${variant}`);
    element.innerHTML = [...text].map((character) => {
      const rows = GLYPHS[character] || GLYPHS[' '];
      const dots = rows.join('').split('').map((dot) => `<i class="dot-matrix-led${dot === '1' ? ' is-on' : ''}"></i>`).join('');
      return `<span class="dot-matrix-character" style="--dot-columns:${rows[0].length}" aria-hidden="true">${dots}</span>`;
    }).join('');
  }

  function applyDisplays(root = document) {
    if (!document.querySelector('.app-frame.has-wallet')) return;
    TITLE_SELECTORS.forEach((selector) => root.querySelectorAll?.(selector).forEach((node) => render(node, 'title')));
    VALUE_SELECTORS.forEach((selector) => root.querySelectorAll?.(selector).forEach((node) => render(node, 'value')));
    COMPACT_SELECTORS.forEach((selector) => root.querySelectorAll?.(selector).forEach((node) => render(node, 'compact')));
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; applyDisplays(document); });
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => !mutation.target.closest?.('.dot-matrix-character'))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  applyDisplays(document);
  window.addEventListener('pageshow', schedule);
})();
