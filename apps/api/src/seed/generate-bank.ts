/**
 * Dev tool: deterministically generates the committed seed question bank.
 *
 *   pnpm --filter api exec ts-node src/seed/generate-bank.ts
 *
 * Emits apps/api/src/seed/data/questions.<category-key>.json (12 files).
 * The committed JSON is the source of truth — this generator only exists to
 * (re)produce it. Every emitted item is validated against createQuestionSchema
 * (with a placeholder categoryId; the seed CLI resolves categoryKey at load).
 * `media` is not part of the zod schema (candidate input never carries it);
 * the mongoose Question schema enforces its shape at insert time.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import seedrandom from 'seedrandom';
import { createQuestionSchema } from '@lms/shared';

type Rng = seedrandom.PRNG;

interface SeedQuestion {
  seedId: string;
  categoryKey: string;
  type: 'mcq' | 'likert';
  difficulty: number;
  prompt: string;
  options?: string[];
  correct?: number[];
  traitMapping?: { dimension: string; direction: 1 | -1 };
  explanation?: string;
  tags: string[];
  media?: { kind: 'svg'; value: string }[];
}

type Item = Omit<SeedQuestion, 'seedId' | 'categoryKey'>;

// ---------------------------------------------------------------- helpers

const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Unique numeric distractors near the answer (never equal to it; non-negative when the answer is). */
function numericDistractors(rng: Rng, answer: number, count: number): number[] {
  const seen = new Set<number>([answer]);
  const out: number[] = [];
  let attempt = 0;
  while (out.length < count) {
    attempt++;
    const spread = Math.max(2, Math.ceil(Math.abs(answer) * 0.3)) + Math.floor(attempt / 10);
    let d = answer + int(rng, 1, spread) * (rng() < 0.5 ? -1 : 1);
    if (answer >= 0 && d < 0) d = answer + int(rng, 1, spread);
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

interface McqInput {
  prompt: string;
  correctValue: string;
  distractors: string[];
  difficulty: number;
  explanation: string;
  tags: string[];
  media?: { kind: 'svg'; value: string }[];
}

function mcq(rng: Rng, q: McqInput): Item {
  const values = [q.correctValue, ...q.distractors];
  if (new Set(values).size !== values.length) {
    throw new Error(`duplicate options for prompt: ${q.prompt} → ${values.join(' | ')}`);
  }
  const options = shuffle(rng, values);
  return {
    type: 'mcq',
    difficulty: q.difficulty,
    prompt: q.prompt,
    options,
    correct: [options.indexOf(q.correctValue)],
    explanation: q.explanation,
    tags: q.tags,
    ...(q.media ? { media: q.media } : {}),
  };
}

function numericMcq(
  rng: Rng,
  args: {
    prompt: string;
    answer: number;
    difficulty: number;
    explanation: string;
    tags: string[];
    media?: { kind: 'svg'; value: string }[];
  },
): Item {
  return mcq(rng, {
    prompt: args.prompt,
    correctValue: String(args.answer),
    distractors: numericDistractors(rng, args.answer, 3).map(String),
    difficulty: args.difficulty,
    explanation: args.explanation,
    tags: args.tags,
    media: args.media,
  });
}

function numericMcqFromPool(
  rng: Rng,
  args: {
    prompt: string;
    answer: number;
    pool: number[];
    difficulty: number;
    explanation: string;
    tags: string[];
  },
): Item {
  return mcq(rng, {
    prompt: args.prompt,
    correctValue: String(args.answer),
    distractors: shuffle(rng, args.pool).slice(0, 3).map(String),
    difficulty: args.difficulty,
    explanation: args.explanation,
    tags: args.tags,
  });
}

const difficultyCycle = (i: number): number => (i % 5) + 1;

// ------------------------------------------------- reusable template families

function arithmeticSeries(rng: Rng, i: number): Item {
  const start = int(rng, 2, 15);
  const diff = int(rng, 2, 9);
  const terms = [0, 1, 2, 3].map((k) => start + k * diff);
  const answer = start + 4 * diff;
  return numericMcq(rng, {
    prompt: `What is the next number in the series: ${terms.join(', ')}, ... ?`,
    answer,
    difficulty: difficultyCycle(i),
    explanation: `Each term increases by ${diff}, so the next term is ${terms[3]} + ${diff} = ${answer}.`,
    tags: ['series'],
  });
}

function percentageOf(rng: Rng, i: number): Item {
  const p = pick(rng, [5, 10, 15, 20, 25, 50] as const);
  const base = 20 * int(rng, 2, 30);
  const answer = (p * base) / 100;
  return numericMcq(rng, {
    prompt: `What is ${p}% of ${base}?`,
    answer,
    difficulty: difficultyCycle(i),
    explanation: `${p}% of ${base} = ${base} × ${p}/100 = ${answer}.`,
    tags: ['percentage'],
  });
}

function doublingTrace(rng: Rng, i: number): Item {
  const n = int(rng, 3, 8);
  const answer = 2 ** n;
  return numericMcq(rng, {
    prompt: `Trace this pseudocode:\n\nx = 1\nrepeat ${n} times:\n    x = x * 2\n\nWhat is the final value of x?`,
    answer,
    difficulty: difficultyCycle(i),
    explanation: `x doubles ${n} times: 2^${n} = ${answer}.`,
    tags: ['pseudocode', 'doubling'],
  });
}

const NAMES = ['Ada', 'Bruno', 'Chidi', 'Dara', 'Emeka', 'Femi', 'Gina', 'Halima', 'Ivan', 'Jomo'] as const;
const ORDERING_RELATIONS = [
  { comparative: 'taller', superlativeMost: 'tallest', superlativeLeast: 'shortest' },
  { comparative: 'older', superlativeMost: 'oldest', superlativeLeast: 'youngest' },
  { comparative: 'faster', superlativeMost: 'fastest', superlativeLeast: 'slowest' },
] as const;

function orderingPuzzle(rng: Rng, i: number): Item {
  const [a, b, c] = shuffle(rng, NAMES).slice(0, 3);
  const rel = pick(rng, ORDERING_RELATIONS);
  const askLeast = rng() < 0.5;
  const answer = askLeast ? c : a;
  const others = [a, b, c].filter((n) => n !== answer);
  return mcq(rng, {
    prompt: `${a} is ${rel.comparative} than ${b}. ${b} is ${rel.comparative} than ${c}. Who is the ${askLeast ? rel.superlativeLeast : rel.superlativeMost}?`,
    correctValue: answer,
    distractors: [...others, 'Cannot be determined'],
    difficulty: difficultyCycle(i),
    explanation: `Chaining the comparisons: ${a} > ${b} > ${c}, so ${answer} is the ${askLeast ? rel.superlativeLeast : rel.superlativeMost}.`,
    tags: ['ordering'],
  });
}

const CONDITIONALS = [
  ['it rains', 'the ground gets wet'],
  ['the alarm rings', 'everyone leaves the building'],
  ['the switch is on', 'the lamp is lit'],
  ['the store is open', 'the sign says OPEN'],
  ['the battery is charged', 'the phone turns on'],
  ['the bridge is closed', 'traffic is diverted'],
] as const;

// ------------------------------------------------------------- categories

function numericalReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 9; i++) items.push(arithmeticSeries(rng, i));
  for (let i = 9; i < 18; i++) items.push(percentageOf(rng, i));
  for (let i = 18; i < 26; i++) {
    const a = int(rng, 1, 4);
    const b = a + int(rng, 1, 5); // always distinct from a
    const k = int(rng, 2, 6);
    const answer = k * b;
    items.push(
      numericMcq(rng, {
        prompt: `A recipe uses ${a} cups of flour for every ${b} cups of sugar. If you use ${k * a} cups of flour, how many cups of sugar do you need?`,
        answer,
        difficulty: difficultyCycle(i),
        explanation: `The flour is scaled by ${k} (${a} → ${k * a}), so the sugar scales to ${b} × ${k} = ${answer}.`,
        tags: ['ratio'],
      }),
    );
  }
  return items;
}

function quantitativeReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 9; i++) {
    const r = int(rng, 4, 12);
    const h = int(rng, 3, 9);
    items.push(
      numericMcq(rng, {
        prompt: `A machine produces ${r} items per hour. How many items does it produce in ${h} hours?`,
        answer: r * h,
        difficulty: difficultyCycle(i),
        explanation: `${r} items/hour × ${h} hours = ${r * h} items.`,
        tags: ['rate'],
      }),
    );
  }
  for (let i = 9; i < 18; i++) {
    // four proper fractions with distinct values; ask for the largest
    const fractions: Array<{ n: number; d: number; v: number }> = [];
    const seen = new Set<number>();
    while (fractions.length < 4) {
      const n = int(rng, 1, 9);
      const d = int(rng, n + 1, 12);
      const v = n / d;
      const key = Math.round(v * 100000);
      if (!seen.has(key)) {
        seen.add(key);
        fractions.push({ n, d, v });
      }
    }
    const largest = fractions.reduce((best, f) => (f.v > best.v ? f : best));
    const fmt = (f: { n: number; d: number }) => `${f.n}/${f.d}`;
    items.push(
      mcq(rng, {
        prompt: `Which of these fractions is the largest?`,
        correctValue: fmt(largest),
        distractors: fractions.filter((f) => f !== largest).map(fmt),
        difficulty: difficultyCycle(i),
        explanation: `${fmt(largest)} ≈ ${largest.v.toFixed(3)}, greater than each alternative.`,
        tags: ['fractions', 'comparison'],
      }),
    );
  }
  for (let i = 18; i < 26; i++) {
    const unit = int(rng, 2, 6);
    const n = int(rng, 3, 9);
    const m = int(rng, 2, 12);
    items.push(
      numericMcq(rng, {
        prompt: `If ${n} pens cost $${n * unit}, how much do ${m} pens cost (in dollars)?`,
        answer: m * unit,
        difficulty: difficultyCycle(i),
        explanation: `Each pen costs $${n * unit} ÷ ${n} = $${unit}, so ${m} pens cost $${m * unit}.`,
        tags: ['unit-price', 'proportion'],
      }),
    );
  }
  return items;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function dotPanelSvg(counts: number[]): string {
  const panelW = 70;
  const panels = counts
    .map((c, p) => {
      const dots = Array.from({ length: c })
        .map((_, k) => {
          const col = k % 3;
          const row = Math.floor(k / 3);
          return `<circle cx="${p * panelW + 15 + col * 18}" cy="${15 + row * 18}" r="6" fill="#333"/>`;
        })
        .join('');
      return `<rect x="${p * panelW + 2}" y="2" width="${panelW - 8}" height="66" fill="none" stroke="#999"/>${dots}`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${counts.length * panelW}" height="70" viewBox="0 0 ${counts.length * panelW} 70">${panels}</svg>`;
}

function patternRecognition(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) {
      const k = int(rng, 1, 6);
      const terms = [k, k + 1, k + 2, k + 3].map((x) => x * x);
      const answer = (k + 4) * (k + 4);
      items.push(
        numericMcq(rng, {
          prompt: `What is the next number in the sequence: ${terms.join(', ')}, ... ?`,
          answer,
          difficulty: difficultyCycle(i),
          explanation: `These are consecutive squares ${k}²…${k + 3}²; next is ${k + 4}² = ${answer}.`,
          tags: ['sequence', 'squares'],
        }),
      );
    } else {
      const a = int(rng, 2, 5);
      const terms = [a, a * 2, a * 4, a * 8];
      items.push(
        numericMcq(rng, {
          prompt: `What is the next number in the sequence: ${terms.join(', ')}, ... ?`,
          answer: a * 16,
          difficulty: difficultyCycle(i),
          explanation: `Each term doubles the previous one: ${a * 8} × 2 = ${a * 16}.`,
          tags: ['sequence', 'geometric'],
        }),
      );
    }
  }
  for (let i = 9; i < 18; i++) {
    const start = int(rng, 0, 9);
    const step = int(rng, 2, 4);
    const seq = [0, 1, 2, 3].map((k) => LETTERS[start + k * step]);
    const answer = LETTERS[start + 4 * step];
    const pool = LETTERS.split('').filter((l) => l !== answer && !seq.includes(l));
    items.push(
      mcq(rng, {
        prompt: `Which letter comes next: ${seq.join(', ')}, ... ?`,
        correctValue: answer,
        distractors: shuffle(rng, pool).slice(0, 3),
        difficulty: difficultyCycle(i),
        explanation: `The letters advance ${step} alphabet positions each time; ${seq[3]} + ${step} = ${answer}.`,
        tags: ['letter-sequence'],
      }),
    );
  }
  for (let i = 18; i < 26; i++) {
    const c = int(rng, 1, 3);
    const d = int(rng, 1, 2);
    const counts = [c, c + d, c + 2 * d];
    const answer = c + 3 * d;
    items.push(
      numericMcq(rng, {
        prompt: `The panels show a growing pattern of dots. How many dots belong in the next panel?`,
        answer,
        difficulty: difficultyCycle(i),
        explanation: `The dot count increases by ${d} per panel: ${counts.join(', ')}, then ${answer}.`,
        tags: ['matrix', 'visual'],
        media: [{ kind: 'svg', value: dotPanelSvg(counts) }],
      }),
    );
  }
  return items;
}

function abstractReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 9; i++) {
    const theta = pick(rng, [45, 90, 135, 180] as const);
    const steps = int(rng, 3, 5);
    const answer = (theta * steps) % 360;
    items.push(
      numericMcq(rng, {
        prompt: `A pointer starts at 0° and rotates ${theta}° clockwise at each step. After ${steps} steps, what is its orientation in degrees (0–359)?`,
        answer,
        difficulty: difficultyCycle(i),
        explanation: `${theta}° × ${steps} = ${theta * steps}°, and ${theta * steps} mod 360 = ${answer}°.`,
        tags: ['rotation'],
      }),
    );
  }
  const symbolPairs = [
    ['▲', '●'],
    ['■', '◆'],
    ['★', '✚'],
  ] as const;
  for (let i = 9; i < 18; i++) {
    const [s1, s2] = symbolPairs[i % symbolPairs.length];
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    items.push(
      numericMcq(rng, {
        prompt: `If ${s1} = ${a} and ${s2} = ${b}, what is the value of ${s1} + ${s2} + ${s2}?`,
        answer: a + 2 * b,
        difficulty: difficultyCycle(i),
        explanation: `${a} + ${b} + ${b} = ${a + 2 * b}.`,
        tags: ['symbols'],
      }),
    );
  }
  for (let i = 18; i < 26; i++) {
    const evens = new Set<number>();
    while (evens.size < 3) evens.add(int(rng, 1, 20) * 2);
    const odd = int(rng, 1, 20) * 2 + 1;
    items.push(
      mcq(rng, {
        prompt: `Which number does not belong in this group?`,
        correctValue: String(odd),
        distractors: [...evens].map(String),
        difficulty: difficultyCycle(i),
        explanation: `${odd} is the only odd number; the others are even.`,
        tags: ['odd-one-out'],
      }),
    );
  }
  return items;
}

function spatialReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  const DIRECTIONS = ['North', 'East', 'South', 'West'] as const;
  for (let i = 0; i < 9; i++) {
    const turns = int(rng, 1, 7);
    const answer = DIRECTIONS[turns % 4];
    items.push(
      mcq(rng, {
        prompt: `You are facing North. You turn 90° clockwise ${turns} time${turns > 1 ? 's' : ''}. Which direction are you facing now?`,
        correctValue: answer,
        distractors: DIRECTIONS.filter((d) => d !== answer),
        difficulty: difficultyCycle(i),
        explanation: `${turns} quarter-turns clockwise is ${turns % 4} net turn(s) from North → ${answer}.`,
        tags: ['rotation', 'compass'],
      }),
    );
  }
  for (let i = 9; i < 18; i++) {
    const top = int(rng, 1, 6);
    const answer = 7 - top;
    items.push(
      numericMcqFromPool(rng, {
        prompt: `On a standard die, opposite faces add up to 7. If the top face shows ${top}, what does the bottom face show?`,
        answer,
        pool: [1, 2, 3, 4, 5, 6].filter((n) => n !== answer),
        difficulty: difficultyCycle(i),
        explanation: `Opposite faces sum to 7, so the bottom shows 7 − ${top} = ${answer}.`,
        tags: ['dice', 'visualization'],
      }),
    );
  }
  for (let i = 18; i < 26; i++) {
    const r = int(rng, 1, 9);
    let u = int(rng, 1, 9);
    if (r === u) u = (u % 9) + 1;
    items.push(
      mcq(rng, {
        prompt: `Starting at (0, 0) on a grid, you move ${r} squares right and ${u} squares up. What are your final coordinates (x, y)?`,
        correctValue: `(${r}, ${u})`,
        distractors: [`(${u}, ${r})`, `(${r + 1}, ${u})`, `(${r}, ${u + 1})`],
        difficulty: difficultyCycle(i),
        explanation: `Moving right increases x to ${r}; moving up increases y to ${u} → (${r}, ${u}).`,
        tags: ['grid', 'coordinates'],
      }),
    );
  }
  return items;
}

const NONSENSE_TRIPLES = [
  ['bloops', 'razzies', 'lazzies'],
  ['florps', 'mimsies', 'tazzles'],
  ['greeps', 'snorfs', 'quibbles'],
  ['zinters', 'plooks', 'vantles'],
  ['crullets', 'dromps', 'febbles'],
  ['harkles', 'jibbits', 'kloons'],
  ['morfits', 'nubbles', 'oppets'],
  ['pramble', 'quaffles', 'rimplets'],
  ['sploots', 'trundles', 'umpets'],
  ['wexels', 'yarbles', 'zoodles'],
] as const;

function logicalReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 10; i++) {
    const [a, b, c] = NONSENSE_TRIPLES[i];
    items.push(
      mcq(rng, {
        prompt: `All ${a} are ${b}. All ${b} are ${c}. Which statement must be true?`,
        correctValue: `All ${a} are ${c}`,
        distractors: [`All ${c} are ${a}`, `No ${a} are ${c}`, `Some ${b} are not ${a}`],
        difficulty: difficultyCycle(i),
        explanation: `Two universal statements chain: all ${a} are ${b}, and all ${b} are ${c}, so all ${a} are ${c}.`,
        tags: ['syllogism'],
      }),
    );
  }
  for (let i = 10; i < 20; i++) items.push(orderingPuzzle(rng, i));
  for (let i = 20; i < 26; i++) {
    const [cond, cons] = CONDITIONALS[i - 20];
    items.push(
      mcq(rng, {
        prompt: `If ${cond}, then ${cons}. It is NOT the case that ${cons}. What must be true?`,
        correctValue: `It is not the case that ${cond}`,
        distractors: [
          `It is the case that ${cond}`,
          `It is the case that ${cons}`,
          `Nothing can be concluded`,
        ],
        difficulty: difficultyCycle(i),
        explanation: `Modus tollens: when the consequence is false, the condition must be false.`,
        tags: ['conditional', 'modus-tollens'],
      }),
    );
  }
  return items;
}

const ANALOGIES: Array<[string, string, string, string, string[]]> = [
  ['Hot', 'Cold', 'Up', 'Down', ['Over', 'Sky', 'Rise']],
  ['Kitten', 'Cat', 'Puppy', 'Dog', ['Wolf', 'Bone', 'Kennel']],
  ['Author', 'Book', 'Composer', 'Symphony', ['Piano', 'Orchestra', 'Baton']],
  ['Fish', 'Water', 'Bird', 'Air', ['Nest', 'Feather', 'Worm']],
  ['Head', 'Hat', 'Foot', 'Shoe', ['Ankle', 'Floor', 'Walk']],
  ['Doctor', 'Hospital', 'Teacher', 'School', ['Lesson', 'Student', 'Book']],
  ['Bee', 'Hive', 'Bear', 'Den', ['Honey', 'Cub', 'Zoo']],
  ['Pen', 'Write', 'Knife', 'Cut', ['Sharpen', 'Fork', 'Steel']],
  ['Caterpillar', 'Butterfly', 'Tadpole', 'Frog', ['Fish', 'Pond', 'Snail']],
  ['Second', 'Minute', 'Minute', 'Hour', ['Day', 'Clock', 'Time']],
];

const SYNONYMS: Array<[string, string, string[]]> = [
  ['happy', 'joyful', ['gloomy', 'tired', 'careful']],
  ['big', 'enormous', ['tiny', 'narrow', 'heavy']],
  ['fast', 'rapid', ['slow', 'late', 'calm']],
  ['brave', 'courageous', ['timid', 'cautious', 'weak']],
  ['smart', 'intelligent', ['dull', 'lazy', 'loud']],
  ['quiet', 'silent', ['noisy', 'busy', 'bright']],
  ['angry', 'furious', ['pleased', 'calm', 'patient']],
  ['tired', 'weary', ['alert', 'rested', 'eager']],
];

const ANTONYMS: Array<[string, string, string[]]> = [
  ['expand', 'contract', ['grow', 'widen', 'stretch']],
  ['victory', 'defeat', ['triumph', 'success', 'win']],
  ['scarce', 'abundant', ['rare', 'limited', 'sparse']],
  ['ancient', 'modern', ['old', 'antique', 'historic']],
  ['increase', 'decrease', ['expand', 'multiply', 'rise']],
  ['transparent', 'opaque', ['clear', 'glassy', 'visible']],
  ['generous', 'stingy', ['kind', 'giving', 'charitable']],
  ['accept', 'reject', ['receive', 'approve', 'welcome']],
];

function verbalReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  ANALOGIES.forEach(([a, b, c, answer, distractors], i) => {
    items.push(
      mcq(rng, {
        prompt: `${a} is to ${b} as ${c} is to ... ?`,
        correctValue: answer,
        distractors,
        difficulty: difficultyCycle(i),
        explanation: `${a} relates to ${b} the same way ${c} relates to ${answer}.`,
        tags: ['analogy'],
      }),
    );
  });
  SYNONYMS.forEach(([word, answer, distractors], i) => {
    items.push(
      mcq(rng, {
        prompt: `Which word is closest in meaning to "${word}"?`,
        correctValue: answer,
        distractors,
        difficulty: difficultyCycle(i + 10),
        explanation: `"${answer}" is a synonym of "${word}".`,
        tags: ['synonym'],
      }),
    );
  });
  ANTONYMS.forEach(([word, answer, distractors], i) => {
    items.push(
      mcq(rng, {
        prompt: `Which word is most nearly the OPPOSITE of "${word}"?`,
        correctValue: answer,
        distractors,
        difficulty: difficultyCycle(i + 18),
        explanation: `"${answer}" is an antonym of "${word}".`,
        tags: ['antonym'],
      }),
    );
  });
  return items;
}

function computationalThinking(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 9; i++) {
    const a = int(rng, 0, 10);
    const n = int(rng, 3, 7);
    const gauss = (n * (n + 1)) / 2;
    items.push(
      numericMcq(rng, {
        prompt: `Trace this pseudocode:\n\nx = ${a}\nfor i = 1 to ${n}:\n    x = x + i\n\nWhat is the final value of x?`,
        answer: a + gauss,
        difficulty: difficultyCycle(i),
        explanation: `x accumulates 1+2+…+${n} = ${gauss}, so x = ${a} + ${gauss} = ${a + gauss}.`,
        tags: ['pseudocode', 'loop-trace'],
      }),
    );
  }
  for (let i = 9; i < 18; i++) items.push(doublingTrace(rng, i));
  for (let i = 18; i < 26; i++) {
    const b = int(rng, 3, 9);
    const a = int(rng, 10, 97);
    const answer = a % b;
    items.push(
      numericMcq(rng, {
        prompt: `Trace this pseudocode:\n\nr = ${a} mod ${b}\n\nWhat is the value of r (the remainder when ${a} is divided by ${b})?`,
        answer,
        difficulty: difficultyCycle(i),
        explanation: `${a} = ${Math.floor(a / b)} × ${b} + ${answer}, so the remainder is ${answer}.`,
        tags: ['pseudocode', 'modulo'],
      }),
    );
  }
  return items;
}

function aptitude(rng: Rng): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 7; i++) items.push(arithmeticSeries(rng, i));
  for (let i = 7; i < 14; i++) items.push(percentageOf(rng, i));
  for (let i = 14; i < 20; i++) items.push(orderingPuzzle(rng, i));
  for (let i = 20; i < 26; i++) items.push(doublingTrace(rng, i));
  return items;
}

function cognitiveAbility(rng: Rng): Item[] {
  const items: Item[] = [];
  const alphabet = 'aeiorstn';
  for (let i = 0; i < 9; i++) {
    const len = int(rng, 8, 12);
    let s = '';
    for (let k = 0; k < len; k++) s += alphabet[int(rng, 0, alphabet.length - 1)];
    const target = s[int(rng, 0, s.length - 1)];
    const answer = s.split('').filter((ch) => ch === target).length;
    items.push(
      numericMcq(rng, {
        prompt: `How many times does the letter "${target}" appear in the string "${s}"?`,
        answer,
        difficulty: difficultyCycle(i),
        explanation: `Scanning "${s}" letter by letter, "${target}" appears ${answer} time(s).`,
        tags: ['attention'],
      }),
    );
  }
  for (let i = 9; i < 18; i++) {
    const digits =
      String(int(rng, 1, 9)) +
      String(int(rng, 0, 9)) +
      String(int(rng, 0, 9)) +
      String(int(rng, 0, 9)) +
      String(int(rng, 0, 9));
    const pos = int(rng, 2, 5);
    const ordinal = ['', '', '2nd', '3rd', '4th', '5th'][pos];
    const answer = Number(digits[pos - 1]);
    items.push(
      numericMcqFromPool(rng, {
        prompt: `What is the ${ordinal} digit (from the left) of the number ${digits}?`,
        answer,
        pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== answer),
        difficulty: difficultyCycle(i),
        explanation: `Counting from the left in ${digits}, the ${ordinal} digit is ${answer}.`,
        tags: ['working-memory'],
      }),
    );
  }
  for (let i = 18; i < 26; i++) {
    const a = int(rng, 5, 15);
    const b = int(rng, 2, 9);
    const c = int(rng, 1, 9);
    const answer = 2 * (a + b - c);
    items.push(
      numericMcq(rng, {
        prompt: `Start with ${a}. Add ${b}. Subtract ${c}. Double the result. What do you get?`,
        answer,
        difficulty: difficultyCycle(i),
        explanation: `${a} + ${b} − ${c} = ${a + b - c}; doubled gives ${answer}.`,
        tags: ['mental-arithmetic'],
      }),
    );
  }
  return items;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const QUALITATIVE_COMPARISONS: Array<[string, string, string]> = [
  ['iron', 'cork', 'denser'],
  ['a marathon', 'a sprint', 'longer'],
  ['boiling water', 'ice water', 'hotter'],
  ['an elephant', 'a mouse', 'heavier'],
  ['a whisper', 'a shout', 'quieter'],
  ['midnight', 'noon', 'darker'],
  ['a mountain', 'a hill', 'taller'],
  ['a desert', 'a rainforest', 'drier'],
  ['a snail', 'a cheetah', 'slower'],
];

const CATEGORY_CLAIMS: Array<[string, string, string, string[]]> = [
  ['squares', 'rectangles', 'Every square is a rectangle', ['Every rectangle is a square', 'No square is a rectangle', 'Squares and rectangles never overlap']],
  ['sparrows', 'birds', 'Every sparrow is a bird', ['Every bird is a sparrow', 'No sparrow is a bird', 'Some sparrows are not birds']],
  ['triangles', 'polygons', 'Every triangle is a polygon', ['Every polygon is a triangle', 'No triangle is a polygon', 'Some triangles are not polygons']],
  ['oaks', 'trees', 'Every oak is a tree', ['Every tree is an oak', 'No oak is a tree', 'Some oaks are not trees']],
  ['salmon', 'fish', 'Every salmon is a fish', ['Every fish is a salmon', 'No salmon is a fish', 'Some salmon are not fish']],
  ['novels', 'books', 'Every novel is a book', ['Every book is a novel', 'No novel is a book', 'Some novels are not books']],
  ['spoons', 'utensils', 'Every spoon is a utensil', ['Every utensil is a spoon', 'No spoon is a utensil', 'Some spoons are not utensils']],
  ['roses', 'flowers', 'Every rose is a flower', ['Every flower is a rose', 'No rose is a flower', 'Some roses are not flowers']],
];

function qualitativeReasoning(rng: Rng): Item[] {
  const items: Item[] = [];
  QUALITATIVE_COMPARISONS.forEach(([x, y, rel], i) => {
    items.push(
      mcq(rng, {
        prompt: `Which is ${rel}: ${x} or ${y}?`,
        correctValue: capitalize(x),
        distractors: [capitalize(y), 'They are the same', 'It cannot be known'],
        difficulty: difficultyCycle(i),
        explanation: `${capitalize(x)} is ${rel} than ${y}.`,
        tags: ['comparison'],
      }),
    );
  });
  for (let i = 9; i < 18; i++) {
    const [cond, cons] = CONDITIONALS[(i - 9) % CONDITIONALS.length];
    items.push(
      mcq(rng, {
        prompt: `If ${cond}, then ${cons}. Today, ${cond}. What follows?`,
        correctValue: capitalize(cons),
        distractors: [
          `It is not the case that ${cons}`,
          `It is not the case that ${cond}`,
          `Nothing follows`,
        ],
        difficulty: difficultyCycle(i),
        explanation: `Modus ponens: the condition holds, so the consequence follows.`,
        tags: ['causation', 'conditional'],
      }),
    );
  }
  CATEGORY_CLAIMS.forEach(([sub, sup, answer, distractors], i) => {
    items.push(
      mcq(rng, {
        prompt: `${capitalize(sub)} are a kind of ${sup}. Which claim is correct?`,
        correctValue: answer,
        distractors,
        difficulty: difficultyCycle(i + 18),
        explanation: `${capitalize(sub)} form a subset of ${sup}, so "${answer}" holds.`,
        tags: ['categories'],
      }),
    );
  });
  return items;
}

const LIKERT_OPTIONS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

const PERSONALITY_ITEMS: Array<[string, string, 1 | -1]> = [
  // openness (3 positively keyed, 2 reverse-keyed)
  ['I enjoy exploring new ideas and unfamiliar concepts.', 'openness', 1],
  ['I often seek out art, music, or writing that challenges me.', 'openness', 1],
  ['I like experimenting with new ways of doing things.', 'openness', 1],
  ['I prefer sticking to familiar routines rather than trying new approaches.', 'openness', -1],
  ['I find abstract or theoretical discussions tiresome.', 'openness', -1],
  // conscientiousness
  ['I plan my work carefully before starting.', 'conscientiousness', 1],
  ['I follow through on the commitments I make.', 'conscientiousness', 1],
  ['I keep my workspace and files well organized.', 'conscientiousness', 1],
  ['I often leave tasks unfinished.', 'conscientiousness', -1],
  ['I tend to put off difficult work until the last minute.', 'conscientiousness', -1],
  // extraversion
  ['I feel energized after spending time with a group of people.', 'extraversion', 1],
  ['I am usually the one who starts conversations.', 'extraversion', 1],
  ['I enjoy being the center of attention at social events.', 'extraversion', 1],
  ['I prefer working alone rather than in a team setting.', 'extraversion', -1],
  ['Large social gatherings drain my energy.', 'extraversion', -1],
  // agreeableness
  ['I go out of my way to make others feel comfortable.', 'agreeableness', 1],
  ['I find it easy to forgive people who have wronged me.', 'agreeableness', 1],
  ['I genuinely enjoy helping colleagues with their problems.', 'agreeableness', 1],
  ["I tend to be critical of other people's shortcomings.", 'agreeableness', -1],
  ["I put my own interests ahead of others' needs.", 'agreeableness', -1],
  // emotional-stability
  ['I stay calm under pressure.', 'emotional-stability', 1],
  ['I recover quickly after setbacks.', 'emotional-stability', 1],
  ['I rarely worry about things beyond my control.', 'emotional-stability', 1],
  ['Small problems can easily make me anxious.', 'emotional-stability', -1],
  ['My mood changes quickly when things go wrong.', 'emotional-stability', -1],
];

function personality(): Item[] {
  return PERSONALITY_ITEMS.map(([prompt, dimension, direction]) => ({
    type: 'likert' as const,
    difficulty: 3,
    prompt,
    options: LIKERT_OPTIONS,
    traitMapping: { dimension, direction },
    tags: ['big-five', dimension],
  }));
}

// ------------------------------------------------------------------ main

const BUILDERS: Record<string, (rng: Rng) => Item[]> = {
  'logical-reasoning': logicalReasoning,
  'verbal-reasoning': verbalReasoning,
  'numerical-reasoning': numericalReasoning,
  'abstract-reasoning': abstractReasoning,
  'spatial-reasoning': spatialReasoning,
  'pattern-recognition': patternRecognition,
  'qualitative-reasoning': qualitativeReasoning,
  'quantitative-reasoning': quantitativeReasoning,
  'computational-thinking': computationalThinking,
  aptitude,
  'cognitive-ability': cognitiveAbility,
  personality,
};

function main(): void {
  const dataDir = join(__dirname, 'data');
  let total = 0;
  const counts: Record<string, number> = {};

  for (const [key, build] of Object.entries(BUILDERS)) {
    const rng = seedrandom(`lms-seed-bank:${key}:v1`);
    const items: SeedQuestion[] = build(rng).map((item, idx) => ({
      seedId: `${key}-${String(idx + 1).padStart(3, '0')}`,
      categoryKey: key,
      ...item,
    }));

    if (items.length < 25) throw new Error(`${key}: only ${items.length} items (< 25)`);
    for (const item of items) {
      // Self-validate the loadable payload (categoryId is resolved at seed time;
      // media is intentionally outside the zod schema — see file header).
      const { seedId: _seedId, categoryKey: _categoryKey, media: _media, ...dto } = item;
      createQuestionSchema.parse({ ...dto, categoryId: '000000000000000000000000' });
    }

    writeFileSync(join(dataDir, `questions.${key}.json`), JSON.stringify(items, null, 2) + '\n');
    counts[key] = items.length;
    total += items.length;
  }

  if (total < 300) throw new Error(`bank too small: ${total} (< 300)`);
  console.table(counts);
  console.log(`Total: ${total} questions emitted to ${dataDir}`);
}

main();
