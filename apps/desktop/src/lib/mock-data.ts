import type { Agent } from "./stores/thread-store";

export const MOCK_AGENTS: Agent[] = [
  {
    id: "a1",
    title: "Auth flow — OAuth2 PKCE",
    branch: "feat/oauth-pkce",
    status: "active",
    lastAction: "Implementing token refresh logic",
    progress: 65,
    time: "12m",
    tokens: "18.2k",
    files: ["src/auth/pkce.ts", "src/auth/refresh.ts", "src/middleware/auth.ts"],
    pr: null,
    messages: [
      {
        role: "you",
        content:
          "implement oauth2 pkce flow for the auth module. use the existing session store.",
      },
      {
        role: "agent",
        content:
          "Found session store at src/stores/session.ts. Implementing PKCE with code verifier generation, auth redirect, and token exchange.",
      },
      {
        role: "agent",
        content:
          "Auth redirect and code exchange working. Now adding token refresh with retry logic.",
      },
    ],
    blocked: false,
  },
  {
    id: "a2",
    title: "Fix: Dashboard chart timezone",
    branch: "fix/chart-tz",
    status: "review",
    lastAction: "Tests passing — ready for review",
    progress: 100,
    time: "8m",
    tokens: "11.4k",
    files: [
      "src/components/Chart.tsx",
      "src/utils/timezone.ts",
      "tests/chart.test.ts",
    ],
    pr: "#247",
    messages: [
      {
        role: "you",
        content:
          "charts on dashboard showing UTC instead of local timezone. fix it.",
      },
      {
        role: "agent",
        content:
          "Root cause: Chart.tsx passes raw ISO strings without conversion. Adding Intl.DateTimeFormat formatter.",
      },
      {
        role: "agent",
        content:
          "Fixed. All axes now local timezone. 4 test cases added. PR #247 opened.",
      },
    ],
    blocked: false,
  },
  {
    id: "a3",
    title: "API rate limiting middleware",
    branch: "feat/rate-limit",
    status: "active",
    lastAction: "Setting up Redis sliding window",
    progress: 40,
    time: "6m",
    tokens: "9.1k",
    files: ["src/middleware/rateLimit.ts", "src/config/limits.ts"],
    pr: null,
    messages: [
      {
        role: "you",
        content:
          "add rate limiting middleware. sliding window, redis-backed, configurable per-route.",
      },
      {
        role: "agent",
        content:
          "Using sliding window log with Redis sorted sets. Defaults: 100 req/min API, 20 req/min auth.",
      },
    ],
    blocked: false,
  },
  {
    id: "a4",
    title: "Migrate user table to v2 schema",
    branch: "feat/user-schema-v2",
    status: "active",
    lastAction: "Needs migration strategy decision",
    progress: 25,
    time: "4m",
    tokens: "6.8k",
    files: ["prisma/schema.prisma"],
    pr: null,
    messages: [
      {
        role: "you",
        content:
          "migrate user table to v2 — split profile data, add soft delete.",
      },
      {
        role: "agent",
        content:
          "Schema drafted. 47k rows have nullable emails the new schema requires NOT NULL. Backfill with placeholder, or prompt users?",
      },
    ],
    blocked: true,
    blockReason: "47k rows with null emails — needs backfill strategy",
  },
  {
    id: "a5",
    title: "Onboarding flow redesign",
    branch: "feat/onboarding-v2",
    status: "queued",
    lastAction: "Waiting in queue",
    progress: 0,
    time: "—",
    tokens: "—",
    files: [],
    pr: null,
    messages: [],
    blocked: false,
  },
  {
    id: "a6",
    title: "Fix: Email template rendering",
    branch: "fix/email-templates",
    status: "deployed",
    lastAction: "Deployed to production",
    progress: 100,
    time: "5m",
    tokens: "7.2k",
    files: ["src/email/templates/welcome.tsx", "src/email/render.ts"],
    pr: "#244",
    messages: [
      { role: "you", content: "email templates broken in outlook." },
      {
        role: "agent",
        content:
          "Converted flex to table layout, inlined styles. Tested Outlook, Gmail, Apple Mail.",
      },
    ],
    blocked: false,
    deployedAt: "11:24",
  },
  {
    id: "a7",
    title: "Search indexing for notes",
    branch: "feat/search-index",
    status: "deployed",
    lastAction: "Deployed to production",
    progress: 100,
    time: "15m",
    tokens: "22.1k",
    files: [
      "src/search/indexer.ts",
      "src/search/query.ts",
      "src/workers/reindex.ts",
      "prisma/schema.prisma",
    ],
    pr: "#241",
    messages: [],
    blocked: false,
    deployedAt: "09:47",
  },
];
