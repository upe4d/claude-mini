'use strict';
let state, dirty = false, savePhase = 'saved';
let browserValues, currentConnection = null;
const status = document.getElementById('status');
const fields = ['timezone', 'locale', 'cores'];
const node = id => document.getElementById(id);
Object.assign(uiErrors, {
  CONNECTION_FAILED: ['Не удалось проверить подключение. Проверьте интернет или VPN и повторите.', 'Could not check the connection. Check your internet or VPN and try again.'],
  CHECK_CONNECTION_FIRST: ['Сначала нажмите «Проверить подключение».', 'Click Check connection first.'],
  SELECT_REGION_TIMEZONE: ['Выберите и сохраните пояс региона подключения. Московский пояс в этой подготовке не используется.', 'Choose and save the timezone of your connection region. This setup does not use the Moscow timezone.'],
  SELECT_SUPPORTED_TIMEZONE: ['Выберите и сохраните пояс региона подключения. Москва не используется для запуска в этой подготовке.', 'Choose and save the timezone of your connection region. This setup does not launch with Moscow selected.'],
});
const allowedTimezone = zone => !!zone && zone !== 'Europe/Moscow';

function ensureLegacyTimezone(settings) {
  if (settings.timezone === 'Europe/Moscow' && !node('timezone').querySelector('option[value="Europe/Moscow"]')) {
    const legacy = new Option(text('Москва — выберите другой пояс', 'Moscow — choose another timezone'), 'Europe/Moscow');
    legacy.disabled = true; node('timezone').add(legacy);
  }
}

function setFields(settings) {
  ensureLegacyTimezone(settings);
  fields.forEach(name => node(name).value = settings[name]);
}

function renderRegionGuard() {
  const selectedAllowed = allowedTimezone(selection().timezone), savedAllowed = allowedTimezone(state.settings.timezone);
  const warning = node('region-warning'); warning.hidden = selectedAllowed && savedAllowed;
  warning.textContent = !selectedAllowed ? text('В старых настройках Москва или пояс не выбран. Выберите пояс региона подключения перед сохранением и запуском Claude.', 'Your legacy settings use Moscow or have no selected timezone. Choose the timezone of your connection region before saving and launching Claude.') : text('Новый пояс выбран. Сохраните его, чтобы заменить прежний московский или невыбранный пояс.', 'A new timezone is selected. Save it to replace the previous Moscow or unset timezone.');
  if (!selectedAllowed) {
    node('save').disabled = true; node('save').classList.remove('saved'); node('save').classList.add('pending');
    node('save').textContent = text('Выберите другой пояс', 'Choose another timezone');
    node('saved').classList.add('pending');
  }
  node('apply-launch').disabled = !selectedAllowed || savePhase === 'saving';
  node('launch').disabled = dirty || !savedAllowed || savePhase === 'saving';
}

function selection() {
  return {timezone: node('timezone').value, locale: node('locale').value, cores: Product.cpu ? Number(node('cores').value) : 0, ui: node('ui-language').value};
}
function chosenValue(name, settings) {
  const value = settings?.[name];
  if (name === 'locale') return value ? value.split(',').join(', ') : text('Как в браузере', 'Browser default');
  return value || text('Как в браузере', 'Browser default');
}
function sameSelection(left, right) { return fields.every(name => left[name] === right[name]); }
function showComparison() {
  const table = node('browser-values'), chosen = selection();
  const prior = state.lastLaunchSettings?.settings || state.lastLaunchSettings;
  table.replaceChildren();
  for (const [name, ru, en] of [['locale', 'Язык сайтов', 'Site language'], ['timezone', 'Часовой пояс', 'Timezone'], ['cores', 'CPU', 'CPU']]) {
    const row = document.createElement('tr');
    for (const value of [text(ru, en), prior ? chosenValue(name, prior) : text('Ещё не запускали', 'Not launched yet'), chosenValue(name, chosen)]) {
      const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell);
    }
    if (prior && prior[name] !== chosen[name]) {
      row.className = 'launch-changed';
      const changed = document.createElement('span'); changed.className = 'change-tag';
      changed.textContent = text('ИЗМЕНИЛОСЬ', 'CHANGED'); row.lastElementChild.append(changed);
    }
    table.append(row);
  }
  node('browser-checked').textContent = browserValues ? text('Показания рабочего места обновлены: ', 'Workspace values refreshed: ') + new Date(browserValues.checkedAt).toLocaleTimeString() : '';
  node('selection-status').textContent = dirty ? text('Есть несохранённые изменения. Нажмите «Сохранить» или «Сохранить и открыть Claude».', 'Unsaved changes. Click Save or Save and open Claude.') : text('Этот выбор сохранён и будет применён к новой вкладке Claude.', 'This selection is saved and applies to a new Claude tab.');
  node('selection-status').className = dirty ? 'connection-note changed' : 'setting-info';
  if (browserValues) {
    const native = node('native-browser-values'); native.replaceChildren();
    for (const value of [text('Языки: ', 'Languages: ') + browserValues.languages.join(', '), text('Пояс: ', 'Timezone: ') + browserValues.timezone, 'CPU: ' + (browserValues.cores ?? '—')]) {
      const p = document.createElement('p'); p.textContent = value; native.append(p);
    }
  }
}
function inspectBrowser() { browserValues = boundedValues(readPageValues()); showComparison(); }
function renderSave() {
  const save = node('save'), summary = node('saved'), value = state.settings;
  summary.classList.toggle('pending', dirty); summary.classList.toggle('saving', savePhase === 'saving');
  save.classList.toggle('saved', !dirty && savePhase !== 'saving'); save.classList.toggle('pending', dirty && savePhase !== 'saving');
  save.disabled = savePhase === 'saving';
  save.textContent = savePhase === 'saving' ? text('Сохраняем…', 'Saving…') : dirty ? text('Сохранить изменения', 'Save changes') : text('Сохранено', 'Saved');
  const prefix = savePhase === 'saving' ? text('Сохраняем выбранные настройки…', 'Saving selected settings…') : dirty ? text('Новый выбор ещё не сохранён.', 'The new selection is not saved yet.') : text('Сохранено: ', 'Saved: ') + chosenValue('locale', value) + ' · ' + chosenValue('timezone', value) + ' · CPU ' + chosenValue('cores', value);
  summary.textContent = prefix;
}
function normalizeConnection(value) {
  if (!value || typeof value.ip !== 'string' || typeof (value.country || value.loc) !== 'string') return null;
  return {ip: value.ip.slice(0, 64), country: (value.country || value.loc).slice(0, 80), checkedAt: value.checkedAt || value.at};
}
function renderConnection() {
  const baseline = normalizeConnection(state.connectionBaseline);
  node('connection-values').hidden = !currentConnection;
  const changedIp = !!(currentConnection && baseline && currentConnection.ip !== baseline.ip);
  const changedCountry = !!(currentConnection && baseline && currentConnection.country !== baseline.country);
  node('connection-ip-card').classList.toggle('changed', changedIp);
  node('connection-country-card').classList.toggle('changed', changedCountry);
  node('connection-ip-change').hidden = !changedIp;
  node('connection-country-change').hidden = !changedCountry;
  node('connection-ip-change').textContent = node('connection-country-change').textContent = text('ИЗМЕНИЛОСЬ', 'CHANGED');
  node('connection-status').classList.toggle('changed', changedIp || changedCountry);
  node('connection-remember').disabled = !currentConnection;
  if (currentConnection) {
    node('connection-ip').textContent = currentConnection.ip; node('connection-country').textContent = currentConnection.country;
    node('connection-status').textContent = !baseline ? text('Подключение проверено. Можно запомнить его для сравнения.', 'Connection checked. You can remember it for comparison.') : changedIp || changedCountry ? text('IP или страна изменились относительно сохранённой точки. Проверьте подключение, если изменение неожиданное.', 'IP or country differs from your saved baseline. Check your connection if this is unexpected.') : text('IP и страна совпадают с сохранённой точкой.', 'IP and country match your saved baseline.');
  } else node('connection-status').textContent = text('Нажмите «Проверить подключение».', 'Click Check connection.');
  node('connection-baseline').textContent = baseline ? text('Для сравнения сохранено: ', 'Saved baseline: ') + baseline.ip + ' · ' + baseline.country : text('Сохранённой точки сравнения пока нет.', 'No comparison baseline has been saved yet.');
}
function renderState() {
  renderSave();
  const privacy = state.privacy || {}, own = privacy.levelOfControl === 'controlled_by_this_extension';
  const enabled = own && privacy.value === 'disable_non_proxied_udp';
  node('webrtc-state').textContent = enabled ? text('WebRTC ограничен в этом профиле.', 'WebRTC is restricted in this profile.') : own ? text('Расширение управляет другой политикой WebRTC.', 'The extension controls another WebRTC policy.') : ['controlled_by_other_extensions', 'not_controllable'].includes(privacy.levelOfControl) ? text('WebRTC управляется другой настройкой браузера.', 'Another browser setting controls WebRTC.') : text('Наше ограничение WebRTC выключено.', 'Our WebRTC restriction is off.');
  node('webrtc-state').className = enabled ? 'status-green' : '';
  node('webrtc-on').disabled = enabled || !['controllable_by_this_extension', 'controlled_by_this_extension'].includes(privacy.levelOfControl);
  node('webrtc-off').disabled = !own;
  const sessions = state.sessions || [], active = sessions.filter(item => item.active).length;
  node('session-state').textContent = text('Вкладок с настройками: ', 'Configured tabs: ') + active + (sessions.some(item => item.issue) ? text('. В одной из вкладок настройка прервана; откройте её заново из рабочего места.', '. A tab has interrupted settings; reopen it from the workspace.') : '.');
  node('reset-tabs').disabled = !sessions.length;
  node('launch').disabled = dirty || savePhase === 'saving';
  showComparison(); renderConnection();
  renderRegionGuard();
}
async function refresh() { state = await send('state'); renderState(); }
function setLanguage(lang) {
  translate(lang);
  fields.filter(id => id !== 'timezone').forEach(id => node(id).options[0].textContent = text('Как в браузере', 'Browser default'));
  node('timezone').options[0].textContent = text('Выберите часовой пояс', 'Choose a timezone');
  const legacy = node('timezone').querySelector('option[value="Europe/Moscow"]');
  if (legacy) legacy.textContent = text('Москва — выберите другой пояс', 'Moscow — choose another timezone');
  node('locale').options[1].textContent = text('English · US — рекомендуем', 'English · US — recommended');
  node('locale').options[3].textContent = text('Русский', 'Russian');
}
async function persistSelection() {
  if (!allowedTimezone(selection().timezone)) throw Error('SELECT_REGION_TIMEZONE');
  savePhase = 'saving'; renderSave();
  try { await send('save', {settings: selection()}); dirty = false; savePhase = 'saved'; await refresh(); }
  catch (error) { savePhase = 'error'; renderSave(); throw error; }
}
async function init() {
  const placeholder = new Option(text('Выберите часовой пояс', 'Choose a timezone'), ''); placeholder.disabled = true; node('timezone').add(placeholder);
  Product.zones.filter(zone => zone && zone !== 'Europe/Moscow').forEach(zone => node('timezone').add(new Option(zone, zone)));
  const names = ['Как в браузере', 'English · US — рекомендуем', 'English · UK', 'Русский', 'Deutsch', 'Français', 'العربية · UAE'];
  Product.locales.forEach((locale, index) => node('locale').add(new Option(names[index], locale)));
  state = await send('state');
  node('ui-language').value = state.settings.ui;
  setFields(state.settings);
  currentConnection = normalizeConnection(state.lastConnection || state.connection);
  setLanguage(state.settings.ui); renderState();
  node('cpu-controls').hidden = !Product.cpu; node('cores').disabled = !Product.cpu; node('cpu-lock').hidden = Product.cpu;
  inspectBrowser();
}
fields.forEach(id => node(id).addEventListener('change', () => {
  dirty = !sameSelection(selection(), state.settings); savePhase = dirty ? 'pending' : 'saved'; renderState();
  status.textContent = dirty ? text('Выбор изменён. Сохраните его перед запуском.', 'Selection changed. Save it before launching.') : '';
}));
node('ui-language').addEventListener('change', async event => {
  const lang = event.target.value; setLanguage(lang);
  try { state.settings = (await send('save', {settings: {...state.settings, ui: lang}})).settings; renderState(); }
  catch (error) { status.textContent = errorText(error); }
});
node('save').addEventListener('click', async () => {
  if (savePhase === 'saving') return;
  try { await persistSelection(); status.textContent = text('Сохранено. Настройки применятся к следующей новой вкладке Claude.', 'Saved. Settings apply to the next new Claude tab.'); }
  catch (error) { status.textContent = errorText(error); }
  finally { renderState(); }
});
bindAction('launch', async () => { if (dirty) return; if (!allowedTimezone(state.settings.timezone)) throw Error('SELECT_REGION_TIMEZONE'); await send('launch'); await refresh(); status.textContent = text('Claude открыт. Через значок расширения проверьте показания его вкладки.', 'Claude opened. Use the extension icon to check its tab values.'); });
bindAction('inspect-browser', async () => { await refresh(); inspectBrowser(); });
bindAction('apply-launch', async () => { await persistSelection(); await send('launch'); await refresh(); status.textContent = text('Сохранено. Claude открыт. На его вкладке нажмите значок расширения → «Обновить».', 'Saved and opened Claude. On its tab click the extension icon → Refresh.'); });
bindAction('webrtc-on', async () => { await send('privacy', {enabled: true}); await refresh(); status.textContent = text('Ограничение WebRTC включено.', 'WebRTC restriction enabled.'); });
bindAction('webrtc-off', async () => { await send('privacy', {enabled: false}); await refresh(); status.textContent = text('Ограничение WebRTC снято.', 'WebRTC restriction released.'); });
bindAction('connection-check', async () => {
  const result = await send('connection.check');
  currentConnection = normalizeConnection(result.connection);
  if (!currentConnection) throw Error('READ_FAILED');
  state.connectionBaseline = result.baseline || state.connectionBaseline;
  renderConnection(); status.textContent = text('Подключение проверено.', 'Connection checked.');
});
bindAction('connection-remember', async () => {
  const result = await send('connection.remember'); state.connectionBaseline = result.baseline;
  renderConnection(); status.textContent = text('Подключение запомнено для сравнения.', 'Connection remembered as a baseline.');
});
bindAction('reset-tabs', async () => { await send('resetTabs'); await refresh(); status.textContent = text('Настройки сняты, вкладки перезагружены.', 'Settings removed; tabs reloaded.'); });
bindAction('export-settings', async () => { download(JSON.stringify({format: 'claude-mini-browser-settings', schemaVersion: 1, version: Product.version, settings: state.settings}, null, 2), 'application/json', 'claude-mini-settings.json'); });
bindAction('import-settings', async () => {
  const file = node('settings-file').files[0]; if (!file || file.size > 8192) throw Error('INVALID_SETTINGS');
  let data; try { data = JSON.parse(await file.text()); } catch { throw Error('INVALID_SETTINGS'); }
  await send('importSettings', {document: data}); dirty = false; savePhase = 'saved'; await refresh();
  setFields(state.settings); renderState();
  status.textContent = text('Настройки импортированы и сохранены.', 'Settings imported and saved.');
});
bindAction('restore-settings', async () => { await send('restoreSettings'); dirty = false; savePhase = 'saved'; await refresh(); setFields(state.settings); renderState(); status.textContent = text('Выбор до импорта восстановлен.', 'Selection before import restored.'); });
window.addEventListener('focus', () => { if (state) refresh().catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (!state) return;
  if (area === 'session') refresh().catch(() => {});
  if (area === 'local') {
    if (changes.settings?.newValue) {
      state.settings = changes.settings.newValue;
      if (!dirty) setFields(state.settings);
      node('ui-language').value = state.settings.ui; setLanguage(state.settings.ui); renderState();
    }
    if (changes.connectionBaseline || changes.lastLaunchSettings || changes.lastConnection) refresh().catch(() => {});
  }
});
init().catch(error => { status.textContent = errorText(error); });
