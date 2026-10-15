"""Servidor de desenvolvimento do painel: serve site/ sem cache (o navegador sempre pega a versão atual).

    python scripts/servidor_local.py          # http://localhost:8765
    python scripts/servidor_local.py 8000     # outra porta
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class SemCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    servidor = ThreadingHTTPServer(("127.0.0.1", porta), partial(SemCache, directory=str(SITE)))
    print(f"Painel em http://localhost:{porta}  (Ctrl+C para parar)")
    servidor.serve_forever()
