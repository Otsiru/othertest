import os
import json
import asyncio
import threading
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from telethon import TelegramClient, events
from curl_cffi import requests

# Config file path
CONFIG_FILE = 'local_bridge_config.json'

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    pass

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

config = load_config()

if 'api_id' not in config or 'api_hash' not in config:
    print("=== Telegram API Credentials Required ===")
    print("Please get them from: https://my.telegram.org/apps")
    api_id = input("Enter your api_id: ").strip()
    api_hash = input("Enter your api_hash: ").strip()
    config['api_id'] = int(api_id)
    config['api_hash'] = api_hash
    save_config(config)

API_ID = config['api_id']
API_HASH = config['api_hash']

# Global references
loop = None
generation_lock = None # Kept for backward compatibility
received_emails = {}  # token -> list of email dicts
clients = []          # List of active TelegramClients
client_locks = []     # Locks per client
current_client_idx = 0

# Background listener to capture incoming emails
async def on_new_message(event):
    text = event.message.text or ""
    if "New email message" in text:
        link = None
        if event.message.buttons:
            for row in event.message.buttons:
                for button in row:
                    if button.url:
                        link = button.url
                        break
        if link and 'token=' in link:
            try:
                token = link.split('token=')[1].split('&')[0]
                
                # Extract details
                sender = ""
                subject = ""
                lines = text.split('\n')
                for line in lines:
                    if line.startswith("From:"):
                        sender = line.replace("From:", "").strip()
                    elif line.startswith("Subject:"):
                        subject = line.replace("Subject:", "").strip()
                
                import time
                mapped_email = {
                    'from': sender,
                    'to': '',
                    'subject': subject,
                    'body': text,
                    'html': None,
                    'date': int(time.time() * 1000),
                    'ip': '127.0.0.1'
                }
                
                if token not in received_emails:
                    received_emails[token] = []
                # Avoid duplicates
                if not any(e['subject'] == subject and e['body'] == text for e in received_emails[token]):
                    received_emails[token].append(mapped_email)
                    print(f"\n[BACKGROUND 10-SLOT] Berhasil menangkap email baru untuk token {token[:10]}... | Subjek: {subject}")
            except Exception as e:
                print(f"\n[BACKGROUND ERROR 10-SLOT] Gagal memproses email masuk: {e}")

async def wait_for_new_email():
    """
    Triggers bot to generate new email using one of the available Telegram clients in round-robin fashion.
    """
    global current_client_idx
    if not clients:
        raise Exception("Tidak ada akun Telegram yang terkoneksi/aktif saat ini.")

    # Select the next client index (round-robin)
    idx = current_client_idx % len(clients)
    current_client_idx += 1

    client = clients[idx]
    lock = client_locks[idx]

    print(f"\nMenggunakan akun Telegram #{idx + 1}/{len(clients)} (Session: {client.session.filename}) untuk membuat email...")

    async with lock:
        future = loop.create_future()

        @client.on(events.NewMessage(chats='tempmail_org_bot'))
        async def handler(event):
            text = event.message.text
            if "@" in text:
                link = None
                if event.message.buttons:
                    for row in event.message.buttons:
                        for button in row:
                            if button.url:
                                link = button.url
                                break
                
                # Find the email in text
                lines = text.split('\n')
                email = None
                for line in lines:
                    if "@" in line:
                        words = line.split()
                        for word in words:
                            if "@" in word:
                                email = word.strip("[](),. *")
                                break
                        if email:
                            break
                
                if email and link:
                    client.remove_event_handler(handler)
                    if not future.done():
                        future.set_result((email, link))

        # Send command to generate
        await client.send_message('tempmail_org_bot', '➕ Generate New / Delete')

        try:
            email, link = await asyncio.wait_for(future, timeout=25.0)
            # Parse JWT token
            token = link.split('token=')[1].split('&')[0]
            return {"address": email, "token": token}
        except Exception as e:
            client.remove_event_handler(handler)
            raise e

def fetch_messages_from_api(token):
    """
    Fetches messages from temp-mail.org API using curl_cffi to bypass Cloudflare.
    """
    headers = {
        'Accept': '*/*',
        'Accept-Language': 'id,en-US;q=0.9,en;q=0.8,ja;q=0.7,ms;q=0.6',
        'Authorization': f'Bearer {token}',
        'Cache-Control': 'no-cache',
        'Origin': 'https://temp-mail.org',
        'Pragma': 'no-cache',
        'Referer': 'https://temp-mail.org/',
        'Sec-Ch-Ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
    }

    try:
        r = requests.get('https://web2.temp-mail.org/messages', headers=headers, impersonate="chrome110")
        if r.status_code == 200:
            data = r.json()
            messages_list = []
            if isinstance(data, dict):
                messages_list = data.get('messages') or data.get('data') or []
            elif isinstance(data, list):
                messages_list = data
            
            emails = []
            for msg in messages_list:
                emails.append(map_message_to_frontend(msg))
            return {"emails": emails}
        elif r.status_code == 401:
            return {"emails": [], "error": "Token expired or unauthorized"}
        else:
            return {"emails": [], "error": f"Failed with status {r.status_code}"}
    except Exception as e:
        return {"emails": [], "error": str(e)}

def map_message_to_frontend(msg):
    sender = msg.get('from') or msg.get('mail_from') or msg.get('sender') or ''
    if isinstance(sender, dict):
        sender = sender.get('address') or sender.get('email') or str(sender)

    subject = msg.get('subject') or msg.get('mail_subject') or ''
    
    body = ''
    html = ''
    if 'body' in msg:
        if isinstance(msg['body'], dict):
            body = msg['body'].get('text') or msg['body'].get('html') or ''
            html = msg['body'].get('html') or ''
        else:
            body = str(msg['body'])
            html = body
    elif 'text' in msg:
        body = msg.get('text') or ''
        html = msg.get('html') or ''
    elif 'mail_text' in msg:
        body = msg.get('mail_text') or ''
        html = msg.get('mail_html') or ''
    else:
        body = msg.get('content') or msg.get('text') or msg.get('preview') or ''
        html = msg.get('html') or body

    # Extract timestamp
    date_val = msg.get('createdAt') or msg.get('date') or msg.get('mail_timestamp') or msg.get('time')
    import time
    timestamp = int(time.time() * 1000)
    if date_val:
        try:
            if isinstance(date_val, (int, float)):
                timestamp = int(date_val) if date_val > 10000000000 else int(date_val * 1000)
            else:
                from dateutil import parser as dp
                timestamp = int(dp.parse(str(date_val)).timestamp() * 1000)
        except Exception:
            pass

    return {
        'from': str(sender),
        'to': '',
        'subject': str(subject),
        'body': str(body),
        'html': str(html) if html else None,
        'date': timestamp,
        'ip': '127.0.0.1'
    }

class BridgeHTTPRequestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Request-Private-Network')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            return

        if path == '/api/tempmail/inbox':
            token_list = query.get('token')
            if not token_list:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "token parameter required"}).encode())
                return
            
            token = token_list[0]
            # Get background captured emails
            local_emails = received_emails.get(token, [])
            
            # Fetch from temp-mail API (might return 401 for old tokens, but we still have local ones!)
            api_res = fetch_messages_from_api(token)
            api_emails = api_res.get('emails', []) if isinstance(api_res, dict) else []
            
            # Merge without duplicates by subject and body
            combined = list(local_emails)
            for api_m in api_emails:
                if not any(loc_m['subject'] == api_m['subject'] and loc_m['body'] == api_m['body'] for loc_m in combined):
                    combined.append(api_m)
            
            result = {"emails": combined}
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/tempmail/inbox/create':
            # Run the asynchronous function inside the Telethon loop
            future = asyncio.run_coroutine_threadsafe(wait_for_new_email(), loop)
            try:
                result = future.result(timeout=30.0)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        self.send_response(404)
        self.end_headers()

def run_http_server():
    server = ThreadingHTTPServer(('127.0.0.1', 5001), BridgeHTTPRequestHandler)
    print("=== Local Bridge 10-Slot HTTP Server running on http://127.0.0.1:5001 ===")
    server.serve_forever()

async def main():
    global loop, generation_lock, clients, client_locks
    loop = asyncio.get_running_loop()
    generation_lock = asyncio.Lock()

    # Find and sort all session files in external F:\Telegram\1 or local sessions/ folder
    session_paths = []
    
    external_dir = r'F:\Telegram\1'
    if os.path.exists(external_dir) and os.path.isdir(external_dir):
        print(f"Mendeteksi folder session eksternal di: {external_dir}")
        files = os.listdir(external_dir)
        for f in files:
            if f.endswith('.session'):
                session_name = f[:-8]  # remove '.session'
                session_paths.append(os.path.join(external_dir, session_name))
        # Alphabetical sort for phone numbers
        session_paths.sort()
    else:
        if os.path.exists('sessions'):
            files = os.listdir('sessions')
            for f in files:
                if f.endswith('.session'):
                    session_name = f[:-8]  # remove '.session'
                    session_paths.append(os.path.join('sessions', session_name))
        
        # Numerical sorting for session_X
        def get_session_num(p):
            try:
                basename = os.path.basename(p)
                num = basename.split('_')[1]
                return int(num)
            except Exception:
                return 999
        session_paths.sort(key=get_session_num)

    # Skip first 40 sessions, take next 10 for the 10-slot app
    SKIP_SESSIONS = 40
    MAX_CLIENTS = 10
    if len(session_paths) > SKIP_SESSIONS:
        print(f"Menemukan {len(session_paths)} session. Melewati {SKIP_SESSIONS} session pertama, dan mengambil {MAX_CLIENTS} session berikutnya.")
        session_paths = session_paths[SKIP_SESSIONS:SKIP_SESSIONS + MAX_CLIENTS]
    else:
        print(f"[WARNING] Tidak cukup session di folder untuk dilewati {SKIP_SESSIONS} session. Menggunakan session yang ada.")
        session_paths = session_paths[:MAX_CLIENTS]

    # Legacy fallback if no session files inside sessions/ folder
    if not session_paths:
        if os.path.exists('temp_mail_session.session'):
            session_paths.append('temp_mail_session')
        else:
            os.makedirs('sessions', exist_ok=True)
            session_paths.append('sessions/session_1')

    # Initialize client objects
    temp_clients = []
    for path in session_paths:
        print(f"Menginisialisasi client Telegram untuk session: {path}")
        c = TelegramClient(path, API_ID, API_HASH)
        temp_clients.append(c)

    print("\nMenghubungkan ke semua akun Telegram di pool (10-Slot)...")
    active_clients = []
    active_locks = []

    for idx, client in enumerate(temp_clients):
        filename = os.path.basename(client.session.filename)
        print(f"[{idx + 1}/{len(temp_clients)}] Menghubungkan {filename}...")
        try:
            await client.start()
            me = await client.get_me()
            if me:
                print(f"  -> Sukses terhubung sebagai: {me.first_name} (ID: {me.id})")
                client.add_event_handler(on_new_message, events.NewMessage(chats='tempmail_org_bot'))
                active_clients.append(client)
                active_locks.append(asyncio.Lock())
            else:
                print(f"  -> Gagal: Profile tidak ditemukan.")
        except Exception as e:
            print(f"  -> Gagal menghubungkan session {filename}: {e}")

    clients = active_clients
    client_locks = active_locks

    if not clients:
        print("\n" + "="*60)
        print("[CRITICAL ERROR] Tidak ada akun Telegram yang berhasil terhubung untuk 10-Slot!")
        print("="*60 + "\n")
        return

    print(f"\nBerhasil mengaktifkan {len(clients)} akun Telegram di pool 10-Slot!")

    # Start HTTP Server thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # Keep all clients running
    await asyncio.gather(*(c.run_until_disconnected() for c in clients))

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExiting...")
