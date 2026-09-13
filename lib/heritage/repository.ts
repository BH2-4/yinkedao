import { z } from "zod";
import sourcesJson from "@/data/SealCulture-v1/data/sources.json";
import projectsJson from "@/data/SealCulture-v1/data/projects.json";
import regionalStylesJson from "@/data/SealCulture-v1/data/regional_styles.json";
import heritageItemsJson from "@/data/SealCulture-v1/data/heritage_items.json";
import motifsJson from "@/data/SealCulture-v1/data/motifs.json";
import craftsJson from "@/data/SealCulture-v1/data/crafts.json";
import peopleJson from "@/data/SealCulture-v1/data/people.json";
import culturalRulesJson from "@/data/SealCulture-v1/data/cultural_rules.json";
import {
  CraftSchema,
  CulturalRuleSchema,
  HeritageItemSchema,
  HeritageProjectSchema,
  MotifSchema,
  PersonSchema,
  RegionalStyleSchema,
  SourceSchema,
  type Craft,
  type CulturalRule,
  type HeritageItem,
  type HeritageProject,
  type Motif,
  type Person,
  type RegionalStyle,
  type Source,
} from "./types";

/**
 * Heritage Repository — the only module allowed to touch the raw JSON.
 *
 * Contract:
 *  - Every loader validates its file with Zod on first access and caches
 *    the parsed result (module scope). A malformed file throws
 *    HeritageDataError, which the API route maps to a 500.
 *  - Loaded entities always retain source_ids / region / evidence_level.
 *  - Data is bundled via static JSON imports (no fs / no DB) so it works
 *    identically in dev and on serverless deployments.
 */

export class HeritageDataError extends Error {
  constructor(file: string, cause: unknown) {
    const issue =
      cause instanceof z.ZodError
        ? cause.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : cause instanceof Error
          ? cause.message
          : String(cause);
    super(`Heritage dataset "${file}" failed validation: ${issue}`);
    this.name = "HeritageDataError";
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HeritageDataError(file, result.error);
  }
  return result.data;
}

/* ------------------------------  Loaders  -------------------------------- */

let sourcesCache: Source[] | null = null;
export function loadSources(): Source[] {
  if (!sourcesCache) {
    sourcesCache = parse(SourceSchema.array(), sourcesJson, "sources.json");
  }
  return sourcesCache;
}

let projectsCache: HeritageProject[] | null = null;
export function loadProjects(): HeritageProject[] {
  if (!projectsCache) {
    projectsCache = parse(
      HeritageProjectSchema.array(),
      projectsJson,
      "projects.json",
    );
  }
  return projectsCache;
}

let regionalStylesCache: RegionalStyle[] | null = null;
export function loadRegionalStyles(): RegionalStyle[] {
  if (!regionalStylesCache) {
    regionalStylesCache = parse(
      RegionalStyleSchema.array(),
      regionalStylesJson,
      "regional_styles.json",
    );
  }
  return regionalStylesCache;
}

let heritageItemsCache: HeritageItem[] | null = null;
export function loadHeritageItems(): HeritageItem[] {
  if (!heritageItemsCache) {
    heritageItemsCache = parse(
      HeritageItemSchema.array(),
      heritageItemsJson,
      "heritage_items.json",
    );
  }
  return heritageItemsCache;
}

let motifsCache: Motif[] | null = null;
export function loadMotifs(): Motif[] {
  if (!motifsCache) {
    motifsCache = parse(MotifSchema.array(), motifsJson, "motifs.json");
  }
  return motifsCache;
}

let craftsCache: Craft[] | null = null;
export function loadCrafts(): Craft[] {
  if (!craftsCache) {
    craftsCache = parse(CraftSchema.array(), craftsJson, "crafts.json");
  }
  return craftsCache;
}

let peopleCache: Person[] | null = null;
export function loadPeople(): Person[] {
  if (!peopleCache) {
    peopleCache = parse(PersonSchema.array(), peopleJson, "people.json");
  }
  return peopleCache;
}

let culturalRulesCache: CulturalRule[] | null = null;
export function loadCulturalRules(): CulturalRule[] {
  if (!culturalRulesCache) {
    culturalRulesCache = parse(
      CulturalRuleSchema.array(),
      culturalRulesJson,
      "cultural_rules.json",
    );
  }
  return culturalRulesCache;
}

/* ------------------------------  Lookups  -------------------------------- */

export function getSourceById(id: string): Source | null {
  return loadSources().find((s) => s.id === id) ?? null;
}

/**
 * Look up any heritage entity by its dataset id (e.g. "MOTIF-004",
 * "ITEM-010", "REG-002"). Returns a normalized, discriminated shape —
 * narrowing on `kind` narrows `data` accordingly.
 */
export type HeritageEntity =
  | { kind: "motif"; data: Motif }
  | { kind: "heritage_item"; data: HeritageItem }
  | { kind: "regional_style"; data: RegionalStyle }
  | { kind: "craft"; data: Craft }
  | { kind: "project"; data: HeritageProject }
  | { kind: "person"; data: Person };

export function getHeritageById(id: string): HeritageEntity | null {
  const motif = loadMotifs().find((m) => m.id === id);
  if (motif) return { kind: "motif", data: motif };

  const item = loadHeritageItems().find((i) => i.id === id);
  if (item) return { kind: "heritage_item", data: item };

  const style = loadRegionalStyles().find((r) => r.id === id);
  if (style) return { kind: "regional_style", data: style };

  const craft = loadCrafts().find((c) => c.id === id);
  if (craft) return { kind: "craft", data: craft };

  const project = loadProjects().find((p) => p.id === id);
  if (project) return { kind: "project", data: project };

  const person = loadPeople().find((p) => p.id === id);
  if (person) return { kind: "person", data: person };

  return null;
}
