/* Инструкция работает локально и не отправляет сведения о прохождении шагов. */
'use strict';
(() => {
  const panels = [...document.querySelectorAll('[data-panel]')];
  const steps = [...document.querySelectorAll('[data-step]')];
  const status = document.getElementById('status');
  let current = 0;
  function show(index) {
    current = Math.max(0, Math.min(panels.length - 1, index));
    panels.forEach((panel, i) => { panel.hidden = i !== current; });
    steps.forEach((step, i) => {
      if (i === current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      step.classList.toggle('complete', i < current);
    });
    history.replaceState(null, '', '#install/' + (current + 1));
    status.textContent = '';
  }
  async function copy(text) {
    status.classList.remove('error');
    try {
      try { await navigator.clipboard.writeText(text); }
      catch {
        const input = document.createElement('textarea');
        input.value = text;
        input.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
        document.body.append(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw Error('Адрес не скопирован');
      }
      status.textContent = 'Адрес скопирован. В отдельном браузере нажмите ⌘L → ⌘V → Enter.';
    } catch {
      status.classList.add('error');
      status.textContent = 'Скопируйте адрес вручную: ' + text;
    }
  }
  steps.forEach(step => step.addEventListener('click', () => show(Number(step.dataset.step))));
  document.querySelectorAll('.next').forEach(button => button.addEventListener('click', () => show(current + 1)));
  document.querySelectorAll('.previous').forEach(button => button.addEventListener('click', () => show(current - 1)));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copy(button.dataset.copy)));
  document.getElementById('workspace-copy').addEventListener('click', () => copy('chrome-extension://jnbpljkmhjfhjhmbkeneinfnohebdopg/workspace.html'));
  const fromHash = location.hash.match(/^#install\/([1-4])$/);
  show(location.hash === '#launch' ? 1 : fromHash ? Number(fromHash[1]) - 1 : 0);
})();
