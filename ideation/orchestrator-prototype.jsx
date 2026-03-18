import { useState, useEffect, useRef } from "react";

const AGENTS = [
  {
    id: "a1", title: "Auth flow — OAuth2 PKCE", branch: "feat/oauth-pkce", status: "active",
    lastAction: "Implementing token refresh logic", progress: 65, time: "12m", tokens: "18.2k",
    files: ["src/auth/pkce.ts", "src/auth/refresh.ts", "src/middleware/auth.ts"], pr: null,
    messages: [
      { role: "you", content: "implement oauth2 pkce flow for the auth module. use the existing session store." },
      { role: "agent", content: "Found session store at src/stores/session.ts. Implementing PKCE with code verifier generation, auth redirect, and token exchange." },
      { role: "agent", content: "Auth redirect and code exchange working. Now adding token refresh with retry logic." },
    ],
    blocked: false,
  },
  {
    id: "a2", title: "Fix: Dashboard chart timezone", branch: "fix/chart-tz", status: "review",
    lastAction: "Tests passing — ready for review", progress: 100, time: "8m", tokens: "11.4k",
    files: ["src/components/Chart.tsx", "src/utils/timezone.ts", "tests/chart.test.ts"], pr: "#247",
    messages: [
      { role: "you", content: "charts on dashboard showing UTC instead of local timezone. fix it." },
      { role: "agent", content: "Root cause: Chart.tsx passes raw ISO strings without conversion. Adding Intl.DateTimeFormat formatter." },
      { role: "agent", content: "Fixed. All axes now local timezone. 4 test cases added. PR #247 opened." },
    ],
    blocked: false,
  },
  {
    id: "a3", title: "API rate limiting middleware", branch: "feat/rate-limit", status: "active",
    lastAction: "Setting up Redis sliding window", progress: 40, time: "6m", tokens: "9.1k",
    files: ["src/middleware/rateLimit.ts", "src/config/limits.ts"], pr: null,
    messages: [
      { role: "you", content: "add rate limiting middleware. sliding window, redis-backed, configurable per-route." },
      { role: "agent", content: "Using sliding window log with Redis sorted sets. Defaults: 100 req/min API, 20 req/min auth." },
    ],
    blocked: false,
  },
  {
    id: "a4", title: "Migrate user table to v2 schema", branch: "feat/user-schema-v2", status: "active",
    lastAction: "Needs migration strategy decision", progress: 25, time: "4m", tokens: "6.8k",
    files: ["prisma/schema.prisma"], pr: null,
    messages: [
      { role: "you", content: "migrate user table to v2 — split profile data, add soft delete." },
      { role: "agent", content: "Schema drafted. 47k rows have nullable emails the new schema requires NOT NULL. Backfill with placeholder, or prompt users?" },
    ],
    blocked: true, blockReason: "47k rows with null emails — needs backfill strategy",
  },
  {
    id: "a5", title: "Onboarding flow redesign", branch: "feat/onboarding-v2", status: "queued",
    lastAction: "Waiting in queue", progress: 0, time: "—", tokens: "—",
    files: [], pr: null, messages: [], blocked: false,
  },
  {
    id: "a6", title: "Fix: Email template rendering", branch: "fix/email-templates", status: "deployed",
    lastAction: "Deployed to production", progress: 100, time: "5m", tokens: "7.2k",
    files: ["src/email/templates/welcome.tsx", "src/email/render.ts"], pr: "#244",
    messages: [
      { role: "you", content: "email templates broken in outlook." },
      { role: "agent", content: "Converted flex to table layout, inlined styles. Tested Outlook, Gmail, Apple Mail." },
    ],
    blocked: false, deployedAt: "11:24",
  },
  {
    id: "a7", title: "Search indexing for notes", branch: "feat/search-index", status: "deployed",
    lastAction: "Deployed to production", progress: 100, time: "15m", tokens: "22.1k",
    files: ["src/search/indexer.ts", "src/search/query.ts", "src/workers/reindex.ts", "prisma/schema.prisma"],
    pr: "#241", messages: [], blocked: false, deployedAt: "09:47",
  },
];

const COLS = [
  { key: "queued", label: "Queue", color: "#9b9ea4" },
  { key: "active", label: "Active", color: "#4a7fd4" },
  { key: "review", label: "Review", color: "#c78f2e" },
];

const getColAgents = (key) => {
  if (key === "active") return AGENTS.filter(a => a.status === "active");
  return AGENTS.filter(a => a.status === key && !a.blocked);
};

const mono = "'SF Mono', 'Menlo', 'Consolas', monospace";
const sans = "-apple-system, 'Helvetica Neue', 'Helvetica', sans-serif";

const P = {
  bg: "#ecedef",
  surface: "#f4f5f6",
  card: "#ffffff",
  border: "#d8dadd",
  borderLight: "#e4e5e8",
  text: "#1a1a1a",
  textSecondary: "#6b6f76",
  textTertiary: "#9b9ea4",
  textFaint: "#b8bbc0",
  blue: "#4a7fd4",
  amber: "#c78f2e",
  red: "#c0392b",
  green: "#3a9d63",
  grey: "#9b9ea4",
};

const statusColor = (agent) => {
  if (agent.blocked) return P.red;
  if (agent.status === "active") return P.blue;
  if (agent.status === "review") return P.amber;
  if (agent.status === "deployed") return P.green;
  return P.grey;
};

function Card({ agent, selected, onSelect }) {
  const [hov, setHov] = useState(false);
  const isDeployed = agent.status === "deployed";
  const accent = statusColor(agent);

  return (
    <div
      onClick={() => onSelect(agent.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: P.card,
        border: `1px solid ${selected ? P.text : P.border}`,
        borderLeft: `2.5px solid ${accent}`,
        borderRadius: 8,
        padding: "14px 16px 12px",
        cursor: "pointer",
        transition: "all 0.15s ease",
        opacity: isDeployed ? 0.5 : 1,
        boxShadow: hov && !selected ? "0 1px 4px rgba(0,0,0,0.04)" : "none",
      }}
    >
      {agent.blocked && (
        <div style={{
          fontSize: 10, fontFamily: mono, fontWeight: 600, color: P.red,
          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
        }}>Blocked</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: P.text, lineHeight: 1.35, fontFamily: sans, flex: 1 }}>
          {agent.title}
        </div>
        {agent.pr && (
          <span style={{ fontSize: 10.5, fontFamily: mono, color: P.textTertiary, whiteSpace: "nowrap" }}>
            {agent.pr}
          </span>
        )}
      </div>

      <div style={{
        fontSize: 12, color: agent.blocked ? P.red : P.textSecondary,
        lineHeight: 1.4, fontFamily: sans, marginBottom: 10,
      }}>
        {agent.blocked ? agent.blockReason : agent.lastAction}
      </div>

      {agent.status !== "queued" && agent.status !== "deployed" && (
        <div style={{ height: 2, background: P.borderLight, borderRadius: 1, marginBottom: 10, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${agent.progress}%`,
            background: accent,
            borderRadius: 1, transition: "width 0.4s ease",
          }} />
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 10.5, color: P.textFaint, fontFamily: mono,
      }}>
        <span>{agent.branch}</span>
        <div style={{ display: "flex", gap: 10 }}>
          {agent.time !== "—" && <span>{agent.time}</span>}
          {agent.files.length > 0 && <span>{agent.files.length} files</span>}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ agent, onClose }) {
  const [tab, setTab] = useState("status");
  if (!agent) return null;

  return (
    <div style={{
      width: 360, borderLeft: `1px solid ${P.border}`,
      background: P.surface, display: "flex", flexDirection: "column",
      height: "100%", flexShrink: 0,
    }}>
      <div style={{ padding: "24px 24px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: P.text, lineHeight: 1.35, fontFamily: sans, flex: 1, paddingRight: 12 }}>
            {agent.title}
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: P.textFaint,
            cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, fontFamily: sans,
          }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: statusColor(agent),
          }} />
          <span style={{
            fontSize: 10, fontFamily: mono, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.08em",
            color: statusColor(agent),
          }}>{agent.blocked ? "Blocked" : agent.status}</span>
          <span style={{ fontSize: 11, color: P.textFaint, fontFamily: mono }}>{agent.branch}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, padding: "0 24px", borderBottom: `1px solid ${P.borderLight}` }}>
        {["status", "chat", "files"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none",
            borderBottom: `1.5px solid ${tab === t ? P.text : "transparent"}`,
            color: tab === t ? P.text : P.textTertiary,
            fontSize: 11, fontFamily: mono, fontWeight: 500,
            padding: "10px 14px 8px", cursor: "pointer",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {tab === "status" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { l: "Time", v: agent.time },
                { l: "Tokens", v: agent.tokens },
                { l: "Files", v: `${agent.files.length}` },
                { l: "Progress", v: `${agent.progress}%` },
              ].map(s => (
                <div key={s.l} style={{
                  background: P.card, border: `1px solid ${P.borderLight}`,
                  borderRadius: 6, padding: "10px 12px",
                }}>
                  <div style={{
                    fontSize: 9.5, color: P.textFaint, fontFamily: mono,
                    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
                  }}>{s.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: P.text, fontFamily: sans }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {agent.status === "review" && (
                <>
                  <Btn label="Approve & deploy" />
                  <Btn label="Request changes" secondary />
                </>
              )}
              {agent.status === "active" && !agent.blocked && (
                <>
                  <Btn label="Pause" secondary />
                  <Btn label="Redirect" secondary />
                </>
              )}
              {agent.blocked && <Btn label="Unblock & continue" />}
              {agent.status === "queued" && <Btn label="Start now" />}
            </div>
          </div>
        )}

        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Expand to full view button */}
            <button style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "8px 12px", marginBottom: 12,
              background: P.card, border: `1px solid ${P.borderLight}`,
              borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: mono,
              color: P.textTertiary, transition: "all 0.12s ease",
            }}>
              <span>Open full view</span>
              <span style={{ fontSize: 13 }}>↗</span>
            </button>

            {/* Messages */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {agent.messages.length === 0 ? (
                <div style={{ fontSize: 12, color: P.textFaint, fontStyle: "italic" }}>No messages yet.</div>
              ) : agent.messages.map((m, i) => (
                <div key={i} style={{
                  padding: "10px 12px", background: P.card,
                  border: `1px solid ${P.borderLight}`, borderRadius: 6,
                }}>
                  <div style={{
                    fontSize: 9.5, fontFamily: mono, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    color: m.role === "you" ? P.textSecondary : P.textFaint, marginBottom: 6,
                  }}>{m.role}</div>
                  <div style={{ fontSize: 12.5, color: P.text, lineHeight: 1.5, fontFamily: sans }}>{m.content}</div>
                </div>
              ))}
            </div>

            {/* Inline input */}
            {agent.status !== "queued" && agent.status !== "deployed" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", background: P.card,
                border: `1px solid ${P.border}`, borderRadius: 6,
              }}>
                <input placeholder="Quick message..." style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: P.text, fontSize: 12.5, fontFamily: sans,
                }} />
                <span style={{
                  fontSize: 10, fontFamily: mono, color: P.textFaint,
                  padding: "2px 6px", background: P.surface,
                  border: `1px solid ${P.borderLight}`, borderRadius: 3,
                  cursor: "pointer",
                }}>↵</span>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {agent.files.length === 0 ? (
              <div style={{ fontSize: 12, color: P.textFaint, fontStyle: "italic" }}>No files changed.</div>
            ) : agent.files.map((f, i) => (
              <div key={i} style={{
                fontSize: 11.5, color: P.textSecondary, fontFamily: mono,
                padding: "7px 10px", background: P.card,
                border: `1px solid ${P.borderLight}`, borderRadius: 5,
              }}>{f}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Btn({ label, secondary }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: secondary ? "transparent" : (hov ? "#2a2a2a" : P.text),
        border: `1px solid ${secondary ? P.border : P.text}`,
        color: secondary ? P.textSecondary : "#fff",
        fontSize: 11.5, fontFamily: sans, fontWeight: 500,
        padding: "7px 14px", borderRadius: 6, cursor: "pointer",
        transition: "all 0.12s ease",
      }}
    >{label}</button>
  );
}

function CommandBar({ visible, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (visible && ref.current) ref.current.focus(); }, [visible]);
  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.08)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: 160, zIndex: 100, backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, background: P.card, border: `1px solid ${P.border}`,
        borderRadius: 10, overflow: "hidden",
        boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
          <span style={{ fontSize: 12, color: P.textFaint, fontFamily: mono }}>⌘</span>
          <input ref={ref} placeholder="Tell the orchestrator what to do..."
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: P.text, fontSize: 14, fontFamily: sans,
            }}
          />
        </div>
        <div style={{ borderTop: `1px solid ${P.borderLight}`, padding: "10px 18px" }}>
          <div style={{ fontSize: 11, color: P.textFaint, fontFamily: mono, lineHeight: 1.6 }}>
            "deploy the chart fix" · "what's blocking migration?" · "pause all active"
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Orchestrator() {
  const [selected, setSelected] = useState(null);
  const [cmdBar, setCmdBar] = useState(false);
  const [showDeployed, setShowDeployed] = useState(false);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCmdBar(v => !v); }
      if (e.key === "Escape") { setCmdBar(false); setSelected(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const sel = AGENTS.find(a => a.id === selected);
  const deployed = AGENTS.filter(a => a.status === "deployed");

  return (
    <div style={{
      fontFamily: sans, background: P.bg, color: P.text,
      height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        padding: "18px 28px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.03em" }}>orchestrator</div>
          <span style={{ fontSize: 10.5, fontFamily: mono, color: P.textFaint, letterSpacing: "0.04em" }}>
            schoolbored.ai
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: mono, color: P.textTertiary }}>
            <span><span style={{ color: P.blue }}>{AGENTS.filter(a => a.status === "active").length}</span> active</span>
            <span><span style={{ color: P.amber }}>{AGENTS.filter(a => a.status === "review").length}</span> review</span>
            {AGENTS.some(a => a.blocked) && (
              <span><span style={{ color: P.red }}>{AGENTS.filter(a => a.blocked).length}</span> blocked</span>
            )}
          </div>
          <button onClick={() => setCmdBar(true)} style={{
            background: P.card, border: `1px solid ${P.border}`,
            borderRadius: 6, padding: "6px 14px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 12, color: P.textTertiary, fontFamily: sans,
          }}>
            Command
            <span style={{
              fontSize: 10, fontFamily: mono, color: P.textFaint,
              background: P.surface, padding: "1px 5px", borderRadius: 3,
              border: `1px solid ${P.borderLight}`,
            }}>⌘K</span>
          </button>
        </div>
      </div>

      <div style={{
        padding: "8px 28px", fontSize: 11, fontFamily: mono, color: P.textFaint,
        display: "flex", gap: 18, alignItems: "center",
        borderBottom: `1px solid ${P.borderLight}`, flexShrink: 0,
      }}>
        <span>main @ <span style={{ color: P.textTertiary }}>a7f2c1d</span></span>
        <span style={{ color: P.border }}>·</span>
        <span>staging synced</span>
        <span style={{ color: P.border }}>·</span>
        <span>last deploy 11:24</span>
        <span style={{ color: P.border }}>·</span>
        <span>strict ts, prisma, tailwind</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", overflow: "auto", padding: "24px 28px" }}>
          {COLS.map((col, ci) => {
            const agents = getColAgents(col.key);
            return (
              <div key={col.key} style={{
                flex: 1, minWidth: 200,
                paddingRight: 24,
                borderRight: ci < COLS.length - 1 ? `1px solid ${P.borderLight}` : "none",
                marginRight: ci < COLS.length - 1 ? 24 : 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{
                    display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                    background: col.color,
                  }} />
                  <span style={{
                    fontSize: 10, fontFamily: mono, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.1em", color: P.textFaint,
                  }}>{col.label}</span>
                  <span style={{ fontSize: 10, fontFamily: mono, color: P.textFaint }}>{agents.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {agents.map(a => (
                    <Card key={a.id} agent={a} selected={selected === a.id} onSelect={setSelected} />
                  ))}
                  {agents.length === 0 && (
                    <div style={{
                      padding: 24, border: `1px dashed ${P.borderLight}`,
                      borderRadius: 8, textAlign: "center",
                      fontSize: 11, color: P.textFaint, fontFamily: mono,
                    }}>Empty</div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{
            minWidth: showDeployed ? 200 : 36,
            borderLeft: `1px solid ${P.borderLight}`, paddingLeft: 24,
            transition: "min-width 0.2s ease",
          }}>
            <div onClick={() => setShowDeployed(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}>
              {showDeployed ? (
                <>
                  <span style={{
                    display: "inline-block", width: 5, height: 5, borderRadius: "50%",
                    background: P.green,
                  }} />
                  <span style={{
                    fontSize: 10, fontFamily: mono, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.1em", color: P.textFaint,
                  }}>Deployed</span>
                  <span style={{ fontSize: 10, fontFamily: mono, color: P.textFaint }}>{deployed.length}</span>
                </>
              ) : (
                <span style={{
                  fontSize: 10, fontFamily: mono, color: P.textFaint,
                  writingMode: "vertical-lr", letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  <span style={{ color: P.green }}>●</span> Deployed {deployed.length}
                </span>
              )}
            </div>
            {showDeployed && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {deployed.map(a => (
                  <Card key={a.id} agent={a} selected={selected === a.id} onSelect={setSelected} />
                ))}
              </div>
            )}
          </div>
        </div>

        {sel && <DetailPanel agent={sel} onClose={() => setSelected(null)} />}
      </div>

      <div style={{
        padding: "8px 28px", borderTop: `1px solid ${P.borderLight}`,
        display: "flex", gap: 18, fontSize: 10.5, color: P.textFaint, fontFamily: mono, flexShrink: 0,
      }}>
        {[["⌘K", "command"], ["Esc", "deselect"], ["D", "deploy"], ["N", "new agent"]].map(([k, v]) => (
          <span key={k}>
            <kbd style={{
              color: P.textTertiary, background: P.card,
              border: `1px solid ${P.borderLight}`,
              padding: "1px 5px", borderRadius: 3, fontSize: 10, fontFamily: mono,
            }}>{k}</kbd> {v}
          </span>
        ))}
      </div>

      <CommandBar visible={cmdBar} onClose={() => setCmdBar(false)} />
    </div>
  );
}
