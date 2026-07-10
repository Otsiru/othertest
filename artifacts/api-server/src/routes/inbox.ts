import { Router } from "express";

const router = Router();

interface CatchmailMessage {
  id: string;
  mailbox: string;
  from: string;
  subject: string;
  date: string;
  size: number;
}

interface CatchmailResponse {
  address: string;
  page: number;
  page_size: number;
  messages: CatchmailMessage[];
  count: number;
}

function extractCode(text: string): string | null {
  const matches = text.match(/\b\d{4,8}\b/g);
  if (!matches) return null;
  // Skip years (2000–2100) and common non-code numbers
  const filtered = matches.filter(
    (m) => !(m.length === 4 && Number(m) >= 2000 && Number(m) <= 2100)
  );
  return filtered[0] ?? null;
}

// GET /api/inbox?address=user@catchmail.io
router.get("/inbox", async (req, res) => {
  const { address } = req.query as { address?: string };

  if (!address || !address.includes("@")) {
    return res.status(400).json({ error: "address query param is required" });
  }

  try {
    const url = `https://api.catchmail.io/api/v1/mailbox?address=${encodeURIComponent(address)}&page_size=10`;
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream error ${upstream.status}` });
    }

    const data = (await upstream.json()) as CatchmailResponse;

    if (!data.messages || !data.messages.length) {
      return res.json({ code: null, count: 0 });
    }

    // Scan the most recent messages for a verification code in the subject
    for (const msg of data.messages) {
      const code = extractCode(msg.subject) ?? extractCode(msg.from);
      if (code) {
        return res.json({
          code,
          count: data.messages.length,
          subject: msg.subject,
          from: msg.from,
        });
      }
    }

    // No code found in any subject — return count so UI can say "email ada tapi kode belum ditemukan"
    return res.json({
      code: null,
      count: data.messages.length,
      subject: data.messages[0].subject,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

export default router;
