import { Router } from "express";

const router = Router();

const BASE = "https://api.openinbox.io/api";

interface OpenInboxCreateResponse {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  isExisting?: boolean;
}

interface OpenInboxEmailsResponse {
  emails: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

function extractCode(msg: Record<string, unknown>): string | null {
  const textFields = [
    msg["subject"],
    msg["textBody"],
    msg["text"],
    msg["snippet"],
    msg["preview"],
    msg["bodyText"],
    msg["htmlBody"],
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" \n ");

  const haystack = textFields || JSON.stringify(msg);
  const matches = haystack.match(/\b\d{4,8}\b/g);
  if (!matches) return null;

  // Skip years (2000–2100) which are common false positives
  const filtered = matches.filter(
    (m) => !(m.length === 4 && Number(m) >= 2000 && Number(m) <= 2100)
  );
  return filtered[0] ?? null;
}

// POST /api/openinbox/create -> creates a new disposable inbox via openinbox.io
router.post("/openinbox/create", async (_req, res) => {
  try {
    const upstream = await fetch(`${BASE}/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream error ${upstream.status}` });
    }

    const data = (await upstream.json()) as OpenInboxCreateResponse;
    return res.json({
      id: data.id,
      email: data.email,
      expiresAt: data.expiresAt,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create inbox" });
  }
});

// GET /api/openinbox/messages?inboxId=xxx
router.get("/openinbox/messages", async (req, res) => {
  const { inboxId } = req.query as { inboxId?: string };

  if (!inboxId) {
    return res.status(400).json({ error: "inboxId query param is required" });
  }

  try {
    const upstream = await fetch(
      `${BASE}/emails/inbox/${encodeURIComponent(inboxId)}?page=1&limit=30`,
      { headers: { Accept: "application/json" } }
    );

    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream error ${upstream.status}` });
    }

    const data = (await upstream.json()) as OpenInboxEmailsResponse;
    const emails = Array.isArray(data.emails) ? data.emails : [];

    if (!emails.length) {
      return res.json({ code: null, count: 0 });
    }

    for (const msg of emails) {
      const code = extractCode(msg);
      if (code) {
        return res.json({
          code,
          count: emails.length,
          subject:
            typeof msg["subject"] === "string" ? msg["subject"] : undefined,
        });
      }
    }

    return res.json({
      code: null,
      count: emails.length,
      subject:
        typeof emails[0]?.["subject"] === "string"
          ? (emails[0]["subject"] as string)
          : undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

export default router;
