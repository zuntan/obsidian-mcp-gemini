import requests
import json
import threading
import time
import sys

# Configuration
HTTP_PORT = 8081
BASE_URL = f"http://localhost:{HTTP_PORT}"
SSE_URL = f"{BASE_URL}/sse"

session_id = None
post_url = None

def sse_listener():
    global session_id, post_url
    print(f"Connecting to SSE: {SSE_URL}")
    try:
        response = requests.get(SSE_URL, stream=True)
        response.raise_for_status()
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                # print(f"DEBUG SSE: {decoded_line}")
                
                if decoded_line.startswith("event: endpoint"):
                    # Next line should be data
                    continue
                
                if decoded_line.startswith("data: "):
                    data_str = decoded_line[6:]
                    
                    # Check if it's the endpoint URL (initial handshake)
                    if data_str.startswith("/message?sessionId="):
                        post_url = f"{BASE_URL}{data_str}"
                        from urllib.parse import urlparse, parse_qs
                        parsed = urlparse(post_url)
                        session_id = parse_qs(parsed.query)['sessionId'][0]
                        print(f"Session ID received: {session_id}")
                        print(f"Post URL: {post_url}")
                    
                    # Check if it's a JSON-RPC message response
                    elif data_str.startswith("{"):
                        try:
                            msg = json.loads(data_str)
                            print(f"\n[RECEIVED] JSON-RPC Response: {json.dumps(msg, indent=2)}")
                        except json.JSONDecodeError:
                            print(f"\n[RECEIVED] Raw Data: {data_str}")
    except Exception as e:
        print(f"SSE Listener Error: {e}")

# Start SSE listener in a separate thread
thread = threading.Thread(target=sse_listener, daemon=True)
thread.start()

# Wait for session ID
print("Waiting for session initialization...")
for _ in range(10):
    if session_id:
        break
    time.sleep(1)

if not session_id:
    print("Failed to obtain session ID. Is the server running?")
    sys.exit(1)

# Send Ping Request
ping_request = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "ping"
}

print(f"\n[SENDING] Ping Request: {json.dumps(ping_request)}")
try:
    res = requests.post(post_url, json=ping_request)
    print(f"Post Response Status: {res.status_code} {res.text}")
except Exception as e:
    print(f"Post Error: {e}")

# Wait a bit for response
time.sleep(2)

# Send List Prompts Request
prompts_request = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "prompts/list"
}
print(f"\n[SENDING] Prompts List Request: {json.dumps(prompts_request)}")
try:
    res = requests.post(post_url, json=prompts_request)
    print(f"Post Response Status: {res.status_code} {res.text}")
except Exception as e:
    print(f"Post Error: {e}")

time.sleep(2)
print("\nTest finished.")
