import { h, ICON, starsHtml } from './dom';
import { ERAS, readLink, type EraMeta } from '../content/catalog';
import { VERSES, TRANSLATION_NAMES, type Translation } from '../content/verses';
import {
  ERA_ORDER,
  completedCount,
  eraProgress,
  isEraUnlocked,
  rankFor,
  type AvatarConfig,
  type HairStyle,
  type Headwear,
  type Profile,
  type SaveData,
  type Settings,
} from '../logic/progress';
import { SKIN_TONES } from '../world/Character';
import { audio } from '../engine/Audio';

// ------------------------------------------------------------------ helpers

export function openModal(root: HTMLElement, content: HTMLElement, cls = ''): { el: HTMLDivElement; close: () => void } {
  const el = h('div', { class: `modal ${cls}` }, content);
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return {
    el,
    close: () => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 260);
    },
  };
}

const btn = (label: string, onclick: () => void, cls = 'btn') =>
  h(
    'button',
    {
      class: cls,
      onclick: () => {
        audio.unlock();
        audio.play('click');
        onclick();
      },
    },
    label,
  );

// ------------------------------------------------------------------ title

export type TitleChoice = 'continue' | 'new' | 'journal' | 'settings' | 'help';

export function titleScreen(root: HTMLElement, save: SaveData): Promise<TitleChoice> {
  return new Promise((resolve) => {
    const has = !!save.profile;
    const done = (c: TitleChoice) => {
      m.close();
      resolve(c);
    };
    const r = rankFor(save.xp);
    const content = h(
      'div',
      { class: 'title-screen' },
      h('div', { class: 'logo' }, h('span', { class: 'logo-arch' }), h('h1', null, 'SCROLLGATE'), h('p', { class: 'tagline' }, 'Walk through time. Live the stories. Hide the Word in your heart.')),
      h(
        'div',
        { class: 'title-buttons' },
        has ? btn(`Continue as ${save.profile!.name}`, () => done('continue'), 'btn primary big') : null,
        has ? h('div', { class: 'title-meta' }, `${r.rank.title} · ${completedCount(save)}/7 eras · ${save.xp} XP${save.streak.count > 1 ? ` · 🔥 ${save.streak.count}-day streak` : ''}`) : null,
        btn(has ? 'New journey' : 'Begin the journey', () => done('new'), has ? 'btn' : 'btn primary big'),
        h(
          'div',
          { class: 'row' },
          has ? btn('Chronicle', () => done('journal'), 'btn ghost') : null,
          btn('How to play', () => done('help'), 'btn ghost'),
          btn('Settings', () => done('settings'), 'btn ghost'),
        ),
      ),
      h('p', { class: 'fine' }, 'Scripture quotations: World English Bible & King James Version (public domain). Dialogue is dramatised; read the full stories in your Bible.'),
    );
    const m = openModal(root, content, 'title-modal');
  });
}

// ------------------------------------------------------------------ creator

const HAIRS: [HairStyle, string][] = [
  ['short', 'Short'],
  ['afro', 'Afro'],
  ['puffs', 'Puffs'],
  ['braids', 'Braids'],
  ['long', 'Long'],
  ['bald', 'Bald'],
];
const HAIR_COLORS = ['#1d1410', '#3b2416', '#6b4423', '#a8743a', '#d9b26a', '#9a9a9a'];
const OUTFITS = ['#c9b48a', '#efe6d2', '#a8402e', '#2f6f8f', '#3f7a4a', '#7a4a8a', '#e0a03a', '#3a3a48'];
const ACCENTS = ['#c9a24a', '#e8dcc0', '#8a2a2a', '#2a4a8a', '#2f5a3a', '#d86a3a'];
const HEADWEAR: [Headwear, string][] = [
  ['none', 'None'],
  ['headwrap', 'Wrap'],
  ['keffiyeh', 'Keffiyeh'],
  ['hood', 'Hood'],
  ['veil', 'Veil'],
];

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: SKIN_TONES[2],
  hairStyle: 'short',
  hairColor: HAIR_COLORS[0],
  outfit: OUTFITS[2],
  accent: ACCENTS[0],
  headwear: 'none',
};

export function creatorScreen(
  root: HTMLElement,
  initial: Profile | null,
  onPreview: (a: AvatarConfig) => void,
): Promise<Profile> {
  return new Promise((resolve) => {
    const av: AvatarConfig = { ...(initial?.avatar ?? DEFAULT_AVATAR) };
    let translation: Translation = initial?.translation ?? 'WEB';
    const name = h('input', { class: 'name-input', maxlength: 16, placeholder: 'Your name', value: initial?.name ?? '', autocomplete: 'off' });
    const update = () => onPreview({ ...av });
    const swatches = (colors: string[], key: 'skin' | 'hairColor' | 'outfit' | 'accent') => {
      const row = h('div', { class: 'swatches' });
      const draw = () => {
        row.innerHTML = '';
        for (const c of colors) {
          row.append(
            h('button', {
              class: `sw ${av[key] === c ? 'on' : ''}`,
              style: `background:${c}`,
              'aria-label': c,
              onclick: () => {
                av[key] = c;
                audio.play('click');
                draw();
                update();
              },
            }),
          );
        }
      };
      draw();
      return row;
    };
    const choice = <T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const row = h('div', { class: 'seg wrap' });
      const draw = () => {
        row.innerHTML = '';
        for (const [v, label] of opts) {
          row.append(
            h(
              'button',
              {
                class: get() === v ? 'on' : '',
                onclick: () => {
                  set(v);
                  audio.play('click');
                  draw();
                  update();
                },
              },
              label,
            ),
          );
        }
      };
      draw();
      return row;
    };
    const sample = h('p', { class: 'sample' });
    const drawSample = () => {
      sample.textContent = `“${VERSES['psalm-119-11'].text[translation]}” Psalm 119:11`;
    };
    drawSample();
    const tRow = h('div', { class: 'seg' });
    const drawT = () => {
      tRow.innerHTML = '';
      (['WEB', 'KJV'] as Translation[]).forEach((t) =>
        tRow.append(
          h(
            'button',
            {
              class: t === translation ? 'on' : '',
              title: TRANSLATION_NAMES[t],
              onclick: () => {
                translation = t;
                audio.play('click');
                drawT();
                drawSample();
              },
            },
            t === 'WEB' ? 'Modern (WEB)' : 'Classic (KJV)',
          ),
        ),
      );
    };
    drawT();
    const err = h('div', { class: 'err' });
    const go = () => {
      const n = name.value.trim().replace(/\s+/g, ' ');
      if (n.length < 2) {
        err.textContent = 'Please enter a name (at least 2 letters).';
        name.focus();
        return;
      }
      audio.unlock();
      audio.play('success');
      m.close();
      resolve({ name: n, avatar: { ...av }, translation, createdAt: initial?.createdAt ?? Date.now() });
    };
    const content = h(
      'div',
      { class: 'creator' },
      h('h2', null, initial ? 'Change your look' : 'Who is travelling?'),
      h('label', null, 'Name'),
      name,
      err,
      h('label', null, 'Skin tone'),
      swatches(SKIN_TONES, 'skin'),
      h('label', null, 'Hair'),
      choice(HAIRS, () => av.hairStyle, (v) => (av.hairStyle = v)),
      swatches(HAIR_COLORS, 'hairColor'),
      h('label', null, 'Head covering'),
      choice(HEADWEAR, () => av.headwear, (v) => (av.headwear = v)),
      h('label', null, 'Robe'),
      swatches(OUTFITS, 'outfit'),
      h('label', null, 'Sash'),
      swatches(ACCENTS, 'accent'),
      h('label', null, 'Bible translation for memory verses'),
      tRow,
      sample,
      h('div', { class: 'row' }, btn(initial ? 'Save' : 'Step through the gate →', go, 'btn primary big')),
    );
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    const m = openModal(root, content, 'side-modal');
    update();
    if (!initial) setTimeout(() => name.focus(), 300);
  });
}

// ------------------------------------------------------------------ era intro & results

export function eraIntro(root: HTMLElement, meta: EraMeta, save: SaveData): Promise<boolean> {
  return new Promise((resolve) => {
    const p = eraProgress(save, meta.id);
    const unlocked = isEraUnlocked(save, meta.id);
    const done = (v: boolean) => {
      m.close();
      resolve(v);
    };
    const content = h(
      'div',
      { class: 'card era-card', style: `--accent:${meta.accent}` },
      h('div', { class: 'era-icon' }, meta.icon),
      h('div', { class: 'kicker' }, `${meta.age} · ${meta.ref}`),
      h('h2', null, meta.title),
      h('p', null, meta.summary),
      h('div', { class: 'mission' }, h('b', null, 'Your mission'), h('span', null, meta.mission)),
      h('div', { class: 'era-meta' },
        h('span', null, `Memory verse: ${VERSES[meta.verseId].ref}`),
        h('span', { html: p.completed ? `Best ${starsHtml(p.bestStars)}` : 'Not yet completed' }),
        h('span', null, `Scroll fragments: ${p.fragments.length}/3`),
      ),
      unlocked
        ? h('div', { class: 'row' }, btn('Not yet', () => done(false), 'btn ghost'), btn('Enter the gate', () => done(true), 'btn primary big'))
        : h('div', { class: 'row' }, h('p', { class: 'locked', html: `${ICON.lock} Complete the previous era to unlock.` }), btn('Back', () => done(false), 'btn ghost')),
    );
    const m = openModal(root, content);
  });
}

export interface ResultData {
  meta: EraMeta;
  stars: number;
  verseStars: number;
  gameStars: number;
  xp: number;
  fragments: number;
  quiz: [number, number];
  translation: Translation;
  firstClear: boolean;
}

export function resultsScreen(root: HTMLElement, d: ResultData): Promise<'hall' | 'replay'> {
  return new Promise((resolve) => {
    const done = (v: 'hall' | 'replay') => {
      m.close();
      resolve(v);
    };
    const content = h(
      'div',
      { class: 'card results', style: `--accent:${d.meta.accent}` },
      h('div', { class: 'kicker' }, d.firstClear ? 'Era complete!' : 'Era replayed'),
      h('h2', null, d.meta.title),
      h('div', { class: 'big-stars pop', html: starsHtml(d.stars) }),
      h(
        'div',
        { class: 'stat-grid' },
        h('div', null, h('b', null, `+${d.xp}`), h('small', null, 'XP earned')),
        h('div', null, h('b', { html: starsHtml(d.verseStars) }), h('small', null, 'Memory verse')),
        h('div', null, h('b', null, `${d.fragments}/3`), h('small', null, 'Scroll fragments')),
        h('div', null, h('b', null, `${d.quiz[0]}/${d.quiz[1]}`), h('small', null, 'Questions')),
      ),
      h('p', { class: 'read-more' }, 'Want the whole story? ', h('a', { href: readLink(d.meta.passage, d.translation), target: '_blank', rel: 'noopener' }, `Read ${d.meta.ref} →`)),
      h('div', { class: 'row' }, btn('Replay', () => done('replay'), 'btn ghost'), btn('Return to the Hall of Ages', () => done('hall'), 'btn primary big')),
    );
    const m = openModal(root, content);
    audio.play('fanfare');
  });
}

// ------------------------------------------------------------------ quiz

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
  explain: string;
  ref: string;
}

export function quizModal(root: HTMLElement, who: string, q: QuizQ): Promise<boolean> {
  return new Promise((resolve) => {
    const opts = h('div', { class: 'quiz-opts' });
    const after = h('div', { class: 'quiz-after' });
    let answered = false;
    q.options.forEach((o, i) => {
      const b = h('button', { class: 'quiz-opt' }, h('kbd', null, String.fromCharCode(65 + i)), o);
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const ok = i === q.answer;
        audio.play(ok ? 'success' : 'error');
        b.classList.add(ok ? 'right' : 'wrong');
        (opts.children[q.answer] as HTMLElement).classList.add('right');
        after.append(
          h('b', { class: ok ? 'good' : 'bad' }, ok ? 'Correct! +30 XP' : 'Not quite.'),
          h('p', null, q.explain),
          h('cite', null, q.ref),
          btn('Continue', () => {
            window.removeEventListener('keydown', onKey, true);
            m.close();
            resolve(ok);
          }, 'btn primary'),
        );
      });
      opts.append(b);
    });
    const onKey = (e: KeyboardEvent) => {
      const idx = e.code.startsWith('Key') ? e.code.charCodeAt(3) - 65 : -1;
      if (!answered && idx >= 0 && idx < q.options.length) (opts.children[idx] as HTMLButtonElement).click();
    };
    window.addEventListener('keydown', onKey, true);
    const content = h('div', { class: 'card quiz' }, h('div', { class: 'kicker' }, `${who} asks…`), h('h3', null, q.q), opts, after);
    const m = openModal(root, content);
  });
}

// ------------------------------------------------------------------ pause / settings / help

export type PauseChoice = 'resume' | 'journal' | 'settings' | 'restart' | 'hall' | 'help' | 'title';

export function pauseMenu(root: HTMLElement, inEra: boolean): Promise<PauseChoice> {
  return new Promise((resolve) => {
    const done = (c: PauseChoice) => {
      window.removeEventListener('keydown', onKey, true);
      m.close();
      resolve(c);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.stopPropagation();
        done('resume');
      }
    };
    window.addEventListener('keydown', onKey, true);
    const content = h(
      'div',
      { class: 'card pause' },
      h('h2', null, 'Paused'),
      btn('Resume', () => done('resume'), 'btn primary big'),
      btn('Chronicle', () => done('journal')),
      btn('Settings', () => done('settings')),
      btn('How to play', () => done('help')),
      inEra ? btn('Restart this era', () => done('restart')) : null,
      inEra ? btn('Return to the Hall of Ages', () => done('hall')) : btn('Title screen', () => done('title')),
    );
    const m = openModal(root, content);
  });
}

export function settingsScreen(
  root: HTMLElement,
  save: SaveData,
  apply: (s: Settings, translation?: Translation) => void,
  onReset: () => void,
  onEditAvatar?: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    const s: Settings = { ...save.settings };
    let translation = save.profile?.translation;
    const slider = (label: string, key: 'music' | 'sfx') => {
      const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key] });
      input.addEventListener('input', () => {
        s[key] = Number(input.value);
        apply({ ...s });
      });
      return h('div', { class: 'set-row' }, h('span', null, label), input);
    };
    const toggle = (label: string, key: 'narrator' | 'largeText' | 'reduceMotion' | 'unlockAll', hint?: string) => {
      const input = h('input', { type: 'checkbox', checked: s[key] });
      input.addEventListener('change', () => {
        s[key] = input.checked;
        apply({ ...s });
      });
      return h('label', { class: 'set-row check' }, input, h('span', null, label, hint ? h('small', null, hint) : null));
    };
    const quality = h('select', null, ...(['auto', 'low', 'medium', 'high'] as const).map((q) => h('option', { value: q, selected: s.quality === q }, q[0].toUpperCase() + q.slice(1))));
    quality.addEventListener('change', () => {
      s.quality = quality.value as Settings['quality'];
      apply({ ...s });
    });
    const trans = translation
      ? (() => {
          const sel = h('select', null, ...(['WEB', 'KJV'] as Translation[]).map((t) => h('option', { value: t, selected: t === translation }, TRANSLATION_NAMES[t])));
          sel.addEventListener('change', () => {
            translation = sel.value as Translation;
            apply({ ...s }, translation);
          });
          return h('div', { class: 'set-row' }, h('span', null, 'Bible translation'), sel);
        })()
      : null;
    let resetArmed = false;
    const resetBtn = btn('Reset all progress', () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = 'Tap again to erase everything';
        resetBtn.classList.add('danger');
        return;
      }
      m.close();
      onReset();
      resolve();
    }, 'btn ghost small');
    const content = h(
      'div',
      { class: 'card settings' },
      h('h2', null, 'Settings'),
      slider('Music', 'music'),
      slider('Sound effects', 'sfx'),
      h('div', { class: 'set-row' }, h('span', null, 'Graphics quality'), quality),
      trans,
      toggle('Narrator voice', 'narrator', 'Reads dialogue aloud'),
      toggle('Larger text', 'largeText'),
      toggle('Reduce motion', 'reduceMotion', 'Less camera shake and flashing'),
      toggle('Youth-leader mode', 'unlockAll', 'Unlock every era (for groups and classes)'),
      onEditAvatar ? btn('Change appearance', () => { m.close(); resolve(); onEditAvatar(); }, 'btn ghost') : null,
      h('div', { class: 'row' }, resetBtn, btn('Done', () => { m.close(); resolve(); }, 'btn primary')),
    );
    const m = openModal(root, content);
  });
}

export function helpScreen(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const content = h(
      'div',
      { class: 'card help' },
      h('h2', null, 'How to play'),
      h(
        'div',
        { class: 'help-grid' },
        h('div', null, h('h4', null, 'Keyboard & mouse'), h('ul', null,
          h('li', null, h('kbd', null, 'W A S D'), ' or arrows: move'),
          h('li', null, h('kbd', null, 'Shift'), ': run'),
          h('li', null, h('kbd', null, 'Space'), ': jump'),
          h('li', null, h('kbd', null, 'E'), ': talk / interact'),
          h('li', null, h('kbd', null, 'F'), ' or click: action in mini-games'),
          h('li', null, 'Drag the mouse: look around'),
          h('li', null, h('kbd', null, 'Esc'), ': pause'),
        )),
        h('div', null, h('h4', null, 'Phone & tablet'), h('ul', null,
          h('li', null, 'Left thumb: drag to move'),
          h('li', null, 'Right side: drag to look'),
          h('li', null, 'Buttons: Talk, Jump, Run, and Act in mini-games'),
          h('li', null, 'Turn your phone sideways for the best view'),
        )),
        h('div', null, h('h4', null, 'Your journey'), h('ul', null,
          h('li', null, 'Follow the golden beam ✦ to your next objective.'),
          h('li', null, 'Find 3 hidden scroll fragments in each era.'),
          h('li', null, 'Answer questions from the people you meet.'),
          h('li', null, 'Learn each era’s memory verse: build it, fill it, type it, or say it out loud.'),
          h('li', null, 'Practise any time in the Verse Vault (Chronicle).'),
        )),
      ),
      h('div', { class: 'row' }, btn('Got it', () => { m.close(); resolve(); }, 'btn primary')),
    );
    const m = openModal(root, content);
  });
}

// ------------------------------------------------------------------ journal

export function journalScreen(
  root: HTMLElement,
  save: SaveData,
  onPractice: (verseId: string) => Promise<void>,
  onCertificate: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    let tab: 'journey' | 'verses' | 'relics' = 'journey';
    const body = h('div', { class: 'journal-body' });
    const tabs = h('div', { class: 'seg tabs' });
    const r = rankFor(save.xp);
    const draw = () => {
      tabs.innerHTML = '';
      (
        [
          ['journey', 'Journey'],
          ['verses', 'Verse Vault'],
          ['relics', 'Relics'],
        ] as const
      ).forEach(([id, label]) =>
        tabs.append(h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; audio.play('page'); draw(); } }, label)),
      );
      body.innerHTML = '';
      if (tab === 'journey') {
        body.append(
          h('div', { class: 'rank-card' },
            h('div', null, h('small', null, 'Rank'), h('b', null, r.rank.title)),
            h('div', { class: 'xpbar wide' }, h('i', { style: `width:${Math.round(r.progress * 100)}%` })),
            h('small', null, r.next ? `${save.xp} / ${r.next.minXp} XP to ${r.next.title}` : `${save.xp} XP · highest rank!`),
          ),
        );
        const list = h('div', { class: 'era-list' });
        for (const e of ERAS) {
          const p = eraProgress(save, e.id);
          const open = isEraUnlocked(save, e.id);
          list.append(
            h('div', { class: `era-row ${open ? '' : 'locked'}`, style: `--accent:${e.accent}` },
              h('span', { class: 'era-ico' }, open ? e.icon : '🔒'),
              h('div', null, h('b', null, e.title), h('small', null, `${e.age} · ${e.ref}`)),
              h('span', { html: p.completed ? starsHtml(p.bestStars) : open ? '<small>Open</small>' : '' }),
            ),
          );
        }
        body.append(list);
        if (completedCount(save) === ERA_ORDER.length) body.append(btn('🎓 View your certificate', onCertificate, 'btn primary'));
      } else if (tab === 'verses') {
        const ids = ['psalm-119-11', ...ERAS.map((e) => e.verseId)];
        const list = h('div', { class: 'verse-list' });
        const t = save.profile?.translation ?? 'WEB';
        for (const id of ids) {
          const v = VERSES[id];
          const vp = save.verses[id];
          if (!vp?.learned) {
            list.append(h('div', { class: 'verse-row locked' }, h('b', null, '???'), h('small', null, 'Discover this verse on your journey')));
            continue;
          }
          list.append(
            h('div', { class: 'verse-row' },
              h('div', null, h('b', null, v.ref), h('p', null, v.text[t])),
              h('div', { class: 'vr-side' }, h('span', { html: starsHtml(vp.bestStars) }), h('small', null, `practised ${vp.practiced}×`),
                btn('Practise', async () => {
                  m.el.style.display = 'none';
                  await onPractice(id);
                  m.close();
                  resolve();
                }, 'btn small')),
            ),
          );
        }
        body.append(list);
      } else {
        const list = h('div', { class: 'relic-list' });
        for (const e of ERAS) {
          const p = eraProgress(save, e.id);
          for (const f of e.fragments) {
            const found = p.fragments.includes(f.id);
            list.append(
              h('div', { class: `relic ${found ? '' : 'locked'}` },
                h('span', { class: 'relic-ico', html: ICON.scroll }),
                h('div', null, h('b', null, found ? f.title : 'Undiscovered fragment'), h('small', null, found ? `${f.text} (${f.ref})` : `Hidden somewhere in ${e.title}`)),
              ),
            );
          }
        }
        body.append(list);
      }
    };
    const content = h('div', { class: 'card journal' }, h('h2', null, 'Chronicle'), tabs, body, h('div', { class: 'row' }, btn('Close', () => { m.close(); resolve(); }, 'btn primary')));
    const m = openModal(root, content);
    draw();
  });
}

// ------------------------------------------------------------------ certificate

export function certificateScreen(root: HTMLElement, save: SaveData): Promise<void> {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 800;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 800);
    grd.addColorStop(0, '#1a1033');
    grd.addColorStop(1, '#3b1f4f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1200, 800);
    g.strokeStyle = '#f3c86a';
    g.lineWidth = 6;
    g.strokeRect(30, 30, 1140, 740);
    g.lineWidth = 2;
    g.strokeRect(46, 46, 1108, 708);
    g.textAlign = 'center';
    g.fillStyle = '#f3c86a';
    g.font = '700 30px Cinzel, Georgia, serif';
    g.fillText('SCROLLGATE', 600, 120);
    g.fillStyle = '#fff6e6';
    g.font = '800 56px Cinzel, Georgia, serif';
    g.fillText('Certificate of the Timewalker', 600, 200);
    g.font = '400 28px Nunito, sans-serif';
    g.fillText('This certifies that', 600, 280);
    g.font = '800 72px Cinzel, Georgia, serif';
    g.fillStyle = '#ffe9a8';
    g.fillText(save.profile?.name ?? 'Traveller', 600, 370);
    g.fillStyle = '#fff6e6';
    g.font = '400 28px Nunito, sans-serif';
    const learned = Object.values(save.verses).filter((v) => v.learned).length;
    g.fillText(`walked through all seven ages of Scripture and hid ${learned} verses in their heart.`, 600, 440);
    g.fillText(`Rank: ${rankFor(save.xp).rank.title}  ·  ${save.xp} XP`, 600, 490);
    g.font = 'italic 26px Georgia, serif';
    g.fillStyle = '#f3c86a';
    g.fillText(`“${VERSES['psalm-119-11'].text[save.profile?.translation ?? 'WEB']}”`, 600, 590);
    g.font = '400 22px Nunito, sans-serif';
    g.fillText('Psalm 119:11', 600, 625);
    g.fillStyle = '#c9bfd8';
    g.fillText(new Date().toLocaleDateString(), 600, 720);
    const url = c.toDataURL('image/png');
    const img = h('img', { src: url, alt: 'Your Scrollgate certificate', class: 'cert-img' });
    const download = h('a', { class: 'btn primary', href: url, download: 'scrollgate-certificate.png' }, 'Download');
    const share = navigator.share
      ? btn('Share', async () => {
          try {
            const blob = await (await fetch(url)).blob();
            const file = new File([blob], 'scrollgate-certificate.png', { type: 'image/png' });
            await navigator.share({ title: 'Scrollgate', text: 'I walked through Bible history in Scrollgate!', files: [file] });
          } catch {
            /* user cancelled */
          }
        })
      : null;
    const content = h('div', { class: 'card cert' }, img, h('div', { class: 'row' }, share, download, btn('Close', () => { m.close(); resolve(); }, 'btn ghost')));
    const m = openModal(root, content);
  });
}
