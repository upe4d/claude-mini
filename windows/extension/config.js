"use strict";
const Product = Object.freeze({
  version: '0.13.1',
  edition: 'free',
  cpu: true,
  target: 'https://claude.ai/',
  referral: 'https://cenpad.ru/?ref=02525848c9467138dab152721c9bd0d2&screen=home&utm_source=referral&utm_medium=link&utm_campaign=extension_claude',
  zones: ['', 'UTC', 'Europe/Berlin', 'Europe/London', 'Europe/Paris', 'Europe/Stockholm', 'Europe/Moscow', 'Asia/Tbilisi', 'Asia/Dubai', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles'],
  locales: ['', 'en-US,en', 'en-GB,en', 'ru-RU,ru', 'de-DE,de,en', 'fr-FR,fr,en', 'ar-AE,ar,en'],
  defaults: Object.freeze({...{timezone: '', locale:'en-US,en', cores:0, ui:'ru'}, ...(typeof InstallPreset==='object'?InstallPreset:{})}),
  validate(value) {
    if (!value || !this.zones.includes(value.timezone) || !this.locales.includes(value.locale) || ![0,2,4,8,16].includes(value.cores) || !['ru','en'].includes(value.ui)) throw Error('INVALID_SETTINGS');
    if (!this.cpu && value.cores !== 0) throw Error('PRO_REQUIRED');
    return {timezone: value.timezone, locale: value.locale, cores:value.cores, ui: value.ui};
  },
});
if (typeof module !== 'undefined') module.exports = Product;
