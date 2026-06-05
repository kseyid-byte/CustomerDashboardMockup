import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class StaticAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        requested_path = self.path.split("?", 1)[0].split("#", 1)[0]
        local_path = (ROOT / requested_path.lstrip("/")).resolve()

        if requested_path != "/" and not local_path.exists() and self._accepts_html():
            self.path = "/index.html"

        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _accepts_html(self):
        return "text/html" in self.headers.get("Accept", "")


def app_port():
    return int(os.environ.get("DATABRICKS_APP_PORT") or os.environ.get("PORT") or "5173")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", app_port()), StaticAppHandler)
    print(f"Serving Customer Cockpit mockup on port {app_port()}", flush=True)
    server.serve_forever()
