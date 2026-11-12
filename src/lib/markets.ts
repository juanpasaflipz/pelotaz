/**
 * Markets a brand can be set up for. Mexico is first and the default. Adding a
 * country here is the first step of a locale pack; regional voice defaults,
 * the holiday calendar and payment methods hang off `country` in later phases.
 */
export const MARKETS = [
  { country: "MX", locale: "es-MX", name: "México" },
  { country: "CO", locale: "es-CO", name: "Colombia" },
  { country: "AR", locale: "es-AR", name: "Argentina" },
  { country: "CL", locale: "es-CL", name: "Chile" },
  { country: "PE", locale: "es-PE", name: "Perú" },
  { country: "ES", locale: "es-ES", name: "España" },
  { country: "US", locale: "es-US", name: "Estados Unidos" },
] as const;

export type Market = (typeof MARKETS)[number];
