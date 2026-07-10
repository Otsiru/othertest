const API_BASE = '/api/tempmail';

// --- Types ---

export type InboxResponse = {
  address: string;
  token: string;
};

export type Email = {
  from: string;
  to: string;
  subject: string;
  body: string;
  html: string | null;
  date: number;
  ip: string;
};

// --- API Functions ---

/**
 * Create a new temporary inbox via TempMail.lol API.
 * Free tier: no API key required, inbox expires after 1 hour.
 */
export const createInbox = async (): Promise<InboxResponse> => {
  const res = await fetch(`${API_BASE}/inbox/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to create inbox: ${res.status}`);
  return res.json();
};

/**
 * Check inbox for new emails using the token returned from createInbox.
 * Returns array of Email objects, or null if inbox has expired.
 */
export const checkInbox = async (token: string): Promise<Email[] | null> => {
  const res = await fetch(`${API_BASE}/inbox?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    if (res.status === 404) return null; // inbox expired
    throw new Error(`Failed to check inbox: ${res.status}`);
  }
  const data = await res.json();
  return data && Array.isArray(data.emails) ? data.emails : null;
};

/**
 * Extract a verification code (4–8 digit number) from emails.
 * Scans subject first, then body/html.
 */
export const extractVerificationCode = (emails: Email[]): string | null => {
  for (const email of emails) {
    // Check subject first (most common place for short codes)
    const subjectMatch = email.subject?.match(/\b(\d{4,8})\b/);
    if (subjectMatch) return subjectMatch[1];

    // Then check body
    const text = email.body || '';
    const bodyMatch = text.match(/\b(\d{4,8})\b/);
    if (bodyMatch) return bodyMatch[1];

    // Then check HTML content
    if (email.html) {
      const htmlMatch = email.html.match(/\b(\d{4,8})\b/);
      if (htmlMatch) return htmlMatch[1];
    }
  }
  return null;
};

/**
 * Batch create multiple inboxes with a small delay to avoid rate limiting.
 */
export const createInboxBatch = async (
  count: number,
  onCreated: (index: number, inbox: InboxResponse) => void,
  delayMs: number = 100,
): Promise<void> => {
  for (let i = 0; i < count; i++) {
    try {
      const inbox = await createInbox();
      onCreated(i, inbox);
    } catch (err) {
      console.error(`Failed to create inbox ${i + 1}:`, err);
    }
    if (i < count - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};
