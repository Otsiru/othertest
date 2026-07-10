let cachedCookies = null;
let cachedXsrfToken = null;
let lastCookieFetch = 0;

async function getSession() {
  const now = Date.now();
  // Cache cookies for 10 minutes to prevent rate limiting
  if (cachedCookies && cachedXsrfToken && (now - lastCookieFetch < 10 * 60 * 1000)) {
    return {
      xsrfToken: cachedXsrfToken,
      cookieHeader: cachedCookies
    };
  }

  const response = await fetch('https://www.emailnator.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get Emailnator session: Status ${response.status}`);
  }

  const cookies = response.headers.getSetCookie();
  let xsrfToken = '';
  let sessionCookie = '';

  cookies.forEach(cookie => {
    if (cookie.includes('XSRF-TOKEN=')) {
      xsrfToken = cookie.split('XSRF-TOKEN=')[1].split(';')[0];
    }
    if (cookie.includes('emailnator_session=')) {
      sessionCookie = cookie.split('emailnator_session=')[1].split(';')[0];
    }
  });

  if (!xsrfToken || !sessionCookie) {
    // If we can't parse cookies, try using fallback defaults or throw
    throw new Error('Required cookies (XSRF-TOKEN or emailnator_session) not found in response');
  }

  cachedXsrfToken = xsrfToken;
  cachedCookies = `XSRF-TOKEN=${xsrfToken}; emailnator_session=${sessionCookie}`;
  lastCookieFetch = now;

  return {
    xsrfToken,
    cookieHeader: cachedCookies
  };
}

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    const { xsrfToken, cookieHeader } = await getSession();

    // 1. Create Inbox (POST /api/emailnator/inbox/create)
    if (path.endsWith('/inbox/create')) {
      const response = await fetch('https://www.emailnator.com/generate-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-xsrf-token': decodeURIComponent(xsrfToken),
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          // Generate Gmail/GoogleMail/Custom Domain
          email: ["domain", "plusGmail", "dotGmail", "googleMail"]
        })
      });

      if (!response.ok) {
        throw new Error(`Emailnator API failed: Status ${response.status}`);
      }

      const data = await response.json();
      if (!data.email || !data.email.length) {
        throw new Error('No email returned from Emailnator');
      }

      const emailAddress = data.email[0];
      return res.status(200).json({
        address: emailAddress,
        token: emailAddress // Using the email address itself as the token
      });
    }

    // 2. Check Inbox (GET /api/emailnator/inbox?token=...)
    if (path.endsWith('/inbox')) {
      const emailAddress = req.query.token || url.searchParams.get('token');
      if (!emailAddress) {
        return res.status(400).json({ error: 'token parameter (email address) is required' });
      }

      const response = await fetch('https://www.emailnator.com/message-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-xsrf-token': decodeURIComponent(xsrfToken),
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          email: emailAddress
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to retrieve message list: Status ${response.status}`);
      }

      const data = await response.json();
      const messageData = data.messageData || [];
      const emails = [];

      // Fetch the full content of the messages (limit to first 3 to prevent timeout/rate-limiting)
      const messagesToFetch = messageData.slice(0, 3);
      for (const msg of messagesToFetch) {
        if (msg.messageID === 'ADSVPN') continue;

        let body = '';
        try {
          const bodyRes = await fetch('https://www.emailnator.com/message-list', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-xsrf-token': decodeURIComponent(xsrfToken),
              'Cookie': cookieHeader,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
              email: emailAddress,
              messageID: msg.messageID
            })
          });
          if (bodyRes.ok) {
            body = await bodyRes.text();
          }
        } catch (err) {
          console.error(`Failed to get body for message ${msg.messageID}:`, err);
        }

        emails.push({
          from: msg.from,
          to: emailAddress,
          subject: msg.subject,
          body: body,
          html: body,
          date: Date.parse(msg.time) || Date.now(),
          ip: '127.0.0.1'
        });
      }

      return res.status(200).json({
        emails: emails
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    console.error('Error handling emailnator request:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
