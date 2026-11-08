function Write-FirstRunGuide([string]$Root,[string]$Browser) {
    if($Browser -notin @('chrome','edge','brave')){throw 'Неизвестный браузер для инструкции.'}
    $rootPath=[IO.Path]::GetFullPath($Root)
    if(-not[IO.Directory]::Exists($rootPath)){throw 'Рабочая папка для инструкции ещё не создана.'}
    $spec=Get-RuntimeSpec $Browser
    if($spec.extensionId -notmatch '^[a-p]{32}$'){throw 'Не указан адрес рабочего места расширения.'}
    $extensionPath=Join-Path $rootPath 'extension'
    $extensionsURL=switch($Browser){'edge'{'edge://extensions/'}'brave'{'brave://extensions/'}default{'chrome://extensions/'}}
    $developerHint=if($Browser -eq 'edge'){'Слева включите «Режим разработчика». Если левое меню скрыто, сначала раскройте его.'}else{'В правом верхнем углу включите «Режим разработчика».'}
    $newTabHint=switch($Browser){
        'edge'{'Если Edge спросит, оставить ли новую вкладку Claude mini, выберите сохранение новой страницы: «Сохранить изменения» / Keep changes. Формулировка зависит от языка браузера.'}
        'brave'{'Если Brave покажет подтверждение смены новой вкладки, оставьте страницу Claude mini: «Сохранить» / Keep it. Если такого сообщения нет, ничего подтверждать не нужно.'}
        default{'Если Chrome спросит «Это та страница новой вкладки, которую вы ожидали?», выберите «Сохранить» / Keep it. В другом переводе кнопка может называться «Оставить изменения».'}
    }
    $onboardingURL='chrome-extension://'+$spec.extensionId+'/onboarding.html?browser='+$Browser
    $html=@'
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Claude mini — Первый запуск в %%BROWSER%%</title>
<style>
:root{color-scheme:light;font-family:"Segoe UI",Arial,sans-serif;color:#252a2e;background:#f5f2eb;font-size:20px}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:clamp(18px,4vw,48px)}header{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #d8d2c7;padding-bottom:20px;font-weight:700}.browser{color:#7c6656;font-weight:500}h1{font-size:clamp(32px,5vw,48px);line-height:1.15;margin:32px 0 12px}h2{font-size:clamp(28px,4vw,40px);line-height:1.2;margin:0 0 24px}h3{font-size:25px;line-height:1.3;margin:0 0 12px}p,li{line-height:1.55}p{margin:12px 0 20px}.intro{font-size:23px;color:#62696d}.notice{border-left:5px solid #bf6a42;background:#eee6d8;padding:18px 22px;border-radius:12px;margin:24px 0;font-size:18px}.notice p{margin:0}.progress{margin:26px 0 16px;display:flex;gap:12px;align-items:center}.progress progress{width:220px;max-width:40vw;height:13px;accent-color:#28745b}.step{background:#fffefa;border:1px solid #ddd6ca;border-radius:24px;padding:clamp(20px,4vw,40px);box-shadow:0 8px 24px #34271908;min-height:365px}[hidden]{display:none!important}.number{display:block;color:#a85435;font-size:19px;font-weight:800;letter-spacing:.05em;margin-bottom:16px}kbd{font-family:inherit;font-weight:700;border:1px solid #d8ccbc;border-bottom-width:3px;background:#f2eee5;border-radius:8px;padding:4px 12px;white-space:nowrap}.action-line{font-size:25px}.hint{background:#eef3f0;border-radius:12px;padding:18px 22px}.hint p:last-child{margin-bottom:0}.buttons{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0 4px}button,a.button{font:700 20px/1.3 "Segoe UI",Arial,sans-serif;border:0;border-radius:12px;padding:16px 22px;min-height:58px;cursor:pointer;text-decoration:none;text-align:center;display:inline-flex;justify-content:center;align-items:center;color:white;background:#246590}button:hover,a.button:hover{filter:brightness(.94)}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #c98140;outline-offset:4px}.green{background:#24745a!important}.secondary{background:#e9e3d8!important;color:#34312b!important}button:disabled{opacity:.45;cursor:default}nav{display:flex;justify-content:space-between;gap:14px;margin-top:22px}nav button{min-width:150px}.field-label{font-weight:700;display:block;margin:20px 0 8px}input.address{font:18px/1.4 Consolas,"Courier New",monospace;width:100%;min-width:0;padding:14px;border:1px solid #c9c2b6;border-radius:10px;background:#faf8f3;color:#303336}.copy-note{font-size:17px;color:#62696d;min-height:24px;margin:8px 0 0}.copy-note:empty{display:none}details{border-top:1px solid #e1d8cb;padding-top:20px;margin-top:26px}summary{cursor:pointer;font-size:23px;font-weight:700;line-height:1.4}details ol{padding-left:27px}details li{margin:12px 0}.check{font-size:25px;color:#28624e;font-weight:700}.small{font-size:18px;color:#62696d}footer{font-size:17px;color:#73736b;margin-top:30px}a{color:#246590;overflow-wrap:anywhere}@media(max-width:560px){header{align-items:start;flex-direction:column;gap:6px}.intro{font-size:21px}.notice{padding:16px}nav button{min-width:0;flex:1;padding:15px 12px}.buttons>*{width:100%}.step{min-height:0}.action-line{font-size:22px}input.address{font-size:16px}.progress{font-size:18px}}
</style>
</head>
<body>
<main>
<header><span>Claude mini · Первый запуск</span><span class="browser">Ваш браузер: %%BROWSER%%</span></header>
<h1>Начните с рабочего места.</h1>
<p class="intro">Четыре коротких шага. Выполняйте один и нажимайте «Дальше».</p>
<aside class="notice"><p>Эта инструкция работает даже без расширения. Если кнопка не открывает внутреннюю страницу браузера, нажмите «Скопировать адрес», вставьте его в адресную строку сверху и нажмите <b>Enter</b>.</p></aside>
<div class="progress"><progress id="progress" max="4" value="1" aria-label="Ход настройки"></progress><span id="counter" aria-live="polite">Шаг 1 из 4</span></div>

<section class="step" data-step="0" aria-labelledby="step-title-0">
<span class="number">ШАГ 1</span>
<h2 id="step-title-0">Откройте новую вкладку.</h2>
<p class="action-line">Нажмите на клавиатуре <kbd>Ctrl + T</kbd>.</p>
<div class="hint"><p>%%NEW_TAB_HINT%%</p><p><b>Появилось рабочее место Claude mini?</b> Хорошо. Вернитесь на вкладку этой инструкции и продолжайте.</p></div>
<p class="small">Если открылась обычная новая вкладка браузера, на следующем шаге проверим расширение.</p>
</section>

<section class="step" data-step="1" aria-labelledby="step-title-1" hidden>
<span class="number">ШАГ 2</span>
<h2 id="step-title-1">Найдите расширение Claude mini.</h2>
<p>Справа от адресной строки нажмите значок <b>пазла «Расширения»</b>. Найдите <b>Claude mini</b>.</p>
<p>Если список есть и Claude mini в нём виден — переходите дальше. Если его значок уже находится рядом с адресной строкой, тоже переходите дальше.</p>
<details>
<summary>Claude mini нет в списке — что нажать?</summary>
<p>Откройте страницу расширений именно этого отдельного %%BROWSER%%.</p>
<label class="field-label" for="extensions-address">Скопируйте адрес страницы расширений</label>
<input class="address" id="extensions-address" value="%%EXTENSIONS_URL%%" readonly spellcheck="false">
<div class="buttons"><button type="button" data-copy="extensions-address">Скопировать адрес настроек</button></div><p class="copy-note" id="extensions-address-status" role="status"></p>
<p>Нажмите <b>Ctrl + L</b>, <b>Ctrl + V</b> и <b>Enter</b>, чтобы открыть настройки в этом браузере.</p>
<ol><li>%%DEVELOPER_HINT%%</li><li>Нажмите <b>«Загрузить распакованное расширение»</b> / Load unpacked.</li><li>В окне выбора папки укажите <b>extension</b> из вашей рабочей папки. Полный путь указан ниже.</li><li>Нажмите <b>«Выбор папки»</b> / Select folder. Должна появиться карточка <b>Claude mini</b>. Убедитесь, что переключатель на карточке включён.</li></ol>
<label class="field-label" for="extension-folder">Папка нашего расширения</label>
<input class="address" id="extension-folder" value="%%EXTENSION_PATH%%" readonly spellcheck="false">
<div class="buttons"><button class="secondary" type="button" data-copy="extension-folder">Скопировать путь к папке</button></div><p class="copy-note" id="extension-folder-status" role="status"></p>
<p class="small">Не нашли папку extension? Повторите Setup.cmd из полного распакованного комплекта. Установщик подготовит файлы заново.</p>
</details>
</section>

<section class="step" data-step="2" aria-labelledby="step-title-2" hidden>
<span class="number">ШАГ 3</span>
<h2 id="step-title-2">Закрепите значок под рукой.</h2>
<p>Снова откройте <b>пазл «Расширения»</b> и найдите Claude mini.</p>
<div class="hint"><p>В Chrome и Brave нажмите <b>булавку</b> рядом с названием. В Edge включите <b>«Показать на панели инструментов»</b> — этот пункт может находиться в меню рядом с названием расширения.</p></div>
<p class="check">Значок Claude mini виден рядом с адресной строкой?</p>
<p>Значит, всё готово. По этому значку вы сможете открыть рабочее место и сохранить открытый чат.</p>
<p class="small">Если пункты выглядят иначе, ориентируйтесь на название Claude mini. Попросите знакомого помочь с закреплением, если после повторного чтения найти пункт не удалось.</p>
</section>

<section class="step" data-step="3" aria-labelledby="step-title-3" hidden>
<span class="number">ШАГ 4</span>
<h2 id="step-title-3">Откройте рабочее место Claude mini.</h2>
<p>После подключения расширение откроет рабочее место в новой вкладке. Если этого не произошло, скопируйте адрес зелёной кнопкой ниже.</p>
<label class="field-label" for="workspace-address">Адрес рабочего места</label>
<input class="address" id="workspace-address" value="%%ONBOARDING_URL%%" readonly spellcheck="false">
<div class="buttons"><button class="green" type="button" data-copy="workspace-address">Скопировать адрес рабочего места</button></div><p class="copy-note" id="workspace-address-status" role="status"></p>
<p>Нажмите <b>Ctrl + L</b>, затем <b>Ctrl + V</b> и <b>Enter</b> в этом %%BROWSER%%. Если страница недоступна, вернитесь к шагу 2 и проверьте, включено ли Claude mini.</p>
<div class="hint"><p><b>В следующий раз начинайте с ярлыка своего браузера Claude mini или Launch.cmd.</b> В открытом браузере нажмите Ctrl + T, чтобы вернуться на рабочее место.</p></div>
</section>

<nav aria-label="Шаги первого запуска"><button id="previous" class="secondary" type="button" disabled>← Назад</button><button id="next" class="green" type="button">Дальше →</button></nav>
<footer>Инструкция находится на вашем компьютере. Для просмотра этой страницы интернет не нужен.</footer>
<noscript><p class="notice">Для переключения шагов нужен JavaScript. Если он отключён, откройте страницу расширений %%EXTENSIONS_URL%%, проверьте Claude mini и затем введите в адресную строку %%ONBOARDING_URL%%.</p></noscript>
</main>
<script>
(()=>{'use strict';
 const steps=Array.from(document.querySelectorAll('[data-step]'));
 const previous=document.getElementById('previous'),next=document.getElementById('next');
 let current=0;
 function show(index,focus){
  current=Math.max(0,Math.min(steps.length-1,index));
  steps.forEach((step,i)=>{step.hidden=i!==current;});
  previous.disabled=current===0;next.disabled=current===steps.length-1;
  next.textContent=current===steps.length-1?'Все шаги пройдены':'Дальше →';
  document.getElementById('counter').textContent='Шаг '+(current+1)+' из '+steps.length;
  document.getElementById('progress').value=current+1;
  if(focus){const heading=steps[current].querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'smooth'});}
 }
 previous.addEventListener('click',()=>show(current-1,true));next.addEventListener('click',()=>show(current+1,true));
 for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{
  const input=document.getElementById(button.dataset.copy),status=document.getElementById(button.dataset.copy+'-status');
  try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(input.value);status.textContent='Скопировано. Вставьте через Ctrl + V.';}
  catch{input.focus();input.select();input.setSelectionRange(0,input.value.length);let copied=false;try{copied=document.execCommand('copy');}catch{}status.textContent=copied?'Скопировано. Вставьте через Ctrl + V.':'Текст выделен. Нажмите Ctrl + C, чтобы скопировать.';}
 });
 show(0,false);
})();
</script>
</body>
</html>
'@
    $values=@{
        '%%BROWSER%%'=[Net.WebUtility]::HtmlEncode([string]$spec.displayName)
        '%%EXTENSIONS_URL%%'=[Net.WebUtility]::HtmlEncode($extensionsURL)
        '%%EXTENSION_PATH%%'=[Net.WebUtility]::HtmlEncode($extensionPath)
        '%%ONBOARDING_URL%%'=[Net.WebUtility]::HtmlEncode($onboardingURL)
        '%%DEVELOPER_HINT%%'=[Net.WebUtility]::HtmlEncode($developerHint)
        '%%NEW_TAB_HINT%%'=[Net.WebUtility]::HtmlEncode($newTabHint)
    }
    foreach($key in $values.Keys){$html=$html.Replace($key,$values[$key])}
    $target=Join-Path $rootPath 'Начните работу.html'
    [IO.File]::WriteAllText($target,$html,[Text.UTF8Encoding]::new($false))
    return $target
}
