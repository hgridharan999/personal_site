// All visible copy for the homepage, as data (the same idea as src/ascent/data.js).
// Components own the markup; edit wording, links and dates here.
//
// Row shape:
//   { co, coHref?, role?, loc?, when?, lead?, rest?, body?: Text[], meta?: (string | { label, href, sr? })[] }
//   Text is a string, or an array of strings and { text, href } segments for inline company links.
//   - A row with a `body` opens (li.row.xp); a row without one is a plain line (li.row--plain).
//   - `lead` is the highlighted opening of the one-liner; `rest` (Text) finishes the sentence.
//   - On a row that opens, the one-liner is the <summary> (a button), so its `rest` must stay plain
//     text: a link inside it would be a control nested in a control. Link companies in the `body`.
//   - `meta` items render joined by " · ". Link items may carry `sr`, extra screen-reader text.

// Non-breaking space: keeps "Sep 2025" and "Loadstone Labs" from splitting across lines.
export const NBSP = '\u00A0';
const _ = NBSP;

// A dotted list for the ledger lines: each item stays whole (its spaces are non-breaking), and
// the dot sticks to the item before it, so a wrapped line ends with "·" instead of starting with it.
const list = (...items) => items.map((item) => item.replace(/ /g, _)).join(`${_}· `);
/** Glue every space in a short phrase, e.g. a date range, so it wraps as one piece. */
const nb = (text) => text.replaceAll(' ', _);

/** The resume is a static file in public/. It is linked with a plain <a>, never a router link. */
export const RESUME_HREF = '/Hari_Gridharan_Resume.pdf';

/** Screen-reader suffixes that explain what a link does. */
export const A11Y = {
  newTab: ' (opens in new tab)',
  pdf: ' (PDF)',
};

export const HEADER = {
  name: { first: 'Hari', last: 'Gridharan' },
  affiliation: {
    school: `Cornell${_}Dyson${_}’29${_}· Dyson${_}Scholar`,
    fellowship: 'KKR Accelerator Scholar',
    major: `Applied Economics, AI${_}minor`,
    gpa: `GPA${_}3.53`,
  },
  seek: {
    intro: `Co-founder @ Loadstone${_}Labs`,
    rest: ` · S27 internships in strategy, investing, BA, PM${_}→${_}NYC/SF`,
  },
  actions: {
    resume: { label: 'Resume', href: RESUME_HREF },
    email: { label: 'Email', href: 'mailto:hg532@cornell.edu' },
    social: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/harigridharan1/' },
      { label: 'GitHub', href: 'https://github.com/hgridharan999' },
    ],
  },
  lines: [
    {
      label: 'Now',
      date: { text: 'Oct 2026', iso: '2026-10' },
      text: 'Building Loadstone Labs and writing my first investment memos',
    },
    {
      label: 'Toolkit',
      text: list('Excel', 'PowerPoint', 'Bloomberg', 'SQL', 'Python', 'FastAPI', 'React/TypeScript', 'Cloudflare', 'Claude Code', 'Multi‑Agent Orchestration', 'Salesforce', 'financial modeling', 'market sizing', 'competitive analysis', 'unit economics'),
    },
    {
      label: 'Coursework',
      text: list('Spreadsheet Modeling', 'Linear Algebra', 'Math Foundations of CS', 'Finance', 'Financial Accounting', 'Statistics'),
    },
  ],
};

export const EXPERIENCE = {
  id: 'experience',
  title: 'Experience',
  rows: [
    {
      role: 'CEO & Co-Founder',
      co: `Loadstone${_}Labs`,
      coHref: 'https://loadstonelabs.com/',
      when: nb('Feb 2026 – now'),
      lead: `Venture-backed, with grants from AWS and LvlUp${_}Ventures.`,
      rest: ' We pull in 132,000+ water-rights records a day.',
      body: [
        'Run a data platform for Western U.S. water rights that brings rights workflow, basin intelligence and transaction infrastructure into one place.',
        'Architected a pipeline that ingests 132,000+ live water-rights records a day from 44 Colorado counties into one unified schema.',
        [
          'Secured venture backing and grants from ',
          { text: 'AWS', href: 'https://aws.amazon.com/' },
          ' and ',
          { text: `LvlUp${_}Ventures`, href: 'https://www.lvlup.vc/' },
          ' by sizing the market and building a unit-economics model.',
        ],
      ],
      meta: ['Ithaca, NY'],
    },
    {
      role: 'Consulting Intern',
      co: 'EXL',
      coHref: 'https://www.exlservice.com/',
      when: nb('Jul 2026 – Sep 2026'),
      lead: 'Built a CRM tool',
      rest: ` so the team could stop tracking an eight-figure book of Fortune${_}100 contracts by${_}hand.`,
      body: [
        'Supported an eight-figure book of Fortune 100 client contracts, tracking scope, deliverables and renewal terms across accounts.',
        'Built a custom CRM tool that replaced manual contract tracking and centralized account status for the full client services team.',
        'Managed client and contract data in Salesforce and produced executive-ready PowerPoint decks for global cross-functional teams.',
      ],
      meta: ['New York, NY', 'Hybrid'],
    },
    {
      role: 'Operations & Strategy Intern',
      co: `Midian${_}Partners`,
      when: nb('Jun 2026 – Jul 2026'),
      lead: 'Took the lender network from 6 to 25+ partners',
      rest: ` in under five weeks, while revenue grew${_}310%.`,
      body: [
        'Grew an early-stage mortgage fintech’s lender network from 6 to 25+ partners in under five weeks as revenue increased 310%.',
        'Negotiated with partner executives, building a 14-agreement comparative dataset to counter an above-market recapture clause.',
        'Led a build-vs-buy evaluation of a core data integration on architecture, coverage and liability terms, saving an estimated $25K.',
      ],
      meta: ['Remote'],
    },
    {
      role: 'AI Strategy Consultant (Contract)',
      co: 'Adobe',
      coHref: 'https://www.adobe.com/',
      when: nb('Jan 2026 – Apr 2026'),
      lead: 'Market sizing and positioning',
      rest: ` for Adobe’s enterprise AI products, tied to $1M+ in${_}contracts.`,
      body: [
        'Advised on AI product and client strategy for $1M+ enterprise contracts, presenting business cases to a Fortune 500 IT C-suite.',
        'Proposed business cases for the enterprise suite now in beta testing, translating emerging AI capability into deployable features.',
        'Built market-sizing frameworks, UX benchmarks and positioning analyses locating where AI could displace existing workflows.',
      ],
      meta: ['Remote'],
    },
    {
      role: 'Problem Design Engineer',
      co: 'IdlExperts',
      coHref: 'https://idlexperts.ai/',
      when: nb('Jan 2026 – Apr 2026'),
      lead: 'Wrote 6 problem sets',
      rest: ` used to test frontier AI${_}models.`,
      body: [
        'Designed six real-world problem sets used to evaluate frontier AI models, building environments that isolate reasoning failures.',
        'Benchmarked agent behavior and task completion across environments, turning observed failure patterns into task-design fixes.',
        'Consolidated engineer feedback into shipped changes to the model training and execution environments used in production.',
      ],
      meta: ['Remote', 'formerly Widget Factory'],
    },
    {
      role: 'Co-Founder',
      co: 'Commit',
      when: nb('Sep 2025 – Jan 2026'),
      lead: `Built the MVP in 3${_}days`,
      rest: ` for a social prediction market. Our YC application made the top${_}10%.`,
      body: [
        `Co-founded a social prediction-market platform; its Y${_}Combinator application ranked in the top 10% of applicants.`,
        'Took it from concept to working MVP in three days, including prediction logic and a unit-economics model.',
      ],
    },
  ],
};

export const ON_CAMPUS = {
  id: 'on-campus',
  title: 'On campus',
  rows: [
    {
      role: 'Analyst',
      co: `Cornell Venture${_}Capital`,
      coHref: 'https://cornellvc.com/',
      when: nb('Sep 2026 – now'),
      lead: 'Sourced 10 startups',
      rest: [' for ', { text: `G20${_}Ventures`, href: 'https://www.g20vc.com/' }, ` to consider investing${_}in.`],
    },
    {
      role: 'Co-President',
      co: `Cornell Entrepreneurship${_}Club`,
      coHref: 'https://www.cornellec.com/',
      when: nb('Sep 2025 – now'),
      lead: 'Brought Paul Graham, Scott Nolan and Cory Levy',
      rest: ` to campus, with 150+ people at each${_}talk.`,
      body: [
        'Run a speaker series bringing Paul Graham, Scott Nolan, Cory Levy and Tony Dang to campus for audiences of 150+ per talk.',
        `Grew the club’s reach to 500,000+ across Instagram and LinkedIn since Sep${_}2025: 150,000+ reel views and 350,000+ post impressions.`,
        'Scout and evaluate student-led startups across technical verticals, building investment theses and operating strategies for each.',
      ],
      meta: ['Ithaca, NY'],
    },
    {
      role: 'Builder',
      co: `Cornell${_}Armada`,
      coHref: 'https://armada.build/',
      when: nb('Jan 2026 – now'),
      lead: 'A YC-backed community of Cornell builders.',
      rest: ' We work on side projects together, and I built its member directory, bigred.network.',
      body: [
        [
          'Built ',
          { text: 'bigred.network', href: 'https://www.bigred.network/' },
          ', a hand-reviewed directory of 65 Cornell founders and builders with member filtering and a network graph.',
        ],
        'Led technical projects across an AI-native product suite at a YC-backed community, partnering with VCs at $200M+ AUM.',
        'Engineered experimental systems spanning drone synchronization, ML applications, code optimizers and full-stack platforms.',
      ],
    },
  ],
};

export const PROJECTS = {
  id: 'projects',
  title: 'Projects & research',
  rows: [
    {
      co: 'Vest Practices',
      loc: 'DNHacks 2026',
      when: nb('Sep 2026'),
      lead: 'AI glasses that coach tradespeople',
      rest: ` on the job. Built with a team of five at${_}DNHacks.`,
      body: [
        [
          'A wearable training system for tradespeople, built on AI glasses by a team of five at ',
          { text: 'DNHacks 2026', href: 'https://dnhacks.org/' },
          ' (Energy & Industrialization track).',
        ],
        'The glasses see what the trainee sees and talk back: a detector trained on the team’s own footage, a vision model that reads part markings, voice activation and a synthesized voice in the ear. Every session is stored as structured data, so the trainer can see what each trainee has learned.',
        'Built the electrical-voltage detector and the WebSocket link that streams the Ray-Ban glasses’ live feed to a computer.',
      ],
      meta: [
        { label: 'Demo', href: 'https://vestpractices.vercel.app/' },
        { label: 'Entry', href: 'https://portal.dnhacks.org/e/2026/showcase/b-v-est-practices' },
        { label: 'Team repo', href: 'https://github.com/8ddieHu0314/dnhacks' },
      ],
    },
    {
      co: 'Climate startup search',
      loc: 'Venture sourcing',
      when: nb('Dec 2025 – Jan 2026'),
      lead: 'A search engine for 212 climate startups',
      rest: `, built for investors. Results come back in about half a${_}second.`,
      body: [
        'An investor sourcing tool covering 212 indexed climate-tech startups across 12 verticals. It ranks candidates with multi-factor scoring across founder backgrounds, patent data and market signals.',
        'Search blends BERT embeddings (FAISS) with BM25 keyword ranking through reciprocal rank fusion, expands queries with synonyms, and is measured with NDCG@10.',
      ],
      meta: [
        'Python',
        'FastAPI',
        'FAISS',
        { label: 'Demo', href: '/climate-search', sr: ' for climate startup search' },
        { label: 'Repo', href: 'https://github.com/hgridharan999/climate_tech_discovery_backend' },
      ],
    },
    {
      co: 'OEIS A363004',
      coHref: 'https://oeis.org/A363004',
      loc: 'Number theory',
      when: nb('Jul 2026'),
      lead: 'Computed a new term',
      rest: ` in a sequence tied to Gilbreath’s conjecture, an unsolved problem about prime${_}numbers.`,
      body: [
        'Take the primes, write the gaps between neighbors, then the gaps between those gaps, and so on. Gilbreath’s conjecture says every row starts with 1. It’s been checked for hundreds of billions of rows but never proved.',
        'A363004 counts how many sequences of distinct numbers have the same all-ones pattern. I wrote the search that found the 12th term, 9,290,399,173, and the OEIS now credits it to me.',
      ],
      meta: ['Python'],
    },
    {
      co: 'bigred.network',
      coHref: 'https://www.bigred.network/',
      loc: 'Cornell Armada',
      when: nb('Jan 2026'),
      lead: 'A directory of 65 Cornell founders and builders',
      rest: `. Every member gets reviewed by${_}hand.`,
      body: [
        'Built bigred.network, the directory of Cornell’s founders, builders and operators, as part of Cornell Armada, a YC-backed founder community. 65 members as of Oct 2026.',
        'Features member filtering and a network visualization.',
      ],
      meta: ['React', 'TypeScript'],
    },
  ],
};

// Essays are a static list, newest first, using the softer panel titles. The hidden essay is left
// out on purpose, and a test checks every slug against src/blog/posts.
export const WRITING = {
  id: 'writing',
  title: 'Writing',
  note: 'Everything here is my own writing. None of it is AI-generated.',
  memos: { label: 'Investment memos', empty: 'First memos coming soon.' },
  essaysLabel: 'Essays',
  essays: [
    { slug: 'tat-tvam-asi', title: 'Tat Tvam Asi and Conviction', date: '2026-10-06', when: nb('Oct 2026') },
    {
      slug: 'solipsism-take-every-risk',
      title: 'Solipsism and the Case for Taking More Risks',
      date: '2026-03-15',
      when: nb('Mar 2026'),
    },
    {
      slug: 'neuroplasticity-and-change',
      title: 'Why Neuroplasticity Gives Me Reasons to Keep Growing and Proves Bojack Wrong',
      date: '2026-02-23',
      when: nb('Feb 2026'),
    },
  ],
  thesesLink: { label: 'Me in 10 bullet points', href: '/theses' },
};

export const OFF_CLOCK = {
  id: 'off-the-clock',
  title: 'When I’m not working',
  rows: [
    {
      co: 'Mountaineering',
      loc: 'Colorado fourteeners',
      when: nb('Jun 2025 – now'),
      lead: '8 Colorado fourteeners',
      rest: ` so far. The most recent was the Decalibron${_}loop.`,
      body: [
        'I love hiking and being outdoors in general. Lately that means working through Colorado’s fourteeners: the first was Mt. Bierstadt in June 2025, and the most recent was the Decalibron loop.',
      ],
      meta: [{ label: 'Trail log', href: '/hiking', sr: ' for mountaineering' }],
    },
    {
      co: 'Rock climbing',
      loc: 'Bouldering',
      lead: 'Flashed a V4',
      rest: `, and climbed Tabletop, a${_}5.10.`,
      body: ['Mostly bouldering, both in the gym and outside.'],
    },
    {
      co: 'Lifting',
      lead: `205${_}lb bench`,
      rest: ' and a muscle-up.',
      body: ['I’ve lifted consistently for about a year and a half.'],
    },
    {
      co: 'Video games',
      lead: 'Nationally ranked in Catan',
      rest: ` on colonist.io, and top${_}100 in the world with Nani in Brawl${_}Stars.`,
      body: ['Made the Brawl Stars national qualifiers. I also play Hollow Knight and Minecraft.'],
    },
    { co: 'Cooking', lead: 'Regional Indian food', rest: ', dosa especially.' },
    { co: 'Singing' },
  ],
};

// The ending's footer (under the water). Contact links reuse the header's data so the two cannot drift.
const { resume, email, social } = HEADER.actions;

/** Resume, email, LinkedIn, GitHub as SmartLink props. `arrow: true` picks the glyph for the link kind. */
export const CONTACT_LINKS = [
  { label: resume.label, href: resume.href, arrow: '↓', sr: A11Y.pdf },
  { label: email.href.replace(/^mailto:/, ''), href: email.href },
  ...social.map(({ label, href }) => ({ label, href, arrow: true })),
];

export const FOOTER = {
  open: `Looking for a Summer${_}2027 internship in New${_}York or San${_}Francisco. Email is the fastest way to reach${_}me.`,
  updated: { label: 'Last updated', date: 'Oct 2026', datetime: '2026-10' },
  motion: { pause: 'Pause motion', play: 'Play motion' },
};
