import argparse
import logging
import os
import socket
import threading
import webbrowser
from logging.handlers import RotatingFileHandler
from pathlib import Path

import uvicorn

from .web import create_app


def main():
    parser = argparse.ArgumentParser(description="OnScreen local capture application")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    log_dir = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local" / "state")) / "OnScreenCaptureTool"
    log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler(), RotatingFileHandler(log_dir / "onscreen.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")], format="%(asctime)s %(levelname)s %(name)s %(message)s")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", args.port))
        sock.listen(128)
        port = sock.getsockname()[1]
        url = f"http://127.0.0.1:{port}/?mode=api"
        print(f"OnScreen: {url}\nCtrl+C za zaustavljanje. Log: {log_dir}")
        if not args.no_browser:
            threading.Timer(1, lambda: webbrowser.open(url)).start()
        server = uvicorn.Server(uvicorn.Config(create_app(), log_level="info"))
        server.run(sockets=[sock])


if __name__ == "__main__":
    main()
