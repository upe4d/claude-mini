"use strict";
// Идентификатор браузера приходит из установщика; все внутренние адреса заданы здесь явно.
const WindowsBrowser = (() => {
  const allowed = ['chrome', 'edge', 'brave'];
  const stamp = typeof InstallBrowser === 'object' && InstallBrowser ? InstallBrowser : {};
  const query = new URLSearchParams(location.search);
  const requested = query.get('browser');
  const id = allowed.includes(stamp.id) ? stamp.id : allowed.includes(requested) ? requested : 'chrome';
  const names = {chrome:'Chrome', edge:'Microsoft Edge', brave:'Brave'};
  const urls = {chrome:'chrome://extensions/', edge:'edge://extensions/', brave:'brave://extensions/'};
  return Object.freeze({
    id,
    name:names[id],
    extensionsURL:urls[id],
    extensionPath:typeof stamp.extensionPath === 'string' ? stamp.extensionPath : '',
    pinHint:id === 'edge' ? 'Справа от адресной строки откройте «Расширения». Найдите Claude mini и включите «Показать на панели инструментов»; этот пункт может быть в меню рядом с названием.' : 'Справа от адресной строки нажмите пазл «Расширения», затем булавку рядом с Claude mini: Browser.',
    keepHint:id === 'edge' ? 'Если Edge спросит, оставить ли новую вкладку, выберите «Сохранить изменения» / Keep changes.' : 'Если браузер спросит о новой вкладке, выберите «Оставить» / Keep it. Если запроса нет, ничего подтверждать не нужно.',
    developerHint:id === 'edge' ? 'Слева включите Developer mode / «Режим разработчика». Если меню скрыто, сначала раскройте его.' : 'Справа сверху включите Developer mode / «Режим разработчика».',
  });
})();
