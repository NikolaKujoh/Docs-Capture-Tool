import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock, RLock
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .project import Project, ProjectError

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


class OpenProject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workbook_path: str = Field(min_length=1)
    image_root: str = Field(min_length=1)
    sheet_name: str | None = None
    timezone: str = "Europe/Belgrade"


class Browse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["file", "folder"]
    start: str = ""


def pick_path(kind, start=""):
    """Native Windows picker on the backend machine (the browser can't see real paths). '' = cancelled."""
    from tkinter import Tk, filedialog
    root = Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        folder = Path(start).expanduser() if start else None
        folder = folder if folder is None or folder.is_dir() else folder.parent
        options = {"parent": root, **({"initialdir": str(folder)} if folder and folder.is_dir() else {})}
        if kind == "file":
            path = filedialog.askopenfilename(filetypes=[("Excel", "*.xlsx")], **options)
        else:
            path = filedialog.askdirectory(mustexist=True, **options)
    finally:
        root.destroy()
    return str(Path(path)) if path else ""


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    capture_device: str = ""
    replay_screen: str = ""


class Complete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch: str
    revision: str
    filters: Filters = Field(default_factory=Filters)


class SwapDevice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch: str
    old_device: str
    device_os: str
    model: str
    filters: Filters = Field(default_factory=Filters)


def create_app():
    guard = RLock()
    picker = Lock()
    project = None
    token = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(_app):
        yield
        if project:
            project.close()

    app = FastAPI(title="OnScreen Capture API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])

    @app.middleware("http")
    async def local_access(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse({"detail": "Pristup sa drugog origin-a nije dozvoljen."}, status_code=403)
            if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get("x-onscreen-token") != token:
                return JSONResponse({"detail": "Sesija je istekla. Osveži stranicu."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(ProjectError)
    async def project_error(_request, error):
        return JSONResponse({"detail": error.detail}, status_code=error.status)

    def active():
        if project is None:
            raise ProjectError("Prvo otvori Excel projekat.", 409)
        project.check_revision()
        return project

    @app.get("/api/session")
    def session():
        return {"token": token, "project": project.info() if project else None}

    @app.post("/api/browse")
    def browse(settings: Browse):
        if not picker.acquire(blocking=False):
            raise ProjectError("Prozor za izbor je već otvoren.", 409)
        try:
            return {"path": pick_path(settings.kind, settings.start)}
        except Exception as error:
            logging.getLogger(__name__).exception("Browse failed")
            raise ProjectError("Izbor fajla nije dostupan. Unesi putanju ručno.", 409) from error
        finally:
            picker.release()

    @app.post("/api/project/open")
    def open_project(settings: OpenProject):
        nonlocal project
        with guard:
            path = Path(settings.workbook_path).expanduser().resolve()
            same_path = project is not None and project.path == path
            try:
                candidate = Project(**settings.model_dump(), acquire_lock=not same_path)
            except ProjectError:
                raise
            except (OSError, ValueError, KeyError) as error:
                raise ProjectError(f"Projekat nije moguće otvoriti: {error}") from error
            except Exception as error:
                logging.getLogger(__name__).exception("Project validation failed")
                raise ProjectError("Excel nije moguće pročitati. Proveri da je ispravan .xlsx fajl.") from error
            previous = project
            project = candidate
            if previous:
                if same_path:
                    candidate.file_lock, candidate.owns_lock = previous.file_lock, True
                    previous.owns_lock = False
                previous.close()
            return project.info()

    @app.get("/api/batches/{batch}/current")
    def current(batch: str, capture_device: str = "", replay_screen: str = ""):
        with guard:
            return active().current(batch, {"capture_device": capture_device, "replay_screen": replay_screen})

    @app.post("/api/tasks/{task_id}/complete")
    def complete(task_id: str, settings: Complete):
        with guard:
            return active().complete(task_id, settings.batch, settings.revision, settings.filters.model_dump())

    @app.post("/api/devices/swap")
    def swap_device(settings: SwapDevice):
        with guard:
            return active().swap_device(settings.batch, settings.old_device, settings.device_os, settings.model, settings.filters.model_dump())

    @app.get("/api/images/{image_id}")
    def image(image_id: str):
        with guard:
            path = active().image(image_id)
            return FileResponse(path)

    @app.get("/api/reports/captures")
    def records():
        with guard:
            return active().records()

    @app.get("/api/reports/dashboard")
    def dashboard():
        with guard:
            return active().dashboard()

    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
    return app
