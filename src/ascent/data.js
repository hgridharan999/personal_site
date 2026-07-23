// Content for the Ascent redesign — copied VERBATIM from the original pages so
// the wording matches exactly. Logos dropped from the data (handled in logos.jsx).

// Work is grouped by three lenses: Ventures · Strategy · Engineering.
export const WORK_LENSES = ['Ventures', 'Strategy', 'Engineering'];

// Ordered by impressiveness: brand + scale first, then founding roles, then
// measurable-impact roles, then technical and leadership work.
export const EXPERIENCES = [
  { title: 'AI/Strategy Consultant (Contract)', company: 'Adobe', category: 'Strategy', url: 'https://www.adobe.com/', location: 'Remote', period: 'Jan 2026 – Apr 2026',
    description: 'Advised IT leadership at Fortune 500 firms on AI product strategy tied to $1M+ enterprise contracts. Built market sizing frameworks, UX benchmarks, and positioning analyses; proposed business cases now in suite beta testing.' },
  { title: 'Consultant', company: 'EXL', category: 'Strategy', url: 'https://www.exlservice.com/', location: 'Remote', period: 'Summer 2026',
    description: 'Managed a portfolio of client contracts valued at $70M+ across Fortune 100 accounts, tracking scope, deliverables, and renewal terms. Built a custom CRM tool to replace manual tracking, administered contract data in Salesforce, and delivered executive-ready decks for global teams.' },
  { title: 'Co-Founder', company: 'Loadstone Labs', category: 'Ventures', url: 'https://loadstonelabs.com', location: 'Ithaca, NY', period: 'Feb 2026 – Present',
    description: 'Building the data and operating layer for Western water rights, including workflow, basin intelligence, and transaction infrastructure.' },
  { title: 'Operations & Strategy Intern', company: 'Stealth Startup', category: 'Ventures', url: null, location: 'Remote', period: 'Jun 2026 – Jul 2026',
    description: "Scaled an early-stage mortgage fintech's lender network from 6 to 25+ signed partnerships in under five weeks — roughly 4x, expanding revenue ~300%. Negotiated terms with partner executives, ran user testing, and directed a source-verified technical audit across 12 subsystems." },
  { title: 'Problem Design Engineer', company: 'Widget Factory', category: 'Engineering', url: 'https://widgetfactory.ai/', location: 'Remote', period: 'Jan 2026 – Apr 2026',
    description: 'Designed complex real-world problem sets used to evaluate frontier AI models in training environments. Benchmarked agent behavior and coordinated engineer feedback into production deployment improvements.' },
  { title: 'Builder', company: 'Cornell Armada', category: 'Engineering', url: 'https://armada.build/', location: 'Ithaca, NY', period: 'Jan 2026 – Present',
    description: 'Led high-agency projects across an AI-native suite, partnering with VCs ($200M+ AUM) at a YC-backed startup community. Built ML apps, code optimizers, full-stack platforms, drone sync systems, and the Cornell founder directory.' },
  { title: 'President', company: 'Cornell Entrepreneurship Club', category: 'Ventures', url: 'https://www.cornellentrepreneurship.com/', location: 'Ithaca, NY', period: 'Sep 2025 – Present',
    description: 'Running YC speaker series for 150+ attendees, coordinating directly with founders and VC firms. Generated 500,000+ views on Instagram/LinkedIn and scouting student startups to develop investment theses.' },
];

// Ordered by impressiveness: shipped venture first, then external validation,
// then the deepest technical systems, then smaller tools.
export const PROJECTS = [
  { title: 'Loadstone', date: 'February 2026 - Present', liveUrl: 'https://loadstonelabs.com/', githubUrl: null, internalUrl: null,
    description: 'Data and operating layer infrastructure for Western water rights. Loadstone unifies workflow, basin intelligence, and transaction infrastructure for attorneys and engineers.',
    tech: ['Python', 'Monte Carlo Simulation', 'React', 'Drones', 'Infrastructure Modeling'] },
  { title: 'Social Network Prediction Market Platform', date: 'September 2025 - Present', stealth: true, liveUrl: null, githubUrl: null, internalUrl: null,
    description: 'Co-founded a fintech prediction market platform that ranked in the top 10% of 20,000+ YC applicants. Built the product from concept to MVP, including prediction logic and unit-economics modeling.',
    tech: ['React', 'Node.js', 'PostgreSQL', 'Python'] },
  { title: 'AI-Powered Climate Solution Discovery Engine', date: 'January 2026 - Present', liveUrl: null, githubUrl: 'https://github.com/hgridharan999', internalUrl: '/climate-search',
    description: 'NLP discovery engine analyzing 10,000+ climate-tech startups across 50+ verticals. Uses BERT embeddings, multi-factor scoring, and semantic search for sub-second retrieval.',
    tech: ['Python', 'BERT', 'FAISS', 'Sentence-Transformers', 'Pandas', 'scikit-learn'] },
  { title: 'TrailSense', date: 'January 2026', liveUrl: null, githubUrl: null, internalUrl: '/trailsense',
    description: 'Hiking decision-support system with ML confidence scoring (XGBoost + SHAP), real-time NWS weather ingestion, and adaptive learning from logged hikes.',
    tech: ['React', 'FastAPI', 'PostgreSQL', 'XGBoost', 'Mapbox', 'NWS API'] },
  { title: 'Open-Source LLM Cost Optimizer', date: 'December 2025 – January 2026', liveUrl: null, githubUrl: 'https://github.com/hgridharan999/token_optimizer', internalUrl: null,
    description: 'Open-source Python toolkit for lowering LLM API spend via model routing, prompt tuning, and semantic caching with sentence-transformers plus Redis. Benchmarked GPT-4, Claude, and Gemini on cost-efficiency tradeoffs.',
    tech: ['Python', 'Redis', 'OpenAI API', 'Anthropic API', 'Sentence-Transformers', 'AsyncIO', 'Pytest'] },
  { title: 'BigRed Network', date: 'January 2026 - Present', liveUrl: 'https://www.bigred.network/', githubUrl: null, internalUrl: null,
    description: 'Curated directory platform connecting Cornell builders, founders, and researchers. Built member filtering, network visualization, and manual review workflows for controlled access.',
    tech: ['React', 'TypeScript', 'Network Graphs', 'Authentication'] },
  { title: 'AI-Powered Startup Discovery Engine', date: 'December 2025 – January 2026', liveUrl: null, githubUrl: 'https://github.com/hgridharan999', internalUrl: null,
    description: 'Research tool for semantic retrieval of companies across 50+ technical verticals for strategic sourcing. Uses multi-factor scoring (founder backgrounds, patent data, market signals) to surface and rank investment candidates. Deployed as an internal valuation and search tool.',
    tech: ['Python', 'NLP/Embeddings', 'BERT', 'FAISS', 'pandas', 'scikit-learn'] },
];

// Ordered by impressiveness: fourteeners first, then technical/strenuous
// climbs, then altitude, then the short and easy ones.
export const HIKES = [
  { name: 'Quandary Peak', location: 'Breckenridge, Colorado', date: 'July 2026', elevation: '14,265 ft', distance: '6.7 mi', difficulty: 'Hard',
    coords: [39.3973, -106.1064],
    photos: ['/hikes/quandary-1.jpg', '/hikes/quandary-2.jpg', '/hikes/quandary-3.jpg', '/hikes/quandary-4.jpg'],
    review: 'first fourteener sub 4:30 total time. Phenomenal summit views but nearly caught by a storm right after our descent. Met so many cool people on the trail. Feet were on fire because of terrain.',
    highlights: ['Sub-4:30 round trip', 'Storm on descent', 'Trail friends'] },
  { name: 'Mt. Bierstadt', location: 'Colorado', date: 'June 2025', elevation: '14,065 ft', distance: '7.0 mi', difficulty: 'Moderate',
    coords: [39.5825, -105.6686],
    photos: ['/hikes/bierstadt-1.jpg', '/hikes/bierstadt-2.jpg', '/hikes/bierstadt-3.jpg'],
    review: "My first fourteener summit. May be the hardest and also most rewarding thing I've ever done. Started at 5 AM under headlamp, watching the sky slowly lighten. Did NOT pick the right time of year — still 6+ feet of snow the last 1000 feet and no gear. Also managed to lose my phone on the summit but found it 2 hours later using Find My :).",
    highlights: ['First 14er', 'Alpine start', 'Above treeline'] },
  { name: 'Seven Falls', location: 'Santa Barbara, California', date: 'January 2026', elevation: '1,500 ft', distance: '8.8 mi', difficulty: 'Hard',
    coords: [34.4483, -119.6640],
    photos: [],
    review: 'Starts light, then a crazy river crossing, then a 60° incline up a mountain, then a 70–85° cable-assisted descent to the actual falls. From there, climbed another mountain to see all seven falls together. Genuinely technical.',
    highlights: ['85° incline', 'Cable descent', 'Technical climb'] },
  { name: 'Sky Pond', location: 'Rocky Mountain National Park', date: 'August 2025', elevation: '10,900 ft', distance: '9.0 mi', difficulty: 'Strenuous',
    coords: [40.2769, -105.6795],
    photos: ['/hikes/skypond-1.jpg', '/hikes/skypond-2.jpg', '/hikes/skypond-3.jpg', '/hikes/skypond-4.jpg'],
    review: 'May be some of the best views in Colorado. Started before sunrise and caught it through gorgeous forests and lakes. The waterfall scramble at the end was insanely fun — we did an additional one just for kicks. Only regret was not being able to cliff jump, it was too cold.',
    highlights: ['Boulder scramble', 'Lake of Glass', 'Waterfall climbs'] },
  { name: 'Glacier Lake', location: 'Guanella Pass, Colorado', date: 'June 2026', elevation: '12,000 ft', distance: '—', difficulty: 'Moderate',
    coords: [39.5936, -105.7272],
    photos: ['/hikes/glacier-1.jpg', '/hikes/glacier-2.jpg', '/hikes/glacier-3.jpg'],
    review: 'Great 12,000 foot hike with sweeping valley views. Crazy fun snow crossings. Went insanely off trail to get some good pictures and a cold one at the top.',
    highlights: ['Snow crossings', 'Valley views', 'Way off trail'] },
  { name: 'Lost Lake', location: 'Indian Peaks Wilderness', date: 'November 2025', elevation: '10,700 ft', distance: '8.2 mi', difficulty: 'Moderate',
    coords: [39.9540, -105.6430],
    photos: ['/hikes/lostlake-1.jpg', '/hikes/lostlake-2.jpg', '/hikes/lostlake-3.jpg', '/hikes/lostlake-4.jpg'],
    review: 'First truly winter hike. Winds over 50 mph with zero visibility when we arrived — thankfully it cleared. Got a bit lost, climbed an extra mountain for cell service. Ended at a beautiful frozen lake where my boot got completely soaked with ice cold water. Played some football at the top.',
    highlights: ['50mph winds', 'Frozen lake', 'Winter conditions'] },
  { name: 'Chief Mountain', location: 'Squaw Pass, Colorado', date: 'July 2026', elevation: '11,709 ft', distance: '3.0 mi', difficulty: 'Easy',
    coords: [39.6725, -105.6106],
    photos: ['/hikes/chief-1.jpg', '/hikes/chief-2.jpg'],
    review: 'very short thirteener. Great views for how short it was. Nearly got the car stuck in the parking off the side of the road.',
    highlights: ['Short summit', 'Big views', 'Roadside parking'] },
  { name: 'The Flatirons', location: 'Chautauqua Park, Colorado', date: 'June 2026', elevation: '6,200 ft', distance: '2.6 mi', difficulty: 'Moderate',
    coords: [39.9986, -105.2811],
    photos: ['/hikes/flatirons-1.jpg', '/hikes/flatirons-2.jpg', '/hikes/flatirons-3.jpg'],
    review: 'Classic Boulder hike straight up above the city. Spent the whole climb looking back at the plains with the entire town laid out below. Loose rock basically the whole way and way hotter than I planned for. Scrambled around the formations at the top — seeing the flatirons up close is unreal.',
    highlights: ['Chautauqua Loop', 'Boulder below', 'Flatiron formations'] },
  { name: 'Escondido Falls', location: 'Malibu, California', date: 'January 2026', elevation: '400 ft', distance: '3.8 mi', difficulty: 'Easy',
    coords: [34.0370, -118.7690],
    photos: ['/hikes/escondido-1.jpg', '/hikes/escondido-2.jpg', '/hikes/escondido-3.jpg', '/hikes/escondido-4.jpg'],
    review: 'Great coastal hike in the LA area. Rain all week made the trail pure mud and added tons of river crossings. The waterfall was 100% worth getting my shoes soaked. Beautiful ocean views on the way back as the sun set.',
    highlights: ['Coastal trail', 'Hidden waterfall', 'Ocean views'] },
];

export const THESIS = {
  headline: 'What I’m betting on',
  points: [
    "People > ideas - great people can create great ideas, but great ideas can't make up for not being a great founder.",
    "physical infrastructure is the #1 most undervalued sector",
    "Way too many building AI and not for AI",
    "If you aren't a good storyteller, you won't have people buy your story or your product",
  ],
};

// Verbatim from the original "me in 10 bullet points" (git d7f8a64), lowercase.
export const PRINCIPLES = [
  "time being so limited means that you shouldn't waste time doing stuff you don't like.",
  'your best experiences are memories shared with friends.',
  'bias to action, choice paralysis kills 99% of solutions.',
  'become someone who loves risk-taking.',
  'health outweighs all other priorities.',
  'potential is the worst thing you can have: it prevents you from maximizing effort.',
  'derealization is a bottom 5 experience all time.',
  'literally everyone around you is underappreciative of the things they have.',
  'not knowing what comes after death should be the scariest thing you ever think about.',
  'human connection is the single most undervalued experience of our time.',
];
