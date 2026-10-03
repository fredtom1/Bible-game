import type { EraId } from '../logic/progress';

export interface Fragment {
  id: string;
  title: string;
  text: string;
  ref: string;
}

export interface EraMeta {
  id: EraId;
  title: string;
  age: string;
  ref: string;
  passage: string;
  summary: string;
  mission: string;
  verseId: string;
  accent: string;
  icon: string;
  fragments: Fragment[];
}

export const ERAS: EraMeta[] = [
  {
    id: 'flood',
    title: 'The Flood',
    age: 'Age of Beginnings',
    ref: 'Genesis 6–9',
    passage: 'Genesis 6-9',
    summary: 'The world has turned violent, but Noah walks with God. The ship is finished, the sky is darkening, and the animals are coming two by two.',
    mission: 'Help Noah’s family guide the animals into the ark before the rain begins.',
    verseId: 'genesis-9-13',
    accent: '#5fa8d3',
    icon: '🌈',
    fragments: [
      { id: 'flood-size', title: 'A Really Big Boat', text: 'God told Noah to build the ship 300 cubits long, 50 wide and 30 high: about 137 × 23 × 14 m (450 × 75 × 45 ft). Longer than a football pitch!', ref: 'Genesis 6:15' },
      { id: 'flood-age', title: 'Noah’s Age', text: 'Noah was 600 years old when the flood came on the earth.', ref: 'Genesis 7:6' },
      { id: 'flood-birds', title: 'Raven and Dove', text: 'Before the dove, Noah sent out a raven that flew back and forth until the waters dried up. The dove later came back with a freshly plucked olive leaf.', ref: 'Genesis 8:7–11' },
    ],
  },
  {
    id: 'redsea',
    title: 'Through the Sea',
    age: 'Age of Exodus',
    ref: 'Exodus 14–15',
    passage: 'Exodus 14-15',
    summary: 'Israel is finally free from Egypt, until Pharaoh’s chariots trap them against the sea. It is night. The people are terrified.',
    mission: 'Find a lost child, then cross the sea on dry ground before morning.',
    verseId: 'exodus-14-14',
    accent: '#e0703a',
    icon: '🌊',
    fragments: [
      { id: 'sea-pillar', title: 'The Pillar Moves', text: 'The angel of God and the pillar of cloud moved from in front of Israel to behind them, standing between Israel and Egypt all night.', ref: 'Exodus 14:19–20' },
      { id: 'sea-wind', title: 'Wind All Night', text: 'God drove the sea back with a strong east wind that blew all night, and the sea became dry ground.', ref: 'Exodus 14:21' },
      { id: 'sea-wheels', title: 'Wheels Off!', text: 'God made the Egyptians’ chariot wheels come off so they drove with difficulty. They cried out, “Let’s flee… for Yahweh fights for them!”', ref: 'Exodus 14:25' },
    ],
  },
  {
    id: 'jericho',
    title: 'The Walls of Jericho',
    age: 'Age of Conquest',
    ref: 'Joshua 2; 6',
    passage: 'Joshua 6',
    summary: 'Jericho is shut up tight. Joshua has strange orders from God: no battering rams, no ladders. Just march, stay silent, and wait for the trumpet.',
    mission: 'March in step around Jericho for seven days, then SHOUT!',
    verseId: 'joshua-1-9',
    accent: '#d9a441',
    icon: '📯',
    fragments: [
      { id: 'jer-palms', title: 'City of Palm Trees', text: 'The Bible calls Jericho “the city of palm trees”. It is one of the oldest cities in the world.', ref: 'Deuteronomy 34:3' },
      { id: 'jer-silent', title: 'The Silent March', text: 'For six days the people marched without a word. Joshua told them not to shout until the day he said, “Shout!”', ref: 'Joshua 6:10' },
      { id: 'jer-cord', title: 'The Scarlet Cord', text: 'Rahab hid two spies. They told her to tie a scarlet cord in her window so her family would be saved, and Joshua kept that promise.', ref: 'Joshua 2:18; 6:25' },
    ],
  },
  {
    id: 'david',
    title: 'Five Smooth Stones',
    age: 'Age of Kings',
    ref: '1 Samuel 17',
    passage: '1 Samuel 17',
    summary: 'For forty days a giant has mocked Israel’s army. Everyone is afraid. Then a shepherd boy arrives with bread and cheese for his brothers.',
    mission: 'Deliver supplies, choose five smooth stones, and stand with David.',
    verseId: '1-samuel-16-7',
    accent: '#7fb24a',
    icon: '🪨',
    fragments: [
      { id: 'dav-height', title: 'How Tall?', text: 'Goliath stood “six cubits and a span”: about 2.9 m (9 ft 9 in) tall.', ref: '1 Samuel 17:4' },
      { id: 'dav-armor', title: 'Heavy Armour', text: 'Goliath’s coat of mail weighed 5,000 shekels of bronze, roughly 57 kg (125 lb).', ref: '1 Samuel 17:5' },
      { id: 'dav-shepherd', title: 'Shepherd Training', text: 'While guarding his father’s sheep, David had rescued lambs from both a lion and a bear.', ref: '1 Samuel 17:34–36' },
    ],
  },
  {
    id: 'daniel',
    title: 'The Lions’ Den',
    age: 'Age of Exile',
    ref: 'Daniel 6',
    passage: 'Daniel 6',
    summary: 'In Babylon, Daniel serves King Darius so well that jealous officials plot against him. Their only hope: a law against praying.',
    mission: 'Uncover the plot, stand by Daniel, and race to the den at dawn.',
    verseId: 'daniel-6-22',
    accent: '#3f63c9',
    icon: '🦁',
    fragments: [
      { id: 'dan-gov', title: 'A Huge Kingdom', text: 'King Darius set 120 local governors over his kingdom, with three presidents over them, and Daniel was one of the three.', ref: 'Daniel 6:1–2' },
      { id: 'dan-window', title: 'Facing Jerusalem', text: 'Daniel’s windows opened toward Jerusalem, and he prayed three times a day, just as he always had.', ref: 'Daniel 6:10' },
      { id: 'dan-seal', title: 'Sealed Tight', text: 'The stone over the den was sealed with the king’s own signet ring so that nothing could be changed concerning Daniel.', ref: 'Daniel 6:17' },
    ],
  },
  {
    id: 'loaves',
    title: 'Loaves and Fish',
    age: 'Age of the Messiah',
    ref: 'John 6:1–14',
    passage: 'John 6:1-14',
    summary: 'A huge crowd has followed Jesus to a grassy hillside by the Sea of Galilee. It’s getting late and everyone is hungry. Nobody has enough.',
    mission: 'Find the boy with the lunch, help feed thousands, and gather the leftovers.',
    verseId: 'john-6-35',
    accent: '#58b38a',
    icon: '🍞',
    fragments: [
      { id: 'loaf-four', title: 'In All Four Gospels', text: 'Feeding the 5,000 is the only miracle of Jesus, apart from his resurrection, told in all four Gospels.', ref: 'Matthew 14; Mark 6; Luke 9; John 6' },
      { id: 'loaf-crowd', title: 'More Than 5,000', text: 'About 5,000 men ate, besides women and children. They sat on the green grass in groups of hundreds and fifties.', ref: 'Matthew 14:21; Mark 6:39–40' },
      { id: 'loaf-barley', title: 'A Boy’s Lunch', text: 'The boy’s five loaves were barley bread, simple everyday food, and his two fish were small ones.', ref: 'John 6:9' },
    ],
  },
  {
    id: 'tomb',
    title: 'The Empty Tomb',
    age: 'Age of the Messiah',
    ref: 'John 20:1–18',
    passage: 'John 20:1-18',
    summary: 'Jesus was crucified and buried. His friends are hiding and heartbroken. Early on Sunday, before sunrise, Mary Magdalene runs in with impossible news.',
    mission: 'Race Peter and John to the tomb and discover what happened.',
    verseId: 'john-11-25',
    accent: '#f1c96b',
    icon: '✨',
    fragments: [
      { id: 'tomb-first', title: 'The First Day', text: 'Mary Magdalene came to the tomb early on the first day of the week, while it was still dark.', ref: 'John 20:1' },
      { id: 'tomb-cloth', title: 'The Folded Cloth', text: 'The cloth that had been on Jesus’ head wasn’t lying with the linen cloths. It was rolled up in a place by itself.', ref: 'John 20:7' },
      { id: 'tomb-mary', title: 'First Witness', text: 'Mary Magdalene was the first to see the risen Jesus, and the first to go and tell the disciples that she had seen the Lord.', ref: 'John 20:14–18' },
    ],
  },
];

export const ERA_BY_ID = Object.fromEntries(ERAS.map((e) => [e.id, e])) as Record<EraId, EraMeta>;

export function readLink(passage: string, translation: string): string {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(passage)}&version=${translation}`;
}
