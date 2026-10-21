'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const lerp = (a, b, t) => a + (b - a) * t;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Interpolate between [x, value] keyframes using the given blend function. */
function sample(keys, x, blend) {
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, v0] = keys[i - 1];
      const [x1, v1] = keys[i];
      return blend(v0, v1, (x - x0) / (x1 - x0));
    }
  }
  return keys[keys.length - 1][1];
}
function mix(a, b, t) {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const [p, q] = [rgb(a), rgb(b)];
  return `rgb(${p.map((v, i) => Math.round(lerp(v, q[i], t))).join()})`;
}

/* ---------- Roast curve (hero) ---------- */
const CURVE = [[0, 200], [1.5, 95], [4, 140], [6, 165], [8, 185], [9, 196], [10.5, 206], [12, 213]]; // minutes, °C
const COLORS = [[0, '#8da35b'], [3, '#cfc36a'], [5, '#d6a850'], [8, '#a8693a'], [9.5, '#6b3a1f'], [12, '#33190d']];
const STAGES = [[0, 'Drying'], [4, 'Maillard reaction'], [8.5, 'First crack'], [10, 'Development'], [11.5, 'Second crack']];
const LEVEL_AT = { light: 9, medium: 10.2, dark: 11.5 }; // where each roast level is dropped, in minutes

const X = m => 56 + m * 47;
const Y = t => 240 - (t - 80) / 140 * 220;
const tempAt = m => sample(CURVE, m, lerp);
function pathTo(m) {
  let d = '';
  for (let t = 0; t < m; t += 0.1) d += `${t ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(tempAt(t)).toFixed(1)}`;
  return d + `${m ? 'L' : 'M'}${X(m).toFixed(1)} ${Y(tempAt(m)).toFixed(1)}`;
}

const scrub = $('#scrub');
const trace = $('#trace');
const dot = $('#dot');
const hero = $('.hero');
let anim = 0; // incremented to cancel a running animation

function render(m) {
  const temp = tempAt(m);
  const stage = STAGES.filter(s => m >= s[0]).pop()[1];
  const secs = Math.round(m * 60);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  scrub.value = m;
  trace.setAttribute('d', pathTo(m));
  dot.setAttribute('cx', X(m));
  dot.setAttribute('cy', Y(temp));
  hero.style.setProperty('--bean', sample(COLORS, m, mix));
  $('#r-time').textContent = time;
  $('#r-temp').textContent = `${Math.round(temp)} °C`;
  $('#r-stage').textContent = stage;
  scrub.setAttribute('aria-valuetext', `${stage}, at ${time}, ${Math.round(temp)} degrees Celsius`);
}

function goTo(minutes) {
  const id = ++anim;
  if (reduceMotion) return render(minutes);
  const from = +scrub.value;
  const start = performance.now();
  (function tick(now) {
    if (id !== anim) return;
    const p = Math.min((now - start) / 2000, 1);
    render(from + (minutes - from) * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}
scrub.addEventListener('input', () => { anim++; render(+scrub.value); });

/* ---------- Roast list and filters ---------- */
const ROASTS = [
  { name: 'Kochere Washed', origin: 'Ethiopia', level: 'light', notes: 'Jasmine, bergamot, peach tea', method: 'v60', price: 17 },
  { name: 'Huila Honey', origin: 'Colombia', level: 'light', notes: 'Red apple, panela, orange zest', method: 'aero', price: 16 },
  { name: 'Cerrado Natural', origin: 'Brazil', level: 'medium', notes: 'Hazelnut, cocoa nib, baked plum', method: 'press', price: 15 },
  { name: 'Nyeri AA', origin: 'Kenya', level: 'medium', notes: 'Blackcurrant, grapefruit, brown sugar', method: 'espresso', price: 19 },
  { name: 'Lintong', origin: 'Sumatra', level: 'dark', notes: 'Cedar, dark chocolate, molasses', method: 'press', price: 16 },
  { name: 'House Ember', origin: 'Brazil and Guatemala', level: 'dark', notes: 'Roasted almond, cacao, caramel', method: 'moka', price: 14 }
];
const list = $('#roast-list');
const statusEl = $('#status');

function showRoasts(level) {
  const shown = level === 'all' ? ROASTS : ROASTS.filter(r => r.level === level);
  list.innerHTML = shown.map(r => `
    <li class="roast" style="--c:${sample(COLORS, LEVEL_AT[r.level], mix)}">
      <div>
        <h3>${r.name}</h3>
        <p class="origin">${r.origin}, ${r.level} roast</p>
        <p>${r.notes}</p>
      </div>
      <div class="buy">
        <span class="price">$${r.price}<small> / 250 g</small></span>
        <button class="btn sm" type="button" data-method="${r.method}" data-name="${r.name}">Brew this</button>
      </div>
    </li>`).join('');
  statusEl.textContent = level === 'all' ? `Showing all ${shown.length} roasts.` : `Showing ${shown.length} ${level} roasts.`;
}

const chips = $$('.chip[data-level]');
chips.forEach(chip => chip.addEventListener('click', () => {
  const level = chip.dataset.level;
  chips.forEach(c => c.setAttribute('aria-pressed', c === chip));
  showRoasts(level);
  if (LEVEL_AT[level]) goTo(LEVEL_AT[level]);
}));

/* ---------- Brew calculator ---------- */
const METHODS = {
  v60: { label: 'Pour-over (V60)', ratio: 16, vol: 250, grind: 'Medium-fine, like table salt', time: '2:45 to 3:15' },
  press: { label: 'French press', ratio: 15, vol: 250, grind: 'Coarse, like sea salt', time: '4:00' },
  aero: { label: 'AeroPress', ratio: 14, vol: 200, grind: 'Medium, like sand', time: '1:30 to 2:00' },
  espresso: { label: 'Espresso (double)', ratio: 2, vol: 36, grind: 'Fine, like powdered sugar', time: '25 to 30 s' },
  moka: { label: 'Moka pot', ratio: 10, vol: 100, grind: 'Medium-fine, finer than drip', time: 'About 5:00' }
};
const methodSel = $('#method');
const cups = $('#cups');
const noteEl = $('#brew-note');
let recipe = '';

function calc() {
  const m = METHODS[methodSel.value];
  const n = +cups.value;
  const water = m.vol * n;
  const coffee = Math.round(water / m.ratio * 10) / 10;
  $('#cups-out').textContent = n;
  $('#o-coffee').textContent = `${coffee} g`;
  $('#o-water').textContent = `${water} ml`;
  $('#o-grind').textContent = m.grind;
  $('#o-time').textContent = m.time;
  recipe = `${m.label}, ${n} serving${n > 1 ? 's' : ''}: ${coffee} g coffee, ${water} ml water, grind ${m.grind.toLowerCase()}, brew time ${m.time}.`;
}
methodSel.addEventListener('change', calc);
cups.addEventListener('input', calc);

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(recipe);
    noteEl.textContent = 'Recipe copied.';
  } catch {
    noteEl.textContent = 'Copying is blocked here. Select the numbers above instead.';
  }
});

list.addEventListener('click', e => {
  const btn = e.target.closest('button[data-method]');
  if (!btn) return;
  methodSel.value = btn.dataset.method;
  calc();
  noteEl.textContent = `Recipe set for ${btn.dataset.name}.`;
  $('#brew').scrollIntoView();
  cups.focus({ preventScroll: true });
});

/* ---------- Contact form ---------- */
const RULES = {
  name: v => v.trim() ? '' : 'Enter your name.',
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter an email address like name@example.com.',
  message: v => v.trim().length >= 10 ? '' : 'Write at least 10 characters so we know how to help.'
};
const form = $('#contact');
const formStatus = $('#form-status');

function check(key) {
  const field = $(`#c-${key}`);
  const msg = RULES[key](field.value);
  field.setAttribute('aria-invalid', Boolean(msg));
  $(`#err-${key}`).textContent = msg;
  return msg ? field : null;
}
form.addEventListener('submit', e => {
  e.preventDefault();
  formStatus.textContent = '';
  const invalid = Object.keys(RULES).map(check).filter(Boolean);
  if (invalid.length) return invalid[0].focus();
  formStatus.textContent = `Thanks, ${$('#c-name').value.trim()}. We reply within two working days.`;
  form.reset();
});
form.addEventListener('input', e => {
  const key = e.target.id.replace('c-', '');
  if (RULES[key] && e.target.getAttribute('aria-invalid') === 'true') check(key);
});

/* ---------- Mobile menu ---------- */
const menuBtn = $('.menu-btn');
const nav = $('#nav');
function setMenu(open) {
  menuBtn.setAttribute('aria-expanded', open);
  nav.classList.toggle('open', open);
}
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
});

/* ---------- Init ---------- */
$('#year').textContent = new Date().getFullYear();
$('#ghost').setAttribute('d', pathTo(12));
showRoasts('all');
calc();
render(0);
goTo(9); // one opening move: the roast runs to a light-roast drop on load