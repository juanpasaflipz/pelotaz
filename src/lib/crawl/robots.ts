export interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
}

export const NO_RULES: RobotsRules = { disallow: [], allow: [], sitemaps: [] };

/**
 * Minimal robots.txt reader: the rules for `User-agent: *` plus any group
 * naming our bot, prefix matching only. Wildcards and `$` anchors are treated
 * as literal prefixes up to the first wildcard, which errs on the side of
 * obeying a rule we do not fully understand.
 */
export function parseRobots(body: string, botToken = "pelotazbot"): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], sitemaps: [] };
  let applies = false;
  let lastWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      if (value) rules.sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      const agent = value.toLowerCase();
      const matches = agent === "*" || (agent.length > 0 && botToken.startsWith(agent));
      // Consecutive User-agent lines share one group.
      applies = lastWasAgent ? applies || matches : matches;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!applies || !value) continue;
    const prefix = value.split("*")[0].replace(/\$$/, "");
    if (!prefix) continue;
    if (field === "disallow") rules.disallow.push(prefix);
    if (field === "allow") rules.allow.push(prefix);
  }
  return rules;
}

/** Longest matching rule wins; ties go to allow. */
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  const longest = (prefixes: string[]) =>
    prefixes.reduce((best, p) => (pathname.startsWith(p) && p.length > best ? p.length : best), -1);
  return longest(rules.allow) >= longest(rules.disallow);
}
