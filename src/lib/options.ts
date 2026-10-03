// Shared between client and server: every user-facing rewrite control lives here.

export const MODES = {
  academic: {
    label: "Academic",
    blurb: "Scholarly, precise and well-hedged prose for theses, papers and assignments.",
  },
  research: {
    label: "Research",
    blurb: "Clear reporting of methods, findings and limitations without overclaiming.",
  },
  essay: {
    label: "Essay",
    blurb: "A confident, flowing argument with a personal yet disciplined voice.",
  },
  professional: {
    label: "Professional",
    blurb: "Reports, proposals, grant applications and workplace writing.",
  },
  natural: {
    label: "Natural",
    blurb: "Sounds like a thoughtful person talking — relaxed, human and direct.",
  },
  simple: {
    label: "Simple English",
    blurb: "Plain words and short sentences for wide audiences and second-language readers.",
  },
  panafrican: {
    label: "Pan-African voice",
    blurb: "Rooted in African perspectives and rhythms of expression, without stereotype.",
  },
} as const;
export type Mode = keyof typeof MODES;

export const VARIETIES = {
  international: { label: "Standard International English", region: "Global" },
  british: { label: "British English", region: "Global" },
  american: { label: "American English", region: "Global" },
  west_african: { label: "West African English", region: "West Africa" },
  liberian: { label: "Liberian English", region: "West Africa" },
  nigerian: { label: "Nigerian English", region: "West Africa" },
  ghanaian: { label: "Ghanaian English", region: "West Africa" },
  sierra_leonean: { label: "Sierra Leonean English", region: "West Africa" },
  east_african: { label: "East African English", region: "East Africa" },
  southern_african: { label: "Southern African English", region: "Southern Africa" },
} as const;
export type Variety = keyof typeof VARIETIES;

export const TONES = {
  neutral: "Neutral",
  warm: "Warm",
  confident: "Confident",
  persuasive: "Persuasive",
  reflective: "Reflective",
  respectful: "Respectful & courteous",
} as const;
export type Tone = keyof typeof TONES;

export const READABILITY = {
  simple: { label: "Simple", hint: "Easy for most readers (approx. grade 6–8)" },
  general: { label: "General", hint: "Educated general audience (grade 9–12)" },
  advanced: { label: "Advanced", hint: "University-level readers" },
  expert: { label: "Expert", hint: "Specialists in the field" },
} as const;
export type Readability = keyof typeof READABILITY;

export const STRENGTHS = {
  1: { label: "Light", hint: "Polish wording; keep almost every sentence." },
  2: { label: "Balanced", hint: "Smooth flow and rhythm; restructure where it helps." },
  3: { label: "Strong", hint: "Rework sentences freely while keeping every idea." },
  4: { label: "Deep", hint: "Rebuild paragraphs from the ideas up." },
} as const;
export type Strength = 1 | 2 | 3 | 4;

export const FORMALITY_LABELS = ["Casual", "Relaxed", "Balanced", "Formal", "Very formal"] as const;

export type RewriteOptions = {
  mode: Mode;
  variety: Variety;
  tone: Tone;
  formality: 1 | 2 | 3 | 4 | 5;
  readability: Readability;
  strength: Strength;
  preserveVoice: boolean;
  allowIdioms: boolean;
  maskPersonal: boolean;
  useVoiceSample: boolean;
  privateMode: boolean;
  glossary: string[];
};

export const DEFAULT_OPTIONS: RewriteOptions = {
  mode: "academic",
  variety: "international",
  tone: "neutral",
  formality: 4,
  readability: "advanced",
  strength: 2,
  preserveVoice: true,
  allowIdioms: false,
  maskPersonal: false,
  useVoiceSample: false,
  privateMode: false,
  glossary: [],
};

/** Sensible starting controls when a user picks a mode. */
export const MODE_PRESETS: Record<Mode, Partial<RewriteOptions>> = {
  academic: { tone: "neutral", formality: 4, readability: "advanced" },
  research: { tone: "neutral", formality: 4, readability: "expert" },
  essay: { tone: "confident", formality: 3, readability: "advanced" },
  professional: { tone: "confident", formality: 4, readability: "general" },
  natural: { tone: "warm", formality: 2, readability: "general" },
  simple: { tone: "warm", formality: 2, readability: "simple" },
  panafrican: { tone: "reflective", formality: 3, readability: "general", variety: "west_african" },
};

export const LIMITS = {
  maxChars: 120_000,
  maxGlossaryTerms: 50,
  maxVoiceSampleChars: 6000,
  // Vercel rejects request bodies over 4.5 MB, so stay safely below that.
  maxUploadBytes: 4 * 1024 * 1024,
};
