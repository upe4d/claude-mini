'use strict';

const element = id => document.getElementById(id);
const pages = [...document.querySelectorAll('[data-step]')];
const query = new URLSearchParams(location.search);
const browserId = ['chrome', 'edge', 'brave'].includes(query.get('browser')) ? query.get('browser') : 'chrome';
const browserNames = {chrome: 'Chrome', edge: 'Microsoft Edge', brave: 'Brave'};
let step = 0, busy = false, settingsState = null, connection = null, baseline = null;
let connectionSkipped = false, privacySkipped = false;
const allowedTimezone = zone => !!zone && zone !== 'Europe/Moscow';

function ensureLegacyTimezone(settings) {
  if (settings.timezone === 'Europe/Moscow' && !element('setup-timezone').querySelector('option[value="Europe/Moscow"]')) {
    addOption(element('setup-timezone'), 'Europe/Moscow', 'Москва — выберите другой пояс', true);
  }
}

function renderRegion() {
  const zone = element('setup-timezone').value;
  const warning = element('setup-region-warning');
  warning.hidden = zone !== 'Europe/Moscow';
  warning.textContent = 'В старых настройках сохранена Москва. Выберите пояс региона подключения перед сохранением и запуском Claude.';
  const ready = !!settingsState && allowedTimezone(settingsState.settings.timezone);
  element('open-claude').disabled = busy || !ready;
  element('open-workspace').disabled = busy || !ready;
}

function notify(text, kind = '') {
  element('notice').textContent = text;
  element('notice').dataset.kind = kind;
}

function send(type, details = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({type, ...details}, result => {
      const error = chrome.runtime.lastError;
      if (error || !result?.ok) reject(Error(error?.message || result?.error || 'Не удалось выполнить действие.'));
      else resolve(result);
    });
  });
}

function canContinue() {
  if (busy) return false;
  if (step === 0) return element('keep-confirmed').checked;
  if (step === 1) return element('pin-confirmed').checked;
  if (step === 2) return !!settingsState && allowedTimezone(element('setup-timezone').value) && !!element('setup-locale').value;
  if (step === 3) return privacySkipped || settingsState?.privacy?.value === 'disable_non_proxied_udp';
  if (step === 4) return !!connection || connectionSkipped;
  if (step === 5) return element('banner-confirmed').checked;
  return false;
}

function render() {
  pages.forEach((page, index) => page.hidden = index !== step);
  document.querySelectorAll('.progress li').forEach((item, index) => {
    if (index === step) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  element('counter').textContent = 'Шаг ' + (step + 1) + ' из ' + pages.length;
  element('back').disabled = busy || step === 0;
  element('next').hidden = step === pages.length - 1;
  element('next').disabled = !canContinue();
  element('next').textContent = step === 2 ? 'Сохранить и дальше →' : 'Дальше →';
  element('connection-remember').disabled = busy || !connection;
  renderRegion();
}

function show(index) {
  step = Math.max(0, Math.min(pages.length - 1, index));
  notify('');
  render();
  window.scrollTo({top: 0, behavior: 'instant'});
}

async function run(button, task) {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;
  notify('');
  render();
  try { await task(); }
  catch (error) {
    const messages = {
      CONNECTION_FAILED: 'Не удалось проверить подключение. Проверьте интернет или VPN и повторите.',
      CHECK_CONNECTION_FIRST: 'Сначала нажмите «Проверить подключение».',
      WEBRTC_CONFLICT: 'WebRTC управляется другой настройкой. Проверьте её или продолжите с текущим ограничением.',
      SELECT_SETTINGS: 'Выберите язык и часовой пояс на шаге 3 и сохраните их.',
      SELECT_REGION_TIMEZONE: 'Выберите и сохраните пояс региона подключения на шаге 3. Московский пояс в этой подготовке не используется.',
      SELECT_SUPPORTED_TIMEZONE: 'Вернитесь на шаг 3, выберите пояс региона подключения и сохраните его. Москва не используется для запуска в этой подготовке.',
      INVALID_SETTINGS: 'Выберите настройки из списков и повторите сохранение.',
      LAUNCH_FAILED: 'Не удалось открыть вкладку с настройками. Закройте DevTools этой вкладки и повторите.',
    };
    notify(messages[error.message] || 'Не получилось: ' + error.message, 'error');
  }
  finally {
    busy = false;
    if (button) button.disabled = false;
    render();
  }
}

function addOption(select, value, label, disabled = false) {
  const option = document.createElement('option');
  option.value = value; option.textContent = label; option.disabled = disabled;
  select.append(option);
}

function setupFields() {
  const locales = {'': 'Как в браузере', 'en-US,en': 'English · US — рекомендуем', 'en-GB,en': 'English · UK', 'ru-RU,ru': 'Русский', 'de-DE,de,en': 'Deutsch', 'fr-FR,fr,en': 'Français', 'ar-AE,ar,en': 'العربية'};
  addOption(element('setup-locale'), '', 'Выберите язык сайтов', true);
  Product.locales.filter(Boolean).forEach(value => addOption(element('setup-locale'), value, locales[value] || value));
  addOption(element('setup-timezone'), '', 'Выберите часовой пояс', true);
  Product.zones.filter(value => value && value !== 'Europe/Moscow').forEach(value => addOption(element('setup-timezone'), value, value));
}

function renderPrivacy() {
  const enabled = settingsState?.privacy?.value === 'disable_non_proxied_udp';
  element('privacy-state').textContent = enabled ? 'WebRTC уже ограничен в этом профиле. Можно продолжать.' : 'Ограничение WebRTC пока не включено.';
  element('privacy-state').classList.toggle('amber', !enabled);
  element('privacy-enable').hidden = enabled;
}

function normalizedConnection(value) {
  if (!value || typeof value.ip !== 'string') return null;
  const country = value.country || value.loc;
  if (typeof country !== 'string' || value.ip.length > 64 || country.length > 80) return null;
  return {ip: value.ip, country, checkedAt: value.checkedAt || value.at || ''};
}

function renderConnection() {
  element('connection-values').hidden = !connection;
  if (connection) {
    element('connection-ip').textContent = connection.ip;
    element('connection-country').textContent = connection.country;
    const same = baseline && connection.ip === baseline.ip && connection.country === baseline.country;
    element('connection-result').textContent = !baseline ? 'Проверено. Если это нужное подключение, запомните его кнопкой ниже.' : same ? 'IP и страна совпадают с сохранённой точкой сравнения.' : 'Подключение отличается от сохранённого. Проверьте выбранный VPN или подключение, если изменение неожиданное.';
  }
  element('connection-baseline').textContent = baseline ? 'Сохранено для сравнения: ' + baseline.ip + ' · ' + baseline.country : 'Точки сравнения пока нет. Кнопка «Запомнить» сохранит только IP и страну этого подключения.';
}

async function loadState() {
  const result = await send('state');
  if (result.onboardingComplete && query.get('again') !== '1') {
    location.replace(chrome.runtime.getURL('workspace.html'));
    return;
  }
  settingsState = result;
  ensureLegacyTimezone(result.settings);
  for (const name of ['locale', 'timezone', 'cores']) element('setup-' + name).value = String(result.settings[name]);
  baseline = normalizedConnection(result.connectionBaseline || result.connection?.baseline || result.baseline);
  element('settings-state').textContent = 'Показаны настройки, сохранённые в этом профиле. Они изменятся после нажатия «Сохранить и дальше».';
  renderPrivacy(); renderConnection(); render();
}

element('browser-name').textContent = browserNames[browserId] + ' · Подготовка';
setupFields();
const extensionPath = query.get('extensionPath');
if (extensionPath && extensionPath.length <= 2048) {
  element('extension-path').value = extensionPath;
  element('path-hint').textContent = 'При выборе папки можно вставить этот путь через Ctrl + V.';
} else {
  element('extension-path').value = 'Путь к папке extension показан в мастере Setup.cmd.';
  element('copy-extension').disabled = true;
  element('path-hint').textContent = 'Если путь не показан здесь, откройте Setup.cmd и используйте его кнопку установки расширения.';
}
['keep-confirmed', 'pin-confirmed', 'banner-confirmed', 'setup-timezone', 'setup-locale'].forEach(id => element(id).addEventListener('change', render));
element('back').addEventListener('click', () => { if (!busy) show(step - 1); });
element('next').addEventListener('click', () => run(element('next'), async () => {
  if (step === 2) {
    if (!allowedTimezone(element('setup-timezone').value)) throw Error('SELECT_REGION_TIMEZONE');
    const settings = {...settingsState.settings, locale: element('setup-locale').value, timezone: element('setup-timezone').value, cores: Number(element('setup-cores').value)};
    Product.validate(settings);
    const result = await send('save', {settings});
    settingsState.settings = result.settings;
  }
  show(step + 1);
}));
element('open-extensions').addEventListener('click', () => run(element('open-extensions'), async () => {
  await chrome.tabs.create({url: browserId === 'edge' ? 'edge://extensions/' : 'chrome://extensions/'});
}));
element('copy-extension').addEventListener('click', () => run(element('copy-extension'), async () => {
  try { await navigator.clipboard.writeText(extensionPath); }
  catch { element('extension-path').focus(); element('extension-path').select(); if (!document.execCommand('copy')) throw Error('Выделите путь и нажмите Ctrl + C.'); }
  notify('Путь скопирован. Вставьте его в окне выбора папки.', 'success');
}));
element('privacy-enable').addEventListener('click', () => run(element('privacy-enable'), async () => {
  const result = await send('privacy', {enabled: true});
  settingsState.privacy = result.privacy; privacySkipped = false; renderPrivacy();
  notify('WebRTC ограничен. Нажмите «Дальше».', 'success');
}));
element('privacy-skip').addEventListener('click', () => { if (!busy) { privacySkipped = true; show(step + 1); } });
element('connection-check').addEventListener('click', () => run(element('connection-check'), async () => {
  const result = await send('connection.check');
  connection = normalizedConnection(result.connection || result.current || result);
  if (!connection) throw Error('Ответ не содержит IP и страну. Повторите проверку.');
  baseline = normalizedConnection(result.baseline || result.connectionBaseline) || baseline;
  connectionSkipped = false; renderConnection();
}));
element('connection-remember').addEventListener('click', () => run(element('connection-remember'), async () => {
  const result = await send('connection.remember');
  baseline = normalizedConnection(result.baseline || result.connectionBaseline || result.connection) || connection;
  renderConnection(); notify('Подключение сохранено для следующего сравнения.', 'success');
}));
element('connection-skip').addEventListener('click', () => { if (!busy) { connectionSkipped = true; show(step + 1); } });
element('open-claude').addEventListener('click', () => run(element('open-claude'), async () => {
  if (!allowedTimezone(settingsState.settings.timezone)) throw Error('SELECT_REGION_TIMEZONE');
  await send('launch');
  await send('onboarding.complete');
  notify('Claude открыт. На его вкладке нажмите значок Claude mini → «Обновить» и сравните показания.', 'success');
}));
element('open-workspace').addEventListener('click', () => run(element('open-workspace'), async () => {
  if (!allowedTimezone(settingsState.settings.timezone)) throw Error('SELECT_REGION_TIMEZONE');
  await send('onboarding.complete');
  location.href = chrome.runtime.getURL('workspace.html');
}));
render();
loadState().catch(error => {
  element('settings-state').textContent = 'Не удалось получить настройки. Обновите эту страницу и повторите.';
  notify('Настройки недоступны: ' + error.message, 'error');
});
