#!/usr/bin/env python3
"""A stand-in for the Messages API that demo/demo.tape records against.

Every message gets the same short answer, reported as answered over CONTEXT_TOKENS
input tokens: 78% of the 1M-token window of the default model, past the mod's
warning level. Nothing leaves the machine: it listens on 127.0.0.1 only.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONTEXT_TOKENS = 780_000
ANSWER = "add-dark-mode is at 4 of 7 tasks: the theme tokens, the system preference, the toggle and the persisted choice are done. The charts, screenshots and docs remain."


def usage():
    return {"input_tokens": 12, "cache_creation_input_tokens": 0, "cache_read_input_tokens": CONTEXT_TOKENS - 12, "output_tokens": 40}


def message(model):
    return {
        "id": "msg_demo",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": ANSWER}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": usage(),
    }


def events(model):
    start = message(model) | {"content": [], "stop_reason": None, "usage": usage() | {"output_tokens": 1}}
    yield "message_start", {"type": "message_start", "message": start}
    yield "content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}
    for word in ANSWER.split(" "):
        yield "content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": word + " "}}
    yield "content_block_stop", {"type": "content_block_stop", "index": 0}
    yield "message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 40}}
    yield "message_stop", {"type": "message_stop"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(404, {"type": "error", "error": {"type": "not_found_error", "message": self.path}})

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
        path = self.path.split("?")[0]
        if path.endswith("/messages/count_tokens"):
            return self.reply(200, {"input_tokens": 2_000})
        if not path.endswith("/messages"):
            return self.do_GET()
        model = request.get("model", "claude")
        if not request.get("stream"):
            return self.reply(200, message(model))
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for name, data in events(model):
            self.wfile.write(f"event: {name}\ndata: {json.dumps(data)}\n\n".encode())
            self.wfile.flush()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
