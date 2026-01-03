import socket
import json
import sys

TCP_PORT = 8080
HOST = 'localhost'

def send_request(sock, method, params=None):
    req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method
    }
    if params:
        req["params"] = params
    
    sock.sendall((json.dumps(req) + '\n').encode('utf-8'))
    
    response_buffer = b''
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        response_buffer += chunk
        if b'\n' in chunk:
            break
    
    return json.loads(response_buffer.decode('utf-8'))

def main():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((HOST, TCP_PORT))
        print(f"Connected to {HOST}:{TCP_PORT}")

        # 1. Check if GEMINI.md is in resources/list
        print("\n--- Testing resources/list ---")
        res_list = send_request(sock, "resources/list")
        resources = res_list.get('result', {}).get('resources', [])
        gemini_md_found = any(r['name'] == 'GEMINI.md' for r in resources)
        
        if gemini_md_found:
            print("SUCCESS: GEMINI.md found in resources/list")
        else:
            print("FAILURE: GEMINI.md NOT found in resources/list")
            print(json.dumps(res_list, indent=2))

        # 2. Try to write to GEMINI.md
        print("\n--- Testing write_resource to GEMINI.md ---")
        write_res = send_request(sock, "tools/call", {
            "name": "write_resource",
            "arguments": {
                "name": "GEMINI.md",
                "content": "This should fail."
            }
        })
        
        if 'error' in write_res:
            print("SUCCESS: Write to GEMINI.md failed as expected.")
            print(f"Error message: {write_res['error']['message']}")
        else:
            print("FAILURE: Write to GEMINI.md succeeded unexpectedly.")
            print(json.dumps(write_res, indent=2))

        # 3. Try to append to GEMINI.md
        print("\n--- Testing append_resource to GEMINI.md ---")
        append_res = send_request(sock, "tools/call", {
            "name": "append_resource",
            "arguments": {
                "name": "GEMINI.md",
                "content": "This should fail."
            }
        })

        if 'error' in append_res:
            print("SUCCESS: Append to GEMINI.md failed as expected.")
            print(f"Error message: {append_res['error']['message']}")
        else:
            print("FAILURE: Append to GEMINI.md succeeded unexpectedly.")
            print(json.dumps(append_res, indent=2))

        sock.close()

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()