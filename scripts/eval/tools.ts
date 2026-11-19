/**
 * Eval-only tool executors over the fixtures in test/fixtures/assistant.ts,
 * implementing the v1 tool *contracts* from docs/pelota-assistant.md
 * ("Read tools"). Throwaway: PR 2 replaces these with real, tenant-scoped
 * tools of the same names and shapes, reading from Neon under
 * `withTenant()`. All arithmetic (totals, differences, rankings) happens
 * here, in code — never left to the model, per the doc's rule.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { BRAND_PROFILE, POSTS, POST_RESULTS, REJECTIONS, type FixturePost } from "../../test/fixtures/assistant";

const resultsByPost = new Map(POST_RESULTS.map((result) => [result.postId, result]));

function postsInRange(from?: string, to?: string): FixturePost[] {
  return POSTS.filter((post) => (!from || post.scheduledAt >= from) && (!to || post.scheduledAt <= to));
}

function withResult(post: FixturePost) {
  return { ...post, result: resultsByPost.get(post.id) ?? null };
}

const dateRange = z.object({
  from: z.string().optional().describe("ISO date, inclusive"),
  to: z.string().optional().describe("ISO date, inclusive"),
});

export const EVAL_TOOLS = {
  get_brand_profile: tool({
    description: "Brand DNA: offers, prices, promotions and hours.",
    inputSchema: z.object({}),
    execute: async () => BRAND_PROFILE,
  }),

  get_weekly_plan: tool({
    description:
      "This week's or a given week's plan, with each post's reason and its topic exactly as written — including the full text of any quoted review or caption.",
    inputSchema: z.object({ weekStart: z.string().optional().describe("ISO date of the Monday; defaults to the latest week") }),
    execute: async ({ weekStart }) => {
      const week = weekStart ?? POSTS[POSTS.length - 1].weekStart;
      return { weekStart: week, posts: POSTS.filter((post) => post.weekStart === week) };
    },
  }),

  list_posts: tool({
    description:
      "Published and pending posts for a date range, with status and each post's topic exactly as written — including the full text of any quoted review or caption.",
    inputSchema: dateRange,
    execute: async ({ from, to }) => ({ posts: postsInRange(from, to) }),
  }),

  get_post_results: tool({
    description: "Reach, views and interactions for one post, from the daily Meta results.",
    inputSchema: z.object({ postId: z.string() }),
    execute: async ({ postId }) => resultsByPost.get(postId) ?? { postId, error: "no_results" },
  }),

  get_top_posts: tool({
    description: "Posts ranked by a chosen metric over a range.",
    inputSchema: dateRange.extend({
      metric: z.enum(["reach", "views", "likes", "comments", "shares", "saves", "interactions"]).default("interactions"),
      limit: z.number().int().min(1).max(10).default(3),
    }),
    execute: async ({ from, to, metric, limit }) => {
      const ranked = postsInRange(from, to)
        .map(withResult)
        .filter((post) => post.result !== null)
        .sort((a, b) => (b.result![metric] ?? 0) - (a.result![metric] ?? 0))
        .slice(0, limit);
      return { metric, posts: ranked };
    },
  }),

  get_rejections: tool({
    description: "Owner rejection reasons for posts that did not go out.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
    execute: async ({ limit }) => ({ rejections: REJECTIONS.slice(0, limit) }),
  }),

  compare_periods: tool({
    description: "The same metrics for two date ranges, with the difference computed here, not by the model.",
    inputSchema: z.object({
      metric: z.enum(["reach", "views", "likes", "comments", "shares", "saves", "interactions"]).default("interactions"),
      periodA: dateRange,
      periodB: dateRange,
    }),
    execute: async ({ metric, periodA, periodB }) => {
      const sum = (from?: string, to?: string) =>
        postsInRange(from, to)
          .map(withResult)
          .reduce((total, post) => total + (post.result?.[metric] ?? 0), 0);
      const a = sum(periodA.from, periodA.to);
      const b = sum(periodB.from, periodB.to);
      return { metric, periodA: a, periodB: b, difference: a - b };
    },
  }),
} satisfies ToolSet;

export const EVAL_TOOL_NAMES = Object.keys(EVAL_TOOLS) as Array<keyof typeof EVAL_TOOLS>;
