import os
import asyncio
from telethon import TelegramClient
import json

# Load config
config_path = 'local_bridge_config.json'
if not os.path.exists(config_path):
    print("[ERROR] local_bridge_config.json not found! Please make sure it exists in the same folder.")
    exit(1)

with open(config_path, 'r') as f:
    config = json.load(f)

API_ID = config['api_id']
API_HASH = config['api_hash']

# Ensure sessions directory exists
os.makedirs('sessions', exist_ok=True)

async def login_session(session_num):
    session_path = f'sessions/session_{session_num}'
    print(f"\n=========================================")
    print(f" LOGGING IN SESSION {session_num} / 40")
    print(f"=========================================")
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    if me:
        print(f"Successfully logged in as: {me.first_name} (ID: {me.id})")
    await client.disconnect()

async def main():
    print("=== Multi-Account Telegram Login Script ===")
    print("This script will help you log in up to 40 Telegram accounts.")
    print("Press Ctrl+C at any time to exit.\n")
    
    try:
        start_num = int(input("Start login from session number (1-40) [Default: 1]: ") or 1)
        end_num = int(input("End login at session number (1-40) [Default: 40]: ") or 40)
    except ValueError:
        print("Invalid input. Using default 1 to 40.")
        start_num = 1
        end_num = 40

    for i in range(start_num, end_num + 1):
        session_file = f'sessions/session_{i}.session'
        if os.path.exists(session_file):
            print(f"\n[INFO] Session {i} already exists at {session_file}. Skipping...")
            continue
        
        try:
            await login_session(i)
        except Exception as e:
            print(f"[ERROR] Failed to log in session {i}: {e}")
            choice = input("Do you want to retry? (y/n) [Default: y]: ").strip().lower()
            if choice == 'n':
                continue
            else:
                try:
                    await login_session(i)
                except Exception as e2:
                    print(f"[ERROR] Failed again: {e2}. Moving to next.")
                    continue

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExiting login script...")
