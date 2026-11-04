'use strict';
const $ = (id) => document.getElementById(id);
let view = null;

function text(el, value) {
  el.textContent = value;
}

function seatInfo(g) {
  const info = document.createElement('div');
  info.className = g.onBackup ? 'driver backup' : 'driver';
  const who = g.driver === 'human' ? 'person' : g.driver === 'bot' ? 'autopilot' : `${g.driver} ${g.model}`;
  text(info, who);
  const meter = document.createElement('div');
  meter.className = 'gauge';
  meter.title = `${g.tokens} of ${g.tokenCap} tokens, ${g.calls} calls, ${g.swaps} swaps`;
  const fill = document.createElement('span');
  const share = g.tokenCap > 0 ? Math.min(1, g.tokens / g.tokenCap) : 0;
  fill.style.width = `${Math.round(share * 100)}%`;
  if (share >= 0.8) fill.className = 'high';
  meter.append(fill);
  const wrap = document.createElement('div');
  wrap.append(info, meter);
  return wrap;
}

function render() {
  if (!view) return;
  const map = $('map');
  map.style.backgroundImage = view.scene.map ? `url("${view.scene.map}")` : 'none';
  text($('scene'), `${view.scene.id}   round ${view.round}/${view.roundLimit}   ${view.phase}`);

  const tokens = $('tokens');
  tokens.replaceChildren();
  for (const t of view.tokens) {
    const box = document.createElement('div');
    box.className = t.out ? 'token out' : 'token';
    const img = document.createElement('img');
    if (t.art) img.src = t.art;
    img.alt = t.name;
    const name = document.createElement('div');
    text(name, t.holder === 'bot' ? t.name : `${t.name} (${t.holder})`);
    const gauge = (view.seats || []).find((g) => `seat:${g.seat}` === t.who);
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.title = t.wound;
    for (let i = 0; i < 6; i++) {
      const cell = document.createElement('span');
      if (i < t.woundIndex) cell.className = 'on';
      bar.append(cell);
    }
    box.append(img, name, bar);
    if (gauge) box.append(seatInfo(gauge));
    tokens.append(box);
  }

  const order = $('initiative');
  order.replaceChildren();
  for (const e of view.initiative) {
    const li = document.createElement('li');
    li.className = e.current ? 'current' : '';
    text(li, e.name);
    order.append(li);
  }

  const feed = $('feed');
  feed.replaceChildren();
  for (const f of view.feed) {
    const li = document.createElement('li');
    text(li, f.text);
    feed.append(li);
  }

  const marks = $('marks');
  marks.replaceChildren();
  for (const m of view.marks || []) {
    const li = document.createElement('li');
    text(li, `Swap: ${m}`);
    marks.append(li);
  }

  const dice = $('dice');
  if (view.dice) {
    const d = view.dice;
    const parts = [`${d.skill}: ${d.normal.join(' ')}`];
    if (d.special.length) parts.push(`${view.specialDieName} ${d.special.join(' ')}`);
    parts.push(`= ${d.total}`);
    if (d.target !== null) parts.push(`vs ${d.target} ${d.success ? 'hit' : 'miss'}`);
    text(dice, parts.join('   '));
  } else {
    text(dice, '');
  }
  tick();
}

function tick() {
  const el = $('timer');
  if (!view || !view.window) return text(el, '');
  const left = Math.max(0, Math.ceil((view.window.endsAt - Date.now()) / 1000));
  text(el, `${left}s`);
}

const source = new EventSource('/overlay/events');
source.addEventListener('snapshot', (e) => {
  view = JSON.parse(e.data).view;
  render();
});
source.addEventListener('event', (e) => {
  view = JSON.parse(e.data).view;
  render();
});
setInterval(tick, 500);
