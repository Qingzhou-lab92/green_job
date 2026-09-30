import { z } from "zod";
import { jobProfileSchema } from "./jd-schema";
export const statuses = ["待投递", "已投递", "面试", "Offer", "结束"] as const;
const text = z.string().max(200000);
const id = z.string().min(1).max(200);
export const evidenceSchema = z.object({
  id,
  strength: text,
  experience: text,
  action: text,
  result: text,
  proof: text,
});
export const profileSchema = z.object({
  name: text,
  contact: text,
  education: text,
  experience: text,
  skills: z.array(text).max(200),
  goals: text,
  original: text,
  evidence: z.array(evidenceSchema).max(1000),
  originals: z
    .array(
      z.object({
        id,
        createdAt: text,
        text,
        filename: text.optional(),
        format: text.optional(),
      }),
    )
    .max(1000),
});
export const jdSchema = z.object({
  id,
  source: text.optional(),
  structured: jobProfileSchema.optional(),
  reviewNotes: z.array(text).optional(),
  title: text,
  company: text,
  city: text,
  raw: text,
  createdAt: text,
});
export const versionSchema = z.object({
  id,
  jdId: text,
  title: text,
  content: text,
  createdAt: text,
});
export const applicationSchema = z.preprocess(
  (value) => {
    if (
      value &&
      typeof value === "object" &&
      "status" in value &&
      value.status === "笔试"
    ) {
      const old = value as Record<string, unknown>;
      return {
        ...old,
        status: "已投递",
        notes: [
          typeof old.notes === "string" ? old.notes : "",
          "原状态：笔试（已合并至已投递）",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    return value;
  },
  z.object({
    id,
    company: text,
    role: text,
    city: text,
    source: text,
    date: text,
    jdId: text,
    resumeId: text,
    followUp: text,
    interviewAt: text,
    notes: text,
    status: z.enum(statuses),
  }),
);
export const questionSchema = z.object({
  id,
  category: text,
  text,
  answer: text,
  improve: z.boolean(),
  feedback: text,
});
export const sessionSchema = z.object({
  id,
  jdId: text,
  role: text,
  createdAt: text,
  status: z.enum(["面试中", "已完成"]),
  questions: z.array(questionSchema).max(200),
});
export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  profile: profileSchema,
  jds: z.array(jdSchema).max(5000),
  versions: z.array(versionSchema).max(5000),
  applications: z.array(applicationSchema).max(5000),
  sessions: z.array(sessionSchema).max(5000),
  questionBank: z.array(questionSchema).max(5000),
  tasks: z.array(z.object({ id, text, done: z.boolean() })).max(5000),
});
export type State = z.infer<typeof stateSchema>;
export type Profile = State["profile"];
export type JD = z.infer<typeof jdSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type Question = z.infer<typeof questionSchema>;
export const uid = () => crypto.randomUUID();
export const today = () => new Date().toLocaleDateString("sv-SE");
export const emptyState = (): State => ({
  schemaVersion: 1,
  profile: {
    name: "",
    contact: "",
    education: "",
    experience: "",
    skills: [],
    goals: "",
    original: "",
    originals: [],
    evidence: [],
  },
  jds: [],
  versions: [],
  applications: [],
  sessions: [],
  questionBank: [],
  tasks: [],
});
