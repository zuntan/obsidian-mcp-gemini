import socket
import json
import sys
import time

TCP_PORT = 28088
HOST = 'localhost'

def create_request(method, params=None, req_id=1):
    req = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method
    }
    if params is not None:
        req["params"] = params
    return req

def send_recv(sock, req):
    req_str = json.dumps(req) + '\n'
    sock.sendall(req_str.encode('utf-8'))
    
    response_buffer = b''
    while True:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response_buffer += chunk
            if b'\n' in chunk:
                break
        except Exception as e:
            print(f"Error receiving: {e}")
            break
            
    if response_buffer:
        return json.loads(response_buffer.decode('utf-8').strip())
    return None

def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    
    try:
        sock.connect((HOST, TCP_PORT))
        print(f"Connected to {HOST}:{TCP_PORT}")
        
        # 1. Initialize
        print("Initializing...")
        send_recv(sock, create_request("initialize", {"capabilities": {}}))
        send_recv(sock, create_request("notifications/initialized"))
        
        # 2. Create GEMINI_CHAT.md and GEMINI_CHAT_Test.md
        print("Creating test files...")
        send_recv(sock, create_request("tools/call", {
            "name": "write_resource",
            "arguments": {
                "name": "GEMINI_CHAT.md",
                "content": "Should be excluded?"
            }
        }, 2))
        
        send_recv(sock, create_request("tools/call", {
            "name": "write_resource",
            "arguments": {
                "name": "GEMINI_CHAT_Test.md",
                "content": "Should be excluded?"
            }
        }, 3))
        
        # 3. List Resources
        print("Listing resources...")
        res = send_recv(sock, create_request("resources/list", None, 4))
        
        resources = res['result']['resources']
        resource_names = [r['name'] for r in resources]
        
        print(f"Resources found: {resource_names}")
        
        if "GEMINI_CHAT.md" in resource_names:
            print("FAIL: GEMINI_CHAT.md is present in resources.")
        else:
            print("PASS: GEMINI_CHAT.md is NOT in resources.")
            
        if "GEMINI_CHAT_Test.md" in resource_names:
            print("FAIL: GEMINI_CHAT_Test.md is present in resources.")
        else:
            print("PASS: GEMINI_CHAT_Test.md is NOT in resources.")

        # Cleanup
        # We can't delete files via MCP, so we leave them or overwrite with empty
        send_recv(sock, create_request("tools/call", {
            "name": "write_resource",
            "arguments": {
                "name": "GEMINI_CHAT.md",
                "content": ""
            }
        }, 5))
        send_recv(sock, create_request("tools/call", {
            "name": "write_resource",
            "arguments": {
                "name": "GEMINI_CHAT_Test.md",
                "content": ""
            }
        }, 6))
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    main()
