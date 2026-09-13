import { z } from "zod";
import type { Seal3dErrorResponse } from "@/types/seal-3d";

export const TaskIdSchema = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
export function errorStatus(code: Seal3dErrorResponse["code"]): number {
  switch (code) {
    case "invalid_input": return 400;
    case "creation_in_progress": case "creation_uncertain": return 409;
    case "generation_disabled": return 403;
    case "meshy_insufficient_credits": return 402;
    case "meshy_rate_limited": return 429;
    default: return 503;
  }
}
