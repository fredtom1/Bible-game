# Scrollgate — Walk Through Bible Time

A 3D, browser-based time-travel adventure through the Bible for **pre-teens, teens and young adults**.
Step through the gates of the *Hall of Ages*, walk inside seven of Scripture's greatest stories, help the
people you meet, answer their questions, and hide God's Word in your heart with memory-verse challenges
(build it, fill it, type it, or **say it out loud**).

> *"I have hidden your word in my heart, that I might not sin against you."* (Psalm 119:11)

Runs on phones, tablets and computers. No install, no account, no downloads: just a link.

---

## The seven ages

| # | Era | Scripture | What you do | Memory verse |
|---|-----|-----------|-------------|--------------|
| 1 | **The Flood** | Genesis 6–9 | Guide 12 animals two-by-two into a full-scale ark before the storm; watch God shut the door, the waters rise, the dove return and the rainbow appear. | Genesis 9:13 |
| 2 | **Through the Sea** | Exodus 14–15 | Night, trapped between mountains, sea and Pharaoh's chariots. Find a lost girl and her lamb, then **sprint across the sea bed between walls of water**, helping stragglers before the morning watch. | Exodus 14:14 |
| 3 | **The Walls of Jericho** | Joshua 2; 6 | A **rhythm game**: march in step with the priests and the ark for seven days, faster each lap, then SHOUT (into your microphone if you like) and watch the walls fall, all except the house with the scarlet cord. | Joshua 1:9 |
| 4 | **Five Smooth Stones** | 1 Samuel 17 | Deliver cheese to the captain, face Eliab's scorn, try on Saul's far-too-heavy armour, choose five *smooth* stones from the brook, then help David aim the sling. | 1 Samuel 16:7 |
| 5 | **The Lions' Den** | Daniel 6 | **Stealth**: sneak past guards' vision cones in Babylon's royal garden to overhear the plot; stand with Daniel at his open window; race King Darius to the den at dawn. | Daniel 6:22 |
| 6 | **Loaves and Fish** | John 6:1–14 | Find the boy with the lunch, help the disciples feed thousands from a basket that never runs out, then gather twelve baskets of leftovers. | John 6:35 |
| 7 | **The Empty Tomb** | John 20:1–18 | Race Peter and John through Jerusalem at sunrise (watch your stamina), look closely at the folded cloth, and witness Mary Magdalene's encounter in the garden. | John 11:25 |

Every era also hides **3 scroll fragments** (true facts with references), includes questions from the people
you meet, and ends with the full passage linked so players can read the real story.

## What makes it engaging

- **A living 3D world** you walk around in (keyboard/mouse, touch joystick, or gamepad), with day/night
  storytelling (storms rolling in, nights falling, dawns breaking), animals, crowds and cinematic cutscenes.
- **A different mini-game in every era**: herding, endless-runner, rhythm, aiming, stealth, delivery, racing.
- **Memory verses that actually stick**: four challenge modes, including speech recognition that scores your
  recitation word-by-word, with stars, and a **Verse Vault** for practising later.
- **Progression**: XP, ranks (Seeker → Wayfarer → Pathfinder → Scroll-bearer → Torchbearer → Timewalker),
  stars per era, collectible relics, daily streaks, and a downloadable/shareable **certificate** at the end.
- **Your avatar**: choose your skin tone, hair (including afro, puffs and braids), head covering and colours.
- **Original music and sound, generated live** (oud-like plucked strings, flutes, frame drums in ancient
  Near-Eastern modes), so there are no audio files to download.
- **Youth-leader mode** (Settings) unlocks every era for classes and youth groups.
- **Accessibility**: narrator voice option, larger text, reduce-motion, keyboard-only play, captions on
  everything.

## Faithful to Scripture

- Scripture text is quoted **verbatim** from two public-domain translations, chosen by the player:
  the **World English Bible** (modern) and the **King James Version** (classic). Verse text was extracted
  programmatically from public-domain data, not typed from memory.
- Narration lines that quote the Bible carry their reference on screen.
- **Jesus speaks only words recorded in Scripture.** The risen Jesus in the garden is shown through Mary's
  reaction and light, not as a modelled character.
- Other dialogue is **dramatised** to help players enter the story; the title screen says so, and every era
  ends with a link to read the full passage.

## Tech stack (and why)

| Tool | Why |
|------|-----|
| **TypeScript** | Type-safe game code; catches whole classes of bugs before players see them. |
| **Three.js** (WebGL) | Mature, lightweight 3D for the browser. Everything (terrain, people, animals, the ark, the walls of Jericho, water, skies) is generated procedurally in code, so there are **no 3D model or texture files** to download or license. |
| **Web Audio API** | Procedural music and sound effects, plus microphone input for the Jericho shout. |
| **Web Speech API** | Speech recognition for "Speak it" verse recitation, and optional narrator voice. |
| **Vite** | Fast dev server and an optimised production build; each era is lazy-loaded as its own chunk. |
| **Vitest** | Unit tests for verse scoring, puzzles, save data, unlocks and ranks. |
| **Vercel** | Static hosting with a global CDN: push to GitHub and it deploys. |

> **Why not C++ or Python?** C++ (via WebAssembly) would add a large build toolchain for no gain here:
> Three.js on WebGL already runs this game smoothly, and plain JavaScript loads faster on phones. Python
> isn't needed at runtime in a browser game; it was used during development only to extract the exact
> verse text from public-domain Bible data. If the project grows a backend (leaderboards, multiplayer),
> that is a good place to revisit language choices.

Production bundle: about **200 KB gzipped** in total (the main bundle plus each era loaded on demand).

## Run it locally

Requires Node.js 20.19+ (22 LTS recommended).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Handy URL options while developing:

- `/?era=flood` jumps straight into an era you have unlocked. Era ids: `flood`, `redsea`, `jericho`,
  `david`, `daniel`, `loaves`, `tomb`.
- `/?debug&era=jericho&speed=3` (developers only) opens any era and runs game time 3× faster.

## Deploy to Vercel

The repo includes `vercel.json`, so Vercel needs no extra configuration.

> The game currently lives on the branch `claude/wizardly-gates-sx8znc`, which is the repository's only
> (and therefore default) branch. Optionally rename it to `main` on GitHub (*Settings → Branches*) before
> importing; Vercel deploys the default branch to production either way.

**Option A: dashboard (easiest)**

1. Push this repository to GitHub (it already is: `fredtom1/Bible-game`).
2. Go to <https://vercel.com/new>, sign in with GitHub, and **Import** the repository.
3. Vercel detects **Vite**. Keep the defaults: build command `npm run build`, output directory `dist`.
4. Click **Deploy**. In about a minute you get a URL like `https://bible-game.vercel.app`.
5. Every push to your production branch redeploys automatically, and pull requests get preview URLs.

**Option B: command line**

```bash
npm i -g vercel
vercel          # first time: link the project, accept the detected settings
vercel --prod   # deploy to production
```

**Custom domain (optional):** in Vercel, open *Project → Settings → Domains* and add your domain
(for example `scrollgate.yourchurch.org`).

The microphone (Jericho shout, Speak it) only works over HTTPS, which Vercel provides automatically.

## Project structure

```
src/
  main.ts                 entry point (WebGL check, start the game)
  game/Game.ts            game flow: title, avatar, intro, hub, eras, results, menus
  engine/                 renderer-agnostic systems
    Audio.ts              procedural music, sfx, ambience, microphone
    Input.ts              keyboard, mouse, touch joystick & buttons, gamepad
    CameraRig.ts          third-person + cinematic camera
    tasks.ts              game-time waits/tweens for async story scripts
    noise.ts              seeded noise & maths helpers
  world/                  3D toolkit
    Stage.ts              a playable place + the story API eras are written against
    Character.ts          procedural people (poses, walk cycles, outfits)
    Animal.ts, Crowd.ts   animals with simple AI, instanced crowds of hundreds
    Terrain.ts, Sky.ts, Water.ts, Particles.ts, props.ts, geo.ts
  content/
    verses.ts             memory verses (WEB + KJV, verbatim)
    catalog.ts            era metadata and scroll-fragment facts
    hub.ts                the Hall of Ages
    eras/*.ts             one file per era: world + story script + mini-game
  logic/                  pure, unit-tested logic
    verse.ts              recitation scoring, puzzles
    progress.ts           save data, unlocks, XP & ranks, streaks
  ui/                     DOM overlay: HUD, dialogue, verse challenge, menus
tests/                    Vitest unit tests
```

### Adding a new era

1. Add its metadata and three fragments to `src/content/catalog.ts`, and its id to `ERA_ORDER` in
   `src/logic/progress.ts`.
2. Add the memory verse (verbatim, WEB + KJV) to `src/content/verses.ts`.
3. Create `src/content/eras/<id>.ts` exporting an `EraModule` (`setup` builds the world, `play` is an async
   story script), and register it in `src/content/eraTypes.ts`.

Story scripts read like a screenplay:

```ts
stage.objective('Talk to Noah by the ark', noah);
await stage.waitTalk(noah);
await stage.talk([stage.line(noah, '“Make a ship of gopher wood…”', 'Genesis 6:14')]);
await stage.cinematic(async () => { /* camera moves, narration */ });
await stage.verse('genesis-9-13');
```

## Saving & privacy

Progress is saved in the browser's local storage on the player's own device. There are no accounts, no
tracking, and nothing is sent to a server. The microphone is only used when the player chooses to recite
or shout, and audio never leaves the device (speech recognition is provided by the browser).

## Ideas for what's next

- **Online leaderboards and friends** (e.g. Supabase or Firebase), shared youth-group "classrooms".
- **Multiplayer hub** where friends meet in the Hall of Ages (WebSockets via a service such as PartyKit,
  since Vercel functions are not built for long-lived sockets).
- More eras: Creation, Joseph, Esther, Jonah, Pentecost, Paul's shipwreck.
- Yoruba, Igbo, Hausa, French and Pidgin translations of the interface; more Bible translations.
- Installable offline app (PWA service worker).

## Credits & licences

- Code: written for this project.
- Scripture: World English Bible (public domain) and King James Version (public domain).
- All 3D models, textures, music and sound effects are generated procedurally in code.
