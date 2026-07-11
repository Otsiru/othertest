const LOCAL_API_BASE = 'http://127.0.0.1:5001/api/tempmail';
const REMOTE_API_BASE = '/api/emailnator';

let activeApiBase = REMOTE_API_BASE;
let hasCheckedBridge = false;

const getApiBase = async (): Promise<string> => {
  if (hasCheckedBridge) return activeApiBase;
  try {
    const res = await fetch('http://127.0.0.1:5001/api/health', { method: 'GET' });
    if (res.ok) {
      activeApiBase = LOCAL_API_BASE;
      console.log('Using Local Telegram Bridge for temp-mail.org');
    }
  } catch (err) {
    activeApiBase = REMOTE_API_BASE;
    console.log('Local bridge not running, falling back to Vercel/Emailnator');
  }
  hasCheckedBridge = true;
  return activeApiBase;
};

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
 * Create a new temporary inbox via TempMail.lol API or Local Telegram Bridge.
 */
export const createInbox = async (): Promise<InboxResponse> => {
  const base = await getApiBase();
  const res = await fetch(`${base}/inbox/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to create inbox: ${res.status}`);
  return res.json();
};

/**
 * Check inbox for new emails.
 */
export const checkInbox = async (token: string): Promise<Email[] | null> => {
  const base = await getApiBase();
  const res = await fetch(`${base}/inbox?token=${encodeURIComponent(token)}`);
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
  const promises = Array.from({ length: count }, async (_, i) => {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs * i));
    }
    try {
      const inbox = await createInbox();
      onCreated(i, inbox);
    } catch (err) {
      console.error(`Failed to create inbox ${i + 1}:`, err);
    }
  });
  await Promise.all(promises);
};

/**
 * Check if the local bridge is currently active.
 */
export const checkBridgeStatus = async (): Promise<boolean> => {
  const base = await getApiBase();
  return base === LOCAL_API_BASE;
};
