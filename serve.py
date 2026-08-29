#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
HOST = "127.0.0.1"
PORT = 8765
URL = f"http://{HOST}:{PORT}/web/"

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

def open_browser():
    webbrowser.open(URL)

if __name__ == "__main__":
    print(f"Serving: {ROOT}")
    print(f"Open: {URL}")
    threading.Timer(0.7, open_browser).start()
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
