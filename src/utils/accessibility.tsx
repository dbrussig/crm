type AriaLive = 'polite' | 'assertive';

let liveRegion: HTMLDivElement | null = null;

function ensureLiveRegion(): HTMLDivElement {
  if (liveRegion && document.body.contains(liveRegion)) return liveRegion;

  const el = document.createElement('div');
  el.className = 'sr-only';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  document.body.appendChild(el);
  liveRegion = el;
  return el;
}

export function announceToScreenreader(message: string, politeness: AriaLive = 'polite') {
  const el = ensureLiveRegion();
  el.setAttribute('aria-live', politeness);
  // Clear first so repeated messages get announced.
  el.textContent = '';
  window.setTimeout(() => {
    el.textContent = message;
  }, 10);
}

export function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

