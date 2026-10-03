import { h, ICON, speak, speechRecognitionCtor, starsHtml, stopSpeaking } from './dom';
import { VERSES, type Translation } from '../content/verses';
import {
  chunkVerse,
  displayWords,
  makeFillPuzzle,
  mistakeStars,
  scoreRecitation,
  shuffleNotIdentity,
  tokenize,
  type RecitationResult,
} from '../logic/verse';
import { audio } from '../engine/Audio';

export interface VerseChallengeOpts {
  verseId: string;
  translation: Translation;
  onTranslation?: (t: Translation) => void;
  practice?: boolean;
}

type Mode = 'build' | 'fill' | 'speak' | 'type';

const MODES: { id: Mode; title: string; desc: string; icon: string }[] = [
  { id: 'build', title: 'Build it', desc: 'Tap the phrases in the right order.', icon: '🧩' },
  { id: 'fill', title: 'Fill the gaps', desc: 'Pick the missing words.', icon: '✍️' },
  { id: 'speak', title: 'Speak it', desc: 'Recite it out loud from memory.', icon: '🎤' },
  { id: 'type', title: 'Type it', desc: 'Type it from memory. Hardest!', icon: '⌨️' },
];

function firstLetters(text: string): string {
  return displayWords(text)
    .map((w) => w.replace(/[A-Za-z’'’]+/, (m) => m[0] + '·'.repeat(Math.max(0, Math.min(3, m.length - 1)))))
    .join(' ');
}

function coloredWords(text: string, r: RecitationResult): HTMLElement {
  const box = h('p', { class: 'verse-scored' });
  let k = 0;
  for (const w of displayWords(text)) {
    const n = tokenize(w).length;
    const ok = n === 0 || r.matched.slice(k, k + n).every(Boolean);
    k += n;
    box.append(h('span', { class: ok ? 'w ok' : 'w miss' }, w), ' ');
  }
  return box;
}

export function verseChallenge(root: HTMLElement, opts: VerseChallengeOpts): Promise<{ stars: number; translation: Translation }> {
  const verse = VERSES[opts.verseId];
  let translation = opts.translation;
  const best: Record<Mode, number> = { build: 0, fill: 0, speak: 0, type: 0 };
  const rng = Math.random;
  const text = () => verse.text[translation];

  const modal = h('div', { class: 'modal verse-modal' });
  const card = h('div', { class: 'card verse-card' });
  modal.appendChild(card);
  root.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('in'));

  return new Promise((resolve) => {
    const finish = () => {
      stopSpeaking();
      modal.classList.remove('in');
      setTimeout(() => modal.remove(), 300);
      resolve({ stars: Math.max(...Object.values(best)), translation });
    };

    const header = (sub: string) =>
      h(
        'div',
        { class: 'verse-head' },
        h('div', { class: 'kicker' }, opts.practice ? 'Verse Vault · Practice' : 'Memory Verse'),
        h('h2', null, verse.ref),
        h('div', { class: 'sub' }, sub),
      );

    const translationToggle = () =>
      h(
        'div',
        { class: 'seg' },
        ...(['WEB', 'KJV'] as Translation[]).map((t) =>
          h(
            'button',
            {
              class: t === translation ? 'on' : '',
              onclick: () => {
                translation = t;
                opts.onTranslation?.(t);
                audio.play('click');
                learn();
              },
            },
            t,
          ),
        ),
      );

    // ---- 1. Learn
    const learn = () => {
      card.innerHTML = '';
      const hasYahweh = /Yahweh/.test(text());
      card.append(
        header('Read it. Say it. Hide it in your heart.'),
        translationToggle(),
        h('blockquote', { class: 'verse-big' }, text()),
        ...(hasYahweh
          ? [h('p', { class: 'note' }, '“Yahweh” is God’s personal name. Many Bibles print it as “the LORD”. Either is accepted when you recite.')]
          : []),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn ghost', onclick: () => speak(`${verse.ref}. ${text()}`, { rate: 0.9 }) },
            h('span', { class: 'ico', html: ICON.speaker }),
            'Listen',
          ),
          h('button', { class: 'btn primary', onclick: () => chooseMode() }, 'Test me →'),
        ),
      );
    };

    // ---- 2. Choose mode
    const chooseMode = () => {
      stopSpeaking();
      card.innerHTML = '';
      const total = Math.max(...Object.values(best));
      const grid = h('div', { class: 'mode-grid' });
      for (const m of MODES) {
        const unsupported = m.id === 'speak' && !speechRecognitionCtor();
        grid.append(
          h(
            'button',
            {
              class: `mode ${unsupported ? 'disabled' : ''}`,
              onclick: () => {
                audio.play('click');
                if (m.id === 'build') build();
                else if (m.id === 'fill') fill();
                else if (m.id === 'speak') speakMode();
                else typeMode();
              },
            },
            h('span', { class: 'mode-icon' }, m.icon),
            h('b', null, m.title),
            h('small', null, unsupported ? 'Not supported in this browser; try Chrome or Edge.' : m.desc),
            h('span', { html: starsHtml(best[m.id]) }),
          ),
        );
      }
      card.append(
        header(total > 0 ? 'Nice! Try another mode for more stars, or continue.' : 'Choose a challenge. Pass any one to continue.'),
        grid,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => learn() }, '← Read again'),
          total > 0 || opts.practice
            ? h('button', { class: 'btn primary', onclick: finish }, total > 0 ? 'Continue ✓' : 'Close')
            : null,
        ),
      );
    };

    const resultBlock = (mode: Mode, stars: number, extra?: HTMLElement) => {
      best[mode] = Math.max(best[mode], stars);
      audio.play(stars > 0 ? (stars === 3 ? 'fanfare' : 'success') : 'error');
      return h(
        'div',
        { class: `result-block ${stars ? 'pass' : 'fail'}` },
        h('div', { class: 'big-stars', html: starsHtml(stars) }),
        h('b', null, stars === 3 ? 'Perfect! It’s in your heart.' : stars === 2 ? 'Great job!' : stars === 1 ? 'You got it, keep practising!' : 'Not quite. Try again!'),
        extra ?? null,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => (mode === 'build' ? build() : mode === 'fill' ? fill() : mode === 'speak' ? speakMode() : typeMode()) }, 'Try again'),
          h('button', { class: 'btn primary', onclick: () => chooseMode() }, 'Done'),
        ),
      );
    };

    // ---- Build it
    const build = () => {
      card.innerHTML = '';
      const chunks = chunkVerse(text());
      const tiles = shuffleNotIdentity(chunks, rng);
      let idx = 0;
      let mistakes = 0;
      const built = h('div', { class: 'built' });
      const tray = h('div', { class: 'tray' });
      const progress = h('div', { class: 'sub' }, `0 / ${chunks.length}`);
      const renderSlots = () => {
        built.innerHTML = '';
        chunks.forEach((c, i) => built.append(h('span', { class: i < idx ? 'slot done' : i === idx ? 'slot next' : 'slot' }, i < idx ? c : '…')));
      };
      tiles.forEach((t) => {
        const b = h('button', { class: 'tile' }, t);
        b.addEventListener('click', () => {
          if (t === chunks[idx]) {
            idx++;
            b.classList.add('used');
            b.disabled = true;
            audio.play('pickup', 0.6);
            renderSlots();
            progress.textContent = `${idx} / ${chunks.length}`;
            if (idx >= chunks.length) {
              setTimeout(() => {
                card.append(resultBlock('build', mistakeStars(mistakes)));
                tray.remove();
              }, 350);
            }
          } else {
            mistakes++;
            audio.play('error');
            b.classList.remove('shake');
            void b.offsetWidth;
            b.classList.add('shake');
          }
        });
        tray.append(b);
      });
      renderSlots();
      card.append(header('Build it: tap the phrases in order'), h('div', { class: 'ref-line' }, verse.ref), built, progress, tray, h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => chooseMode() }, '← Back')));
    };

    // ---- Fill the gaps
    const fill = () => {
      card.innerHTML = '';
      const puzzle = makeFillPuzzle(text(), Math.min(4, Math.max(2, Math.round(displayWords(text()).length / 6))), rng);
      let bi = 0;
      let mistakes = 0;
      const versebox = h('p', { class: 'verse-fill' });
      const opts2 = h('div', { class: 'tray' });
      const blankAt = new Map(puzzle.blanks.map((b, i) => [b.index, i]));
      const render = () => {
        versebox.innerHTML = '';
        puzzle.words.forEach((w, i) => {
          const bIdx = blankAt.get(i);
          if (bIdx === undefined) versebox.append(w, ' ');
          else if (bIdx < bi) versebox.append(h('span', { class: 'gap filled' }, w), ' ');
          else versebox.append(h('span', { class: `gap ${bIdx === bi ? 'cur' : ''}` }, '_____'), ' ');
        });
        opts2.innerHTML = '';
        if (bi >= puzzle.blanks.length) {
          card.append(resultBlock('fill', mistakeStars(mistakes)));
          opts2.remove();
          return;
        }
        for (const o of puzzle.blanks[bi].options) {
          const b = h('button', { class: 'tile' }, o);
          b.addEventListener('click', () => {
            if (o === puzzle.blanks[bi].answer) {
              audio.play('pickup', 0.6);
              bi++;
              render();
            } else {
              mistakes++;
              audio.play('error');
              b.classList.add('wrong');
              b.disabled = true;
            }
          });
          opts2.append(b);
        }
      };
      card.append(header('Fill the gaps'), h('div', { class: 'ref-line' }, verse.ref), versebox, opts2, h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => chooseMode() }, '← Back')));
      render();
    };

    // ---- Speak it
    const speakMode = () => {
      card.innerHTML = '';
      const Ctor = speechRecognitionCtor();
      if (!Ctor) {
        card.append(header('Speak it'), h('p', { class: 'note' }, 'Voice recitation needs a browser with speech recognition (Chrome, Edge or Safari). Try “Type it” instead, or say it to a friend!'), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => chooseMode() }, '← Back')));
        return;
      }
      const hint = h('p', { class: 'hint hidden' }, firstLetters(text()));
      const live = h('p', { class: 'live' }, 'Press the mic and recite the verse from memory.');
      const out = h('div');
      let rec: InstanceType<typeof Ctor> | null = null;
      let transcript = '';
      const mic = h('button', { class: 'mic-btn', 'aria-label': 'Start reciting', html: ICON.mic });
      const stopRec = () => {
        rec?.stop();
      };
      mic.addEventListener('click', () => {
        if (rec) {
          stopRec();
          return;
        }
        audio.unlock();
        transcript = '';
        out.innerHTML = '';
        const r = new Ctor();
        rec = r;
        r.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-US';
        r.interimResults = true;
        r.continuous = true;
        r.maxAlternatives = 1;
        mic.classList.add('on');
        live.textContent = 'Listening…';
        r.onresult = (e) => {
          let s = '';
          for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript + ' ';
          transcript = s.trim();
          live.textContent = transcript || 'Listening…';
          const sc = scoreRecitation(text(), transcript);
          if (sc.accuracy >= 0.98) stopRec();
        };
        r.onerror = (e) => {
          live.textContent = e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in your browser, or use “Type it”.' : `Mic error: ${e.error}. Try again.`;
        };
        r.onend = () => {
          mic.classList.remove('on');
          rec = null;
          if (!transcript) return;
          const sc = scoreRecitation(text(), transcript);
          out.innerHTML = '';
          out.append(
            resultBlock(
              'speak',
              sc.stars,
              h('div', null, h('div', { class: 'acc' }, `${Math.round(sc.accuracy * 100)}% accurate`), coloredWords(text(), sc)),
            ),
          );
        };
        try {
          r.start();
          setTimeout(() => rec === r && r.stop(), 25000);
        } catch {
          live.textContent = 'Could not start the microphone.';
          rec = null;
          mic.classList.remove('on');
        }
      });
      card.append(
        header('Speak it from memory'),
        h('div', { class: 'ref-line' }, verse.ref),
        mic,
        live,
        h('button', { class: 'btn small ghost', onclick: () => hint.classList.toggle('hidden') }, 'Show first-letter hint'),
        hint,
        out,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { stopRec(); chooseMode(); } }, '← Back')),
      );
    };

    // ---- Type it
    const typeMode = () => {
      card.innerHTML = '';
      const hint = h('p', { class: 'hint hidden' }, firstLetters(text()));
      const ta = h('textarea', { class: 'type-box', rows: 4, placeholder: 'Type the verse from memory…', autocomplete: 'off', spellcheck: 'false' });
      const out = h('div');
      const check = () => {
        const sc = scoreRecitation(text(), ta.value);
        out.innerHTML = '';
        out.append(resultBlock('type', sc.stars, h('div', null, h('div', { class: 'acc' }, `${Math.round(sc.accuracy * 100)}% accurate`), coloredWords(text(), sc))));
      };
      card.append(
        header('Type it from memory'),
        h('div', { class: 'ref-line' }, verse.ref),
        ta,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn small ghost', onclick: () => hint.classList.toggle('hidden') }, 'Hint'),
          h('button', { class: 'btn primary', onclick: check }, 'Check'),
        ),
        hint,
        out,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => chooseMode() }, '← Back')),
      );
      setTimeout(() => ta.focus(), 50);
    };

    learn();
  });
}
