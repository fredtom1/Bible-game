/**
 * Memory verses. Text is copied verbatim from two public-domain translations:
 *  - WEB: World English Bible (public domain)
 *  - KJV: King James Version, 1769 text (public domain)
 * Where only part of a verse is memorised, `ref` still names the verse and the
 * text is the exact excerpt.
 */
export type Translation = 'WEB' | 'KJV';

export interface Verse {
  id: string;
  ref: string;
  text: Record<Translation, string>;
}

export const VERSES: Record<string, Verse> = {
  'psalm-119-11': {
    id: 'psalm-119-11',
    ref: 'Psalm 119:11',
    text: {
      WEB: 'I have hidden your word in my heart, that I might not sin against you.',
      KJV: 'Thy word have I hid in mine heart, that I might not sin against thee.',
    },
  },
  'genesis-9-13': {
    id: 'genesis-9-13',
    ref: 'Genesis 9:13',
    text: {
      WEB: 'I set my rainbow in the cloud, and it will be a sign of a covenant between me and the earth.',
      KJV: 'I do set my bow in the cloud, and it shall be for a token of a covenant between me and the earth.',
    },
  },
  'exodus-14-14': {
    id: 'exodus-14-14',
    ref: 'Exodus 14:14',
    text: {
      WEB: 'Yahweh will fight for you, and you shall be still.',
      KJV: 'The LORD shall fight for you, and ye shall hold your peace.',
    },
  },
  'joshua-1-9': {
    id: 'joshua-1-9',
    ref: 'Joshua 1:9',
    text: {
      WEB: 'Haven’t I commanded you? Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.',
      KJV: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
    },
  },
  '1-samuel-16-7': {
    id: '1-samuel-16-7',
    ref: '1 Samuel 16:7',
    text: {
      WEB: 'For man looks at the outward appearance, but Yahweh looks at the heart.',
      KJV: 'For man looketh on the outward appearance, but the LORD looketh on the heart.',
    },
  },
  'daniel-6-22': {
    id: 'daniel-6-22',
    ref: 'Daniel 6:22',
    text: {
      WEB: 'My God has sent his angel, and has shut the lions’ mouths, and they have not hurt me.',
      KJV: "My God hath sent his angel, and hath shut the lions' mouths, that they have not hurt me.",
    },
  },
  'john-6-35': {
    id: 'john-6-35',
    ref: 'John 6:35',
    text: {
      WEB: 'I am the bread of life. Whoever comes to me will not be hungry, and whoever believes in me will never be thirsty.',
      KJV: 'I am the bread of life: he that cometh to me shall never hunger; and he that believeth on me shall never thirst.',
    },
  },
  'john-11-25': {
    id: 'john-11-25',
    ref: 'John 11:25',
    text: {
      WEB: 'I am the resurrection and the life. He who believes in me will still live, even if he dies.',
      KJV: 'I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live.',
    },
  },
};

export const TRANSLATION_NAMES: Record<Translation, string> = {
  WEB: 'World English Bible (modern)',
  KJV: 'King James Version (classic)',
};

export function verseText(id: string, t: Translation): string {
  const v = VERSES[id];
  if (!v) throw new Error(`Unknown verse ${id}`);
  return v.text[t];
}
