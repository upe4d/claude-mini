/* Presentation only: no browser API observation, telemetry, network or storage. */
(() => {
  'use strict';
  const doc = document;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const still = new URLSearchParams(location.search).has('still');
  const stories = [];
  const observers = [];
  const tiltFrames = [];
  const STORY_DURATION = 7.6;
  let frame = 0;
  let last = 0;
  let reduced = motionQuery.matches || still;

  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function track(keys, time) {
    if (time <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i += 1) {
      const [t1, v1] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (time <= t1) return v0 + (v1 - v0) * ease(clamp((time - t0) / Math.max(.001, t1 - t0)));
    }
    return keys[keys.length - 1][1];
  }
  function style(element, opacity, x = 0, y = 0, scale = 1) {
    if (!element) return;
    element.style.opacity = String(opacity);
    element.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  }
  function createStory(el, card, index) {
    const one = selector => el.querySelector(selector);
    const all = selector => [...el.querySelectorAll(selector)];
    return {el, card, kind:el.dataset.story, elapsed:0, delay:2.4 + index * .18, visible:false, started:false,
      nodes:{focus:one('[data-story-focus]'), cursor:one('[data-story-cursor]'), click:one('[data-story-click]'),
        check:one('[data-story-check]'), save:one('[data-story-save]'), saved:one('[data-story-saved]'),
        paper:one('[data-story-paper]'), arrow:one('[data-story-arrow]'), file:one('[data-story-file]'),
        download:one('[data-story-download]'), stage:one('.cm-export-stage'), formats:all('[data-story-format]'),
        difference:one('[data-story-difference]'), differenceRing:one('[data-story-difference-ring]'),
        result:one('[data-story-result]'), events:all('[data-story-event]'), eventFocus:all('[data-story-event-focus]'),
        packet:one('[data-story-packet]'), reports:all('[data-story-report]')}};
  }
  function pulse(time, beats) {
    return Math.max(0, ...beats.map(beat => track([[0,0],[beat,0],[beat+.14,1],[beat+.45,0],[STORY_DURATION,0]], time)));
  }
  function paintCursor(nodes, time, compare = false) {
    const y = track([[0,0],[.7,0],[1.55,48],[2.65,96],[3.25,96],[3.9,compare ? 96 : 153],[4.3,compare ? 96 : 153],[5.1,0],[STORY_DURATION,0]], time);
    const opacity = track([[0,0],[.45,1],[4.15,1],[4.65,0],[STORY_DURATION,0]], time);
    style(nodes.cursor, opacity, 0, y);
    const click = pulse(time, compare ? [.7,1.8,2.9] : [.7,1.8,2.9,4]);
    style(nodes.click, click * .8, 0, 0, 1 + click * .7);
  }
  function paintSelection(nodes, time) {
    const y = track([[0,0],[.7,0],[1.55,48],[2.65,96],[3.25,96],[4.4,0],[STORY_DURATION,0]], time);
    style(nodes.focus, track([[0,0],[.4,1],[3.25,1],[3.65,0],[STORY_DURATION,0]], time), 0, y);
  }
  function paintSettings(nodes, time) {
    paintSelection(nodes, time);
    paintCursor(nodes, time);
    style(nodes.save, track([[0,0],[.3,1],[3.9,1],[4.3,0],[STORY_DURATION,0]], time));
    style(nodes.saved, track([[0,1],[.3,0],[4.05,0],[4.5,1],[STORY_DURATION,1]], time));
    if (nodes.check) {
      const drawn = track([[0,1],[.3,0],[4.1,0],[4.7,1],[STORY_DURATION,1]], time);
      nodes.check.style.clipPath = `inset(0 ${100 * (1 - drawn)}% 0 0)`;
    }
  }
  function activeFormat(nodes, time) {
    const index = time < .9 || time >= 6.2 ? 0 : Math.min(3, Math.floor((time - .9) / 1.05) + 1);
    nodes.formats.forEach((element, position) => element.classList.toggle('cm-format-active', position === index));
  }
  function filePoints(story) {
    const {stage, paper, arrow} = story.nodes;
    if (!stage || !paper || !arrow) return null;
    const rect = stage.getBoundingClientRect();
    if (!story.points || story.points.width !== rect.width) {
      const from = paper.getBoundingClientRect(), to = arrow.getBoundingClientRect();
      story.points = {width:rect.width, x0:from.x + from.width / 2 - rect.x - 16,
        y0:from.y + from.height / 2 - rect.y - 20, x1:to.x + to.width / 2 - rect.x - 16,
        y1:to.y + to.height / 2 - rect.y - 20};
    }
    return story.points;
  }
  function paintExport(story, time) {
    const nodes = story.nodes, points = filePoints(story);
    activeFormat(nodes, time);
    style(nodes.paper, 1, 0, track([[0,0],[4.3,0],[4.8,-4],[5.5,0],[STORY_DURATION,0]], time));
    style(nodes.arrow, 1, 0, track([[0,0],[5.05,0],[5.4,6],[5.8,0],[STORY_DURATION,0]], time));
    if (points) {
      const move = track([[0,0],[4.3,0],[5.45,1],[5.95,1],[6.2,0],[STORY_DURATION,0]], time);
      const opacity = track([[0,0],[4.3,0],[4.65,1],[5.45,1],[5.9,0],[STORY_DURATION,0]], time);
      style(nodes.file, opacity, points.x0 + (points.x1 - points.x0) * move,
        points.y0 + (points.y1 - points.y0) * move, .9);
    }
    style(nodes.download, track([[0,1],[.4,.35],[5.3,.35],[5.85,1],[STORY_DURATION,1]], time));
  }
  function paintCompare(nodes, time) {
    paintSelection(nodes, time);
    paintCursor(nodes, time, true);
    style(nodes.difference, 1, 0, 0, track([[0,1],[2.7,1],[3.05,1.16],[3.65,1],[STORY_DURATION,1]], time));
    style(nodes.differenceRing, track([[0,1],[.35,0],[2.7,0],[3.2,1],[STORY_DURATION,1]], time));
    style(nodes.result, track([[0,1],[.35,0],[3.1,0],[3.6,1],[STORY_DURATION,1]], time));
  }
  function paintReport(nodes, time) {
    nodes.events.forEach((item, index) => {
      const beat = .5 + index * .95;
      const active = pulse(time, [beat]);
      style(item, 1, active * 4);
      style(nodes.eventFocus[index], active);
    });
    const packet = track([[0,0],[3.3,0],[5.3,280],[6,280],[6.4,0],[STORY_DURATION,0]], time);
    style(nodes.packet, track([[0,0],[3.25,0],[3.6,1],[5.2,1],[5.6,0],[STORY_DURATION,0]], time), packet);
    nodes.reports.forEach((item, index) => {
      const begin = 4.35 + index * .5;
      style(item, track([[0,1],[.5,.25],[begin,.25],[begin+.6,1],[STORY_DURATION,1]], time), 0,
        track([[0,0],[begin,0],[begin+.2,-4],[begin+.6,0],[STORY_DURATION,0]], time));
    });
  }
  function paint(story, final = false) {
    const time = final ? 0 : Math.max(0, story.elapsed - story.delay) % STORY_DURATION;
    if (story.kind === 'settings') paintSettings(story.nodes, time);
    else if (story.kind === 'export') paintExport(story, time);
    else if (story.kind === 'compare') paintCompare(story.nodes, time);
    else if (story.kind === 'report') paintReport(story.nodes, time);
  }
  function setupTilt() {
    if (still || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    doc.querySelectorAll('.cm-browser-frame').forEach(element => {
      const reset = () => { element.style.setProperty('--cm-tilt-x','0deg'); element.style.setProperty('--cm-tilt-y','0deg'); };
      element.addEventListener('pointermove', event => {
        if (reduced) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (clamp((event.clientX - rect.x) / rect.width) - .5) * 3;
        const y = (clamp((event.clientY - rect.y) / rect.height) - .5) * -3;
        element.style.setProperty('--cm-tilt-x', `${y.toFixed(2)}deg`);
        element.style.setProperty('--cm-tilt-y', `${x.toFixed(2)}deg`);
      }, {passive:true});
      element.addEventListener('pointerleave', reset, {passive:true});
      tiltFrames.push(reset);
    });
  }
  function hasActiveStories() {
    return !reduced && !doc.hidden && stories.some(s => s.visible && s.started);
  }
  function tick(now) {
    const delta = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    stories.forEach(story => {
      if (story.visible && story.started) {
        story.elapsed += delta;
        if (story.elapsed >= story.delay) paint(story);
      }
    });
    if (hasActiveStories()) frame = requestAnimationFrame(tick);
    else { frame = 0; last = 0; }
  }
  function resume() {
    if (hasActiveStories() && !frame) { last = 0; frame = requestAnimationFrame(tick); }
  }
  function pause() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function land(element) {
    element.classList.add('cm-landed');
  }
  function observeOnce(elements, handler) {
    if (!('IntersectionObserver' in window)) { elements.forEach(handler); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting && (entry.intersectionRatio >= .3 || entry.boundingClientRect.height > innerHeight)) {
        handler(entry.target);
        observer.unobserve(entry.target);
      }
    }), { threshold: [0,.3], rootMargin: '0px 0px -4% 0px' });
    elements.forEach(el => observer.observe(el));
    observers.push(observer);
  }
  function prepareTagline(element) {
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const words = [];
    nodes.forEach(node => {
      const fragment = doc.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) fragment.appendChild(doc.createTextNode(part));
        else {
          const span = doc.createElement('span');
          span.className = 'cm-tag-word';
          span.textContent = part;
          words.push(span);
          fragment.appendChild(span);
        }
      });
      node.replaceWith(fragment);
    });
    if (reduced || !('IntersectionObserver' in window)) words.forEach(word => word.classList.add('cm-word-lit'));
    else {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('cm-word-lit');
          observer.unobserve(entry.target);
        }
      }), { rootMargin: '0px 0px -25% 0px', threshold: .1 });
      words.forEach((word, index) => {
        word.style.transitionDelay = `${(index % 12) * 45}ms`;
        observer.observe(word);
      });
      observers.push(observer);
    }
  }
  function settleAll() {
    doc.documentElement.classList.remove('motion-enabled');
    doc.querySelectorAll('[data-hero-item],[data-intro],[data-app-frame],[data-card-intro]').forEach(land);
    doc.querySelectorAll('.cm-tag-word').forEach(word => word.classList.add('cm-word-lit'));
    stories.forEach(story => paint(story, true));
    tiltFrames.forEach(reset => reset());
  }
  const heroItems = [...doc.querySelectorAll('[data-hero-item]')];
  doc.querySelectorAll('[data-app-frame]').forEach(frameElement => {
    frameElement.querySelectorAll('[data-app-content]').forEach((item, index) => {
      item.style.setProperty('--cm-delay', `${Math.min(index * 65,1100)}ms`);
    });
  });
  doc.querySelectorAll('[data-tagline]').forEach(prepareTagline);
  doc.querySelectorAll('[data-feature-motion]').forEach(section => {
    section.querySelectorAll('[data-card-intro]').forEach((card, index) => {
      card.style.setProperty('--cm-delay', `${index * 90}ms`);
      card.querySelectorAll('[data-story]').forEach(el => {
        stories.push(createStory(el, card, index));
      });
    });
  });
  setupTilt();
  stories.forEach(story => paint(story, true));
  if (reduced) settleAll();
  else {
    doc.documentElement.classList.add('motion-enabled');
    heroItems.forEach((item, index) => item.style.setProperty('--cm-delay', `${Math.min(index * 60,540)}ms`));
    requestAnimationFrame(() => requestAnimationFrame(() => heroItems.forEach(land)));
    observeOnce([...doc.querySelectorAll('[data-intro]')], land);
    observeOnce([...doc.querySelectorAll('[data-app-frame]')], land);
    observeOnce([...doc.querySelectorAll('[data-card-intro]')], card => {
      land(card);
      stories.filter(story => story.card === card).forEach(story => { story.started = true; });
      resume();
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        stories.filter(story => story.el === entry.target).forEach(story => { story.visible = entry.isIntersecting; });
        resume();
      }), {threshold:0});
      stories.forEach(story => observer.observe(story.el));
      observers.push(observer);
    } else {
      stories.forEach(story => { story.visible = true; story.started = true; });
      resume();
    }
  }
  doc.addEventListener('visibilitychange', () => doc.hidden ? pause() : resume());
  motionQuery.addEventListener('change', event => {
    reduced = event.matches || still;
    if (reduced) { pause(); settleAll(); }
    else resume();
  });
  window.addEventListener('pagehide', () => { pause(); observers.forEach(observer => observer.disconnect()); }, {once:true});
  // Presentation state only. It contains no visitor or browser characteristics.
  window.ClaudeMotion = Object.freeze({
    ready: true,
    kind: 'website-presentation',
    totalStories: stories.length,
    get activeStories() { return reduced || doc.hidden ? 0 : stories.filter(s => s.visible && s.started).length; },
    get paused() { return !hasActiveStories(); },
    get reduced() { return reduced; }
  });
  window.ClaudeMiniMotion = window.ClaudeMotion;
})();
