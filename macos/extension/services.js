"use strict";
// Общий каталог сервисов: OAuth и произвольные сайты сюда не входят.
const MiniServices = Object.freeze({
  entries: Object.freeze([
    Object.freeze({ id: 'claude', label: 'Claude', host: 'claude.ai', url: 'https://claude.ai/' }),
    Object.freeze({ id: 'gemini', label: 'Gemini', host: 'gemini.google.com', url: 'https://gemini.google.com/app' }),
  ]),
  get(id) { return this.entries.find(item => item.id === id) || null; },
  fromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      return this.entries.find(item => item.host === url.hostname) || null;
    } catch { return null; }
  },
  target(value) { return this.fromUrl(value) ? new URL(value).href : null; },
  // В файл экспорта не переносятся query/hash: они могут содержать служебные токены.
  exportUrl(value) {
    if (!this.fromUrl(value)) throw Error('Неизвестный сервис');
    const url = new URL(value);
    return url.origin + url.pathname;
  },
  comparisonKey(service) {
    const item = this.get(service);
    if (!item) throw Error('Неизвестный сервис');
    return 'service-baseline:' + item.id;
  },
});
if (typeof module !== 'undefined') module.exports = MiniServices;
