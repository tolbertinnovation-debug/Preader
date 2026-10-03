import { z } from "zod";
import { LIMITS, MODES, READABILITY, TONES, VARIETIES, type RewriteOptions } from "./options";

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const optionsSchema = z.object({
  mode: z.enum(keys(MODES)),
  variety: z.enum(keys(VARIETIES)),
  tone: z.enum(keys(TONES)),
  formality: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  readability: z.enum(keys(READABILITY)),
  strength: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  preserveVoice: z.boolean(),
  allowIdioms: z.boolean(),
  maskPersonal: z.boolean(),
  useVoiceSample: z.boolean(),
  privateMode: z.boolean(),
  glossary: z
    .array(z.string().trim().min(1).max(80))
    .max(LIMITS.maxGlossaryTerms)
    .transform((terms) => [...new Set(terms)]),
}) satisfies z.ZodType<RewriteOptions, unknown>;

export const preferencesSchema = optionsSchema.partial();
export type Preferences = z.infer<typeof preferencesSchema>;

export const rewriteRequestSchema = z.object({
  text: z.string().max(LIMITS.maxChars, "Text is too long for one rewrite. Split it into parts."),
  options: optionsSchema,
  title: z.string().trim().max(200).optional(),
});

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "That password is too long.")
  .refine((p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p), "Mix letters with numbers or symbols.");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const segmentSchema = z.object({
  id: z.string().max(20),
  kind: z.enum(["text", "heading", "preserved"]),
  original: z.string().max(LIMITS.maxChars),
  revised: z.string().max(LIMITS.maxChars * 2),
  accepted: z.enum(["revised", "original", "edited"]),
  edited: z.string().max(LIMITS.maxChars * 2).optional(),
});

export const updateRewriteSchema = z.object({
  segments: z.array(segmentSchema).max(2000),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  preferences: preferencesSchema.optional(),
  voiceSample: z.string().max(LIMITS.maxVoiceSampleChars).nullable().optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const exportSchema = z.object({
  format: z.enum(["docx", "report"]),
  title: z.string().max(200).default("Preader document"),
  text: z.string().max(LIMITS.maxChars * 2),
  segments: z
    .array(
      z.object({
        original: z.string().max(LIMITS.maxChars),
        final: z.string().max(LIMITS.maxChars * 2),
        risk: z.enum(["none", "low", "medium", "high"]),
        notes: z.array(z.string().max(500)).max(20),
      }),
    )
    .max(2000)
    .optional(),
});
