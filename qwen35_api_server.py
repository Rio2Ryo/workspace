#!/usr/bin/env python3
"""OpenAI-compatible API server for Qwen3.5-9B Heretic"""

import sys
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from mlx_vlm import load, generate

# Force unbuffered output
sys.stderr = open('/dev/stderr', 'w', buffering=1)

# Load model once at startup
print("Loading Qwen3.5-9B Heretic...", file=sys.stderr, flush=True)
model, processor = load("TheCluster/Qwen3.5-9B-Heretic-MLX-mxfp4")
print("Model loaded! Starting server...", file=sys.stderr, flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    
    def _set_headers(self, content_type="application/json"):
        self.send_response(200)
        self.send_header("Content-type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
    
    def _error(self, message, code=500):
        self.send_response(code)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
    
    def do_GET(self):
        if self.path == "/v1/models":
            self._set_headers()
            response = {
                "object": "list",
                "data": [{
                    "id": "qwen3.5-9b-heretic",
                    "object": "model",
                    "created": 1772834400,
                    "owned_by": "local"
                }]
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self._error("Not found", 404)
    
    def do_POST(self):
        if self.path == "/v1/chat/completions":
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                body = json.loads(post_data)
                messages = body.get("messages", [])
                max_tokens = body.get("max_tokens", 1000)
                
                # Build prompt
                prompt_parts = []
                for msg in messages:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    if role == "system":
                        prompt_parts.append(f"System: {content}")
                    elif role == "user":
                        prompt_parts.append(f"User: {content}")
                    elif role == "assistant":
                        prompt_parts.append(f"Assistant: {content}")
                
                prompt = "\n".join(prompt_parts) if prompt_parts else "Hello"
                
                # Generate
                result = generate(model, processor, prompt=prompt, max_tokens=max_tokens, verbose=False)
                
                # Extract text from result
                if isinstance(result, str):
                    result_text = result
                elif hasattr(result, 'text'):
                    result_text = result.text
                elif hasattr(result, '__iter__') and not isinstance(result, str):
                    # It's an iterator
                    chunks = []
                    for chunk in result:
                        if hasattr(chunk, 'text'):
                            chunks.append(chunk.text)
                        elif isinstance(chunk, str):
                            chunks.append(chunk)
                        else:
                            chunks.append(str(chunk))
                    result_text = ''.join(chunks)
                else:
                    result_text = str(result)
                
                response = {
                    "id": "chatcmpl-local",
                    "object": "chat.completion",
                    "created": 1772834400,
                    "model": "qwen3.5-9b-heretic",
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": result_text
                        },
                        "finish_reason": "stop"
                    }],
                    "usage": {
                        "prompt_tokens": len(prompt.split()),
                        "completion_tokens": len(result_text.split()),
                        "total_tokens": len(prompt.split()) + len(result_text.split())
                    }
                }
                
                self._set_headers()
                self.wfile.write(json.dumps(response).encode())
                
            except Exception as e:
                import traceback
                traceback.print_exc(file=sys.stderr)
                self._error(str(e))
        else:
            self._error("Not found", 404)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    host = "127.0.0.1"
    port = 8089
    print(f"Starting server at http://{host}:{port}", file=sys.stderr, flush=True)
    server = HTTPServer((host, port), Handler)
    print(f"Server ready!", file=sys.stderr, flush=True)
    server.serve_forever()
