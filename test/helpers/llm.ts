import type { BrandDnaDraft } from "@/lib/brand-dna/schema";
import type { GenerateObjectRequest, Llm } from "@/lib/llm/types";

/** A draft a careful model would write from the fixture site. Every fact is on the pages. */
export const FAITHFUL_DRAFT: BrandDnaDraft = {
  business: {
    name: "Taquería La Brasa",
    category: "Taquería",
    summary: "Tacos al carbón de arrachera y pastor en Guadalajara, con servicio a domicilio.",
    languages: ["es-MX"],
  },
  voice: {
    tone: ["cercano", "familiar", "directo"],
    register: "tu",
    readingLevel: "simple",
    sentenceLength: "short",
    emojiUse: "none",
    exampleSentences: ["Tacos al carbón, como en casa de la abuela"],
    bannedWords: [],
  },
  audience: {
    segments: [{ name: "Vecinos de Chapultepec", description: "Piden a domicilio entre semana." }],
    pains: ["Poco tiempo para cocinar"],
    buyingTriggers: ["Promociones entre semana"],
    objections: [],
  },
  offers: [
    { name: "Taco de arrachera", description: "Al carbón de mezquite.", price: "$38", proofPoints: [] },
    { name: "Taco al pastor", description: "Al carbón.", price: "$24", proofPoints: [] },
  ],
  promotions: ["Martes de 2x1 en tacos al pastor, de 6 a 10 pm"],
  rules: { neverClaim: [], constraints: [] },
};

type Responder = (request: GenerateObjectRequest<unknown>) => unknown | Promise<unknown>;

export interface FakeLlm extends Llm {
  calls: Array<GenerateObjectRequest<unknown>>;
}

/**
 * An `Llm` that answers from a table keyed by `purpose`. Responses are parsed
 * with the request's schema, exactly as a real structured-output call would be.
 */
export function createFakeLlm(responders: Record<string, Responder>): FakeLlm {
  const calls: Array<GenerateObjectRequest<unknown>> = [];
  return {
    calls,
    async generateObject<T>(request: GenerateObjectRequest<T>) {
      calls.push(request as GenerateObjectRequest<unknown>);
      const responder = responders[request.purpose];
      if (!responder) throw new Error(`No fake response for ${request.purpose}`);
      const object = request.schema.parse(await responder(request as GenerateObjectRequest<unknown>));
      return {
        object,
        usage: { purpose: request.purpose, model: "fake:model", inputTokens: 1200, outputTokens: 300 },
      };
    },
  };
}

export const faithfulLlm = () =>
  createFakeLlm({
    "brand_dna.build": () => FAITHFUL_DRAFT,
    "brand_dna.critique": () => ({ flags: [] }),
  });
