import os
import json
import asyncio
import threading
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler
from telethon import TelegramClient, events
from curl_cffi import requests

# Config file path
CONFIG_FILE = 'local_bridge_config.json'

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

config = load_config()

# If api_id or api_hash is missing, ask the user in console
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

# Initialize Telethon
client = TelegramClient('temp_mail_session', API_ID, API_HASH)

# Event loop reference
loop = None

async def wait_for_new_email():
    """
    Triggers bot to generate new email and returns the email and token.
    """
    future = loop.create_future()

    @client.on(events.NewMessage(chats='tempmail_org_bot'))
    async def handler(event):
        text = event.message.text
        if "New temporary email address generated" in text or "temporary email address generated" in text:
            # Try to get the link from inline buttons
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
                    email = line.strip()
                    break
            
            if email and link:
                client.remove_event_handler(handler)
                future.set_result((email, link))

    # Send command to generate
    await client.send_message('tempmail_org_bot', '+ Generate New / Delete')

    try:
        email, link = await asyncio.wait_for(future, timeout=15.0)
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
            # If the response is a dict and has 'messages' key, use it
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
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
            result = fetch_messages_from_api(token)
            
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
                result = future.result(timeout=15.0)
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
    server = HTTPServer(('127.0.0.1', 5000), BridgeHTTPRequestHandler)
    print("=== Local Bridge HTTP Server running on http://localhost:5000 ===")
    server.serve_forever()

async def main():
    global loop
    loop = asyncio.get_running_loop()

    # Start Telegram client
    print("Starting Telegram connection...")
    await client.start()
    print("Telegram connected successfully!")

    # Start HTTP Server thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # Keep client running
    await client.run_until_disconnected()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExiting...")
