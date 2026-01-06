import socket
import requests
import json
import threading
import time
import sys
import os

# Configuration
TCP_PORT = 28088
HTTP_PORT = 28089
BASE_URL = f"http://localhost:{HTTP_PORT}"

# --- Helper Functions ---
def print_separator(title):
    print(f"\n{'='*10} {title} {'='*10}")

def print_message(direction, msg_type, msg):
    print(f"[{direction}] {msg_type}: {json.dumps(msg, indent=2, ensure_ascii=False)}")

# --- MCP Client Base Class ---
class McpClient:
    def __init__(self):
        self.request_id_counter = 0

    def _next_id(self):
        self.request_id_counter += 1
        return self.request_id_counter

    def _create_request(self, method, params=None):
        req = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method
        }
        if params is not None:
            req["params"] = params
        return req

    def send_initialize(self):
        req = self._create_request("initialize", {"capabilities": {}})
        return req

    def send_initialized_notification(self):
        req = self._create_request("notifications/initialized")
        req.pop("id") # Notifications do not have an ID
        return req

    def send_ping(self):
        req = self._create_request("ping")
        return req

    def send_prompts_list(self):
        req = self._create_request("prompts/list")
        return req

    def send_prompts_get(self, name):
        req = self._create_request("prompts/get", {"name": name})
        return req

    def send_resources_list(self):
        req = self._create_request("resources/list")
        return req

    def send_resources_read(self, uri):
        req = self._create_request("resources/read", {"uri": uri})
        return req
    
    def send_tools_list(self):
        req = self._create_request("tools/list")
        return req

    def send_tools_call(self, name, args):
        req = self._create_request("tools/call", {"name": name, "arguments": args})
        return req
    
    # Helper methods removed to avoid confusion. Use send_tool_call directly in subclasses or tests.


# --- TCP Client Implementation ---
class TcpMcpClient(McpClient):
    def __init__(self, host='localhost', port=TCP_PORT):
        super().__init__()
        self.host = host
        self.port = port
        self.socket = None

    def connect(self):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.settimeout(5) # Set a timeout for socket operations
        try:
            self.socket.connect((self.host, self.port))
            print(f"Connected to TCP server at {self.host}:{self.port}")
        except ConnectionRefusedError:
            print(f"Error: Connection refused. Is the TCP server running on port {self.port}?")
            sys.exit(1)
        except socket.timeout:
            print(f"Error: Connection timed out to {self.host}:{self.port}.")
            sys.exit(1)
        return True

    def disconnect(self):
        if self.socket:
            self.socket.close()
            print("Disconnected from TCP server.")
        return True

    def _send_and_receive(self, request_msg):
        req_str = json.dumps(request_msg, ensure_ascii=False) + '\n'
        print_message("SEND", "TCP Request", request_msg)
        self.socket.sendall(req_str.encode('utf-8'))

        response_buffer = b''
        while True:
            try:
                chunk = self.socket.recv(4096)
                if not chunk:
                    break
                response_buffer += chunk
                if b'\n' in chunk: # Assume messages are newline delimited
                    break
            except socket.timeout:
                print("Receive timed out, returning partial buffer.")
                break
            except Exception as e:
                print(f"Error receiving from TCP socket: {e}")
                break

        if response_buffer:
            try:
                response_str = response_buffer.decode('utf-8').strip()
                response_msg = json.loads(response_str)
                print_message("RECV", "TCP Response", response_msg)
                return response_msg
            except json.JSONDecodeError:
                print(f"Error decoding JSON from TCP response: {response_buffer.decode('utf-8')}")
                return None
        return None

    def send_request(self, method, params=None):
        req = self._create_request(method, params)
        return self._send_and_receive(req)

    def send_tool_call(self, name, args):
        # Correctly uses send_tools_call to create request, then sends it
        req = self.send_tools_call(name, args)
        return self._send_and_receive(req)


# --- HTTP Client Implementation ---
class HttpMcpClient(McpClient):
    def __init__(self, base_url=BASE_URL):
        super().__init__()
        self.base_url = base_url
        self.sse_url = f"{base_url}/sse"
        self.post_url = None
        self.session_id = None
        self.sse_thread = None
        self.received_responses = {} # Store responses by request ID

    def _sse_listener(self):
        print(f"Connecting to SSE: {self.sse_url}")
        try:
            response = requests.get(self.sse_url, stream=True)
            response.raise_for_status()
            
            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    
                    if decoded_line.startswith("event: endpoint"):
                        pass # Next line should be data, ignore event line
                    
                    elif decoded_line.startswith("data: "):
                        data_str = decoded_line[6:]
                        
                        if data_str.startswith("/message?sessionId="):
                            self.post_url = f"{self.base_url}{data_str}"
                            from urllib.parse import urlparse, parse_qs
                            parsed = urlparse(self.post_url)
                            self.session_id = parse_qs(parsed.query)['sessionId'][0]
                            print(f"SSE Listener: Session ID received: {self.session_id}")
                            print(f"SSE Listener: Post URL: {self.post_url}")
                        
                        elif data_str.startswith("{"):
                            try:
                                msg = json.loads(data_str)
                                print_message("RECV", "SSE Response", msg)
                                if 'id' in msg:
                                    self.received_responses[msg['id']] = msg
                            except json.JSONDecodeError:
                                print(f"SSE Listener: Error decoding JSON: {data_str}")
        except Exception as e:
            print(f"SSE Listener Error: {e}")

    def connect(self):
        self.sse_thread = threading.Thread(target=self._sse_listener, daemon=True)
        self.sse_thread.start()

        print("Waiting for HTTP session initialization (SSE endpoint)...")
        for _ in range(15): # Wait longer for HTTP/SSE setup
            if self.session_id and self.post_url:
                print(f"HTTP Session initialized. Session ID: {self.session_id}")
                return True
            time.sleep(1)
        print("Error: Failed to obtain session ID. Is the HTTP server running?")
        sys.exit(1)
        return False

    def disconnect(self):
        # SSE thread is daemon, will exit with main program
        print("HTTP client logic finished. SSE listener will terminate with script.")
        return True

    def _send_post_request(self, request_msg):
        if not self.post_url:
            print("Error: POST URL not available. SSE connection might not be established.")
            return None
        
        print_message("SEND", "HTTP Request", request_msg)
        try:
            res = requests.post(self.post_url, json=request_msg, timeout=5)
            # For SSE, POST just acknowledges receipt, actual response comes via SSE
            print(f"POST Acknowledgment Status: {res.status_code} {res.text.strip()}")
            return res.status_code # Return HTTP status, not MCP response
        except requests.exceptions.ConnectionError:
            print(f"Error: Connection refused. Is the HTTP server running on port {HTTP_PORT}?")
            sys.exit(1)
        except requests.exceptions.Timeout:
            print("Error: HTTP POST request timed out.")
            return None
        except Exception as e:
            print(f"Error sending HTTP POST: {e}")
            return None

    def send_request(self, method, params=None, expect_response=True):
        req = self._create_request(method, params)
        req_id = req.get('id')
        self._send_post_request(req) # This sends the request, response expected via SSE

        if not expect_response or req_id is None:
            return None
        
        # Wait for the response via SSE
        start_time = time.time()
        while time.time() - start_time < 10: # Wait up to 10 seconds for SSE response
            if req_id in self.received_responses:
                response = self.received_responses.pop(req_id)
                return response
            time.sleep(0.5)
        print(f"Error: Timed out waiting for response for request ID {req_id} via SSE.")
        return None

    def send_tool_call(self, name, args, expect_response=True):
        req = self.send_tools_call(name, args)
        return self.send_request(req['method'], req['params'], expect_response=expect_response)
    
    def send_initialized_notification(self):
        # Notifications don't expect a response, and their 'id' is removed.
        # So we just send the POST request and don't wait for SSE response.
        req = self._create_request("notifications/initialized")
        req.pop("id")
        self._send_post_request(req)
        return None


# --- Test Functions ---

def run_all_mcp_tests(client_instance):
    test_resource_name = "test_resource_from_python.md"
    test_resource_uri = f"gemini://{test_resource_name}"
    
    # 1. initialize
    print_separator("Testing initialize")
    init_req = client_instance.send_initialize()
    if isinstance(client_instance, TcpMcpClient):
        init_res = client_instance._send_and_receive(init_req)
    else: # HttpMcpClient
        init_res = client_instance.send_request(init_req['method'], init_req['params'])
    assert init_res and init_res.get('result'), "Initialize failed"
    assert init_res['result'].get('protocolVersion') == "2024-11-05", "Incorrect protocol version"
    print("Initialize successful.")
    time.sleep(0.5) # Give server time to process

    # 2. notifications/initialized
    print_separator("Testing notifications/initialized")
    # This is a notification, no response expected
    if isinstance(client_instance, TcpMcpClient):
        # TCP notifications don't return anything, can't reliably test "no response" without complex socket handling
        pass 
    else: # HttpMcpClient
        client_instance.send_initialized_notification()
    print("Initialized notification sent (no direct response expected).")
    time.sleep(0.5)

    # 3. ping
    print_separator("Testing ping")
    ping_res = client_instance.send_request("ping")
    assert ping_res and ping_res.get('result') == {}, "Ping failed"
    print("Ping successful.")
    time.sleep(0.5)

    # 4. prompts/list
    print_separator("Testing prompts/list")
    prompts_list_res = client_instance.send_request("prompts/list")
    assert prompts_list_res and prompts_list_res.get('result'), "Prompts list failed"
    assert any(p['name'] == 'GEMINI.md' for p in prompts_list_res['result']['prompts']), "GEMINI.md prompt not found"
    assert any(p['name'] == 'SystemPrompt' for p in prompts_list_res['result']['prompts']), "SystemPrompt not found"
    print("Prompts list successful.")
    time.sleep(0.5)

    # 5. prompts/get (GEMINI.md)
    print_separator("Testing prompts/get (GEMINI.md)")
    gemini_md_res = client_instance.send_request("prompts/get", {"name": "GEMINI.md"})
    assert gemini_md_res and gemini_md_res.get('result'), "prompts/get GEMINI.md failed"
    assert "目的" in gemini_md_res['result']['messages'][0]['content']['text'], "GEMINI.md content not as expected"
    print("Prompts/get GEMINI.md successful.")
    time.sleep(0.5)

    # 6. prompts/get (SystemPrompt) - requires configuration in Obsidian
    print_separator("Testing prompts/get (SystemPrompt)")
    sys_prompt_res = client_instance.send_request("prompts/get", {"name": "SystemPrompt"})
    assert sys_prompt_res and sys_prompt_res.get('result'), "prompts/get SystemPrompt failed"
    print("Prompts/get SystemPrompt successful (content depends on Obsidian config).")
    time.sleep(0.5)

    # 7. resources/list
    print_separator("Testing resources/list")
    resources_list_res = client_instance.send_request("resources/list")
    assert resources_list_res and resources_list_res.get('result'), "Resources list failed"
    print("Resources list successful.")
    time.sleep(0.5)

    # 8. tools/list
    print_separator("Testing tools/list")
    tools_list_res = client_instance.send_request("tools/list")
    assert tools_list_res and tools_list_res.get('result'), "Tools list failed"
    expected_tools = ["read_resource", "write_resource", "append_resource", "get_location", "get_datetime", "report_directory"]
    for tool_name in expected_tools:
        assert any(t['name'] == tool_name for t in tools_list_res['result']['tools']), f"Tool {tool_name} not found"
    print("Tools list successful.")
    time.sleep(2.0)

    # 9. tools/call - write_resource
    print_separator(f"Testing tools/call - write_resource ({test_resource_name})")
    write_content = "This is a test resource created by the Python test script."
    write_res = client_instance.send_tool_call("write_resource", {"name": test_resource_name, "content": write_content})
    assert write_res and write_res.get('result'), "write_resource tool call failed"
    print(f"write_resource successful. Check Obsidian for '{test_resource_name}' file.")
    time.sleep(1) # Give Obsidian time to write the file

    # 10. resources/read for the newly created resource
    print_separator(f"Testing resources/read ({test_resource_name})")
    read_new_resource_res = client_instance.send_resources_read(test_resource_uri)
    if isinstance(client_instance, TcpMcpClient):
         read_new_resource_res = client_instance._send_and_receive(read_new_resource_res)
    else:
         read_new_resource_res = client_instance.send_request(read_new_resource_res['method'], read_new_resource_res['params'])
         
    assert read_new_resource_res and read_new_resource_res.get('result'), "resources/read new file failed"
    assert read_new_resource_res['result']['contents'][0]['text'] == write_content, "Read content mismatch"
    print("resources/read new file successful.")
    time.sleep(0.5)

    # 11. tools/call - read_resource
    print_separator(f"Testing tools/call - read_resource ({test_resource_name})")
    tool_read_res = client_instance.send_tool_call("read_resource", {"name": test_resource_name})
    assert tool_read_res and tool_read_res.get('result'), "read_resource tool call failed"
    assert tool_read_res['result']['content'][0]['text'] == write_content, "Tool read content mismatch"
    print("read_resource tool call successful.")
    time.sleep(0.5)

    # 12. tools/call - append_resource
    print_separator(f"Testing tools/call - append_resource ({test_resource_name})")
    append_content = "\nAppended new line."
    append_res = client_instance.send_tool_call("append_resource", {"name": test_resource_name, "content": append_content})
    assert append_res and append_res.get('result'), "append_resource tool call failed"
    print(f"append_resource successful. Check Obsidian for appended content in '{test_resource_name}'.")
    time.sleep(1)

    # 13. Verify appended content via read_resource
    print_separator(f"Verifying appended content ({test_resource_name})")
    verify_append_res = client_instance.send_tool_call("read_resource", {"name": test_resource_name})
    assert verify_append_res and verify_append_res.get('result'), "read_resource after append failed"
    assert verify_append_res['result']['content'][0]['text'] == write_content + append_content, "Appended content mismatch"
    print("Appended content verified successfully.")
    time.sleep(0.5)

    # 14. tools/call - get_location
    print_separator("Testing tools/call - get_location")
    location_res = client_instance.send_tool_call("get_location", {})
    assert location_res and location_res.get('result'), "get_location tool call failed"
    assert location_res['result']['content'][0]['type'] == 'text', "Location result type mismatch"
    print(f"get_location successful. Location: {location_res['result']['content'][0]['text']}")
    time.sleep(0.5)

    # 15. tools/call - get_datetime
    print_separator("Testing tools/call - get_datetime")
    datetime_res = client_instance.send_tool_call("get_datetime", {})
    assert datetime_res and datetime_res.get('result'), "get_datetime tool call failed"
    assert datetime_res['result']['content'][0]['type'] == 'text', "Datetime result type mismatch"
    print(f"get_datetime successful. Datetime: {datetime_res['result']['content'][0]['text']}")
    time.sleep(0.5)

    # 16. tools/call - report_directory
    print_separator("Testing tools/call - report_directory")
    report_dir = "/tmp/test_dir"
    report_res = client_instance.send_tool_call("report_directory", {"dir": report_dir})
    assert report_res and report_res.get('result'), "report_directory tool call failed"
    assert report_res['result']['content'][0]['text'] == f"Directory reported: {report_dir}", "Report directory response mismatch"
    print(f"report_directory successful. Check Obsidian MCP Log for '{report_dir}'.")
    time.sleep(0.5)

    # Clean up
    print_separator(f"Cleaning up test resource ({test_resource_name})")
    cleanup_res = client_instance.send_tool_call("write_resource", {"name": test_resource_name, "content": ""})
    assert cleanup_res and cleanup_res.get('result'), "Test resource cleanup failed"
    print(f"Test resource '{test_resource_name}' cleaned up (content cleared).")
    time.sleep(1)

    # Verify cleanup
    print_separator(f"Verifying test resource cleanup ({test_resource_name})")
    verify_cleanup_res = client_instance.send_tool_call("read_resource", {"name": test_resource_name})
    assert verify_cleanup_res and verify_cleanup_res.get('result'), "read_resource after cleanup failed"
    assert verify_cleanup_res['result']['content'][0]['text'] == "", "Cleanup verification failed: content not empty"
    print("Test resource cleanup verified successfully.")
    time.sleep(0.5)

    print("\nAll MCP tests completed successfully for this client type!")


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ["tcp", "http"]:
        print("Usage: python p_02_mcp_full_test.py [tcp|http]")
        sys.exit(1)

    client_type = sys.argv[1]

    if client_type == "tcp":
        print_separator("Starting TCP MCP Client Tests")
        client = TcpMcpClient()
        client.connect()
        try:
            run_all_mcp_tests(client)
        finally:
            client.disconnect()
    elif client_type == "http":
        print_separator("Starting HTTP MCP Client Tests")
        client = HttpMcpClient()
        client.connect() # This starts the SSE listener and waits for session_id/post_url
        # Give some extra time for SSE to fully establish and process initial messages
        time.sleep(2) 
        try:
            run_all_mcp_tests(client)
        finally:
            client.disconnect()

if __name__ == "__main__":
    main()
