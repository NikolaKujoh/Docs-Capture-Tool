"""Workbook-backed project. Images are served as original bytes, never re-encoded."""

import hashlib
import json
import logging
import os
import tempfile
import threading
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import portalocker
from openpyxl import load_workbook

LOG = logging.getLogger(__name__)
HEADERS = [
    "unique_capture_index", "batch", "issuing_country", "doc_type",
    "user_id-document_view", "device_os", "operational_device_model",
    "replay_device_type", "replay_device_model", "orientation", "status",
    "timestamp", "notes", "trustx_image", "instance_ID",
]
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}


class ProjectError(Exception):
    def __init__(self, detail, status=422):
        super().__init__(detail)
        self.detail, self.status = detail, status


def text(value):
    return str(value).strip() if value is not None else ""


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else hashlib.sha256(stream.read()).hexdigest()


def equipment_key(kind, model):
    return json.dumps([text(kind), text(model)], ensure_ascii=False, separators=(",", ":"))


def parse_filter(value):
    if not value:
        return None
    try:
        pair = json.loads(value)
    except (ValueError, TypeError) as error:
        raise ProjectError("Neispravan filter opreme.") from error
    if not isinstance(pair, list) or len(pair) != 2 or not all(isinstance(item, str) for item in pair):
        raise ProjectError("Filter mora sadržati tip i model uređaja.")
    return [item.strip() for item in pair]


class Project:
    def __init__(self, workbook_path, image_root, sheet_name=None, timezone="Europe/Belgrade", acquire_lock=True):
        self.path = Path(workbook_path).expanduser().resolve()
        self.root = Path(image_root).expanduser().resolve()
        if self.path.suffix.lower() != ".xlsx" or not self.path.is_file():
            raise ProjectError("Izaberi postojeći .xlsx fajl.")
        if not self.root.is_dir():
            raise ProjectError("Folder sa slikama ne postoji.")
        try:
            self.zone = ZoneInfo(timezone)
        except (ValueError, KeyError) as error:
            raise ProjectError("Nepoznata vremenska zona.") from error
        self.timezone = timezone
        self.mutex = threading.RLock()
        self.file_lock = portalocker.Lock(str(self.path) + ".onscreen.lock", timeout=0)
        self.owns_lock = False
        self.workbook = None
        try:
            if acquire_lock:
                self.file_lock.acquire()
                self.owns_lock = True
            self.revision = digest(self.path)
            self.workbook = load_workbook(self.path, data_only=False)
            if sheet_name and sheet_name not in self.workbook.sheetnames:
                raise ProjectError("Izabrani sheet ne postoji.")
            self.sheet = self.workbook[sheet_name] if sheet_name else self.workbook.worksheets[0]
            self._read_rows()
            self._index_images()
            if digest(self.path) != self.revision:
                raise ProjectError("Excel je promenjen tokom otvaranja. Pokušaj ponovo.", 409)
        except portalocker.exceptions.LockException as error:
            self.close()
            raise ProjectError("Ovaj Excel već koristi druga instanca aplikacije.", 409) from error
        except Exception:
            self.close()
            raise

    def close(self):
        if self.workbook is not None:
            self.workbook.close()
        if self.owns_lock:
            self.file_lock.release()
            self.owns_lock = False

    def check_revision(self):
        if not self.path.is_file() or digest(self.path) != self.revision:
            raise ProjectError("Excel je izmenjen spolja. Ponovo otvori projekat pre nastavka.", 409)

    def _read_rows(self):
        headers = [text(cell.value) for cell in self.sheet[1]]
        if len([item for item in headers if item]) != len(set(item for item in headers if item)):
            raise ProjectError("Sheet sadrži duplirana zaglavlja.")
        missing = [key for key in HEADERS if key not in headers]
        if missing:
            raise ProjectError("Nedostaju kolone: " + ", ".join(missing))
        self.columns = {key: headers.index(key) + 1 for key in HEADERS}
        self.rows, seen = [], set()
        for cells in self.sheet.iter_rows(min_row=2):
            if not any(cell.value is not None for cell in cells):
                continue
            row = {key: cells[column - 1].value for key, column in self.columns.items()}
            for key in ("unique_capture_index", "batch", "user_id-document_view"):
                if not text(row[key]) or cells[self.columns[key] - 1].data_type == "f":
                    raise ProjectError(f"Red {cells[0].row}: nedostaje ili je formula u {key}.")
            index_cell = cells[self.columns["unique_capture_index"] - 1]
            index = text(index_cell.value)
            if isinstance(index_cell.value, int) and set(index_cell.number_format) == {"0"}:
                index = index.zfill(len(index_cell.number_format))
            row["unique_capture_index"] = index
            row["batch"] = text(row["batch"])
            row["user_id-document_view"] = text(row["user_id-document_view"])
            identity = (row["batch"], index)
            if identity in seen:
                raise ProjectError(f"Dupliran capture index {index} u {row['batch']}.")
            seen.add(identity)
            identity_string = json.dumps([self.sheet.title, *identity], ensure_ascii=False)
            row["task_id"] = hashlib.sha256(identity_string.encode()).hexdigest()[:24]
            row["_row"] = cells[0].row
            self.rows.append(row)
        if not self.rows:
            raise ProjectError("Sheet nema capture zadatke.")
        self.batches = list(dict.fromkeys(row["batch"] for row in self.rows))
        self.by_id = {row["task_id"]: row for row in self.rows}

    def _index_images(self):
        self.images, self.image_errors = {}, {}
        files, folders = {}, {}
        for path in self.root.rglob("*"):
            if path.is_file() and path.suffix.lower() in EXTENSIONS:
                resolved = path.resolve()
                if resolved.is_relative_to(self.root):
                    files.setdefault(path.name.casefold(), []).append(resolved)
                    files.setdefault("stem:" + path.stem.casefold(), []).append(resolved)
                    folders.setdefault(path.parent.name.casefold(), []).append(resolved)
        for row in self.rows:
            name, batch = row["user_id-document_view"], row["batch"]
            if Path(name).name != name or "\\" in name or "/" in name:
                matches = []
            else:
                key = name.casefold() if Path(name).suffix.lower() in EXTENSIONS else "stem:" + name.casefold()
                candidates = files.get(key, [])
                matches = [path for path in candidates if any(part.casefold() == batch.casefold() for part in path.relative_to(self.root).parts[:-1]) or self.root.name.casefold() == batch.casefold()]
                if not matches:
                    # Some OneDrive batches use the sheet value as a folder name,
                    # containing one original image with a different filename.
                    matches = [path for path in folders.get(name.casefold(), []) if any(part.casefold() == batch.casefold() for part in path.relative_to(self.root).parts[:-1]) or self.root.name.casefold() == batch.casefold()]
            if len(matches) == 1:
                self.images[row["task_id"]] = matches[0]
            else:
                self.image_errors[row["task_id"]] = "Slika nedostaje." if not matches else "Više slika odgovara istom nazivu."

    def info(self):
        return {"batches": self.batches, "sheet_name": self.sheet.title,
                "timezone": self.timezone, "workbook_path": str(self.path),
                "warnings": [{"task_id": key, "detail": value} for key, value in self.image_errors.items()]}

    def current(self, batch, filters=None):
        filters = filters or {}
        capture = parse_filter(filters.get("capture_device"))
        replay = parse_filter(filters.get("replay_screen"))
        if batch not in self.batches:
            raise ProjectError("Batch ne postoji.", 404)
        all_rows = [row for row in self.rows if row["batch"] == batch]
        rows = [row for row in all_rows if
                (capture is None or capture == [text(row["device_os"]), text(row["operational_device_model"])]) and
                (replay is None or replay == [text(row["replay_device_type"]), text(row["replay_device_model"])])]
        pending = [row for row in rows if text(row["status"]).upper() == "TO DO"]
        task = None
        if pending:
            task = {key: value for key, value in pending[0].items() if not key.startswith("_")}
            task["timestamp"] = self.timestamp(task["timestamp"])
            task["revision"] = self.revision
            task["image_url"] = "/api/images/" + task["task_id"]
            task["image_error"] = self.image_errors.get(task["task_id"])
        def options(kind, model):
            pairs = list(dict.fromkeys((text(row[kind]), text(row[model])) for row in all_rows))
            return [{"value": equipment_key(*pair), "label": " · ".join(item for item in pair if item) or "Nepoznata oprema"} for pair in pairs]
        return {"task": task, "progress": {"total": len(rows), "done": sum(text(row["status"]).upper() == "DONE" for row in rows), "pending": len(pending)},
                "filter_options": {"capture_devices": options("device_os", "operational_device_model"), "replay_screens": options("replay_device_type", "replay_device_model")}}

    def image(self, task_id):
        if task_id not in self.by_id:
            raise ProjectError("Slika ne postoji.", 404)
        path = self.images.get(task_id)
        if path is None or not path.is_file() or not path.resolve().is_relative_to(self.root):
            raise ProjectError(self.image_errors.get(task_id, "Slika nije dostupna."), 404)
        return path

    def complete(self, task_id, batch, revision, filters=None):
        with self.mutex:
            self.check_revision()
            row = self.by_id.get(task_id)
            if row is None or row["batch"] != batch:
                raise ProjectError("Capture zadatak ne postoji u izabranom batch-u.", 404)
            # Validate filters before committing any change.
            self.current(batch, filters)
            if text(row["status"]).upper() == "DONE":
                return self.current(batch, filters)
            if revision != self.revision:
                raise ProjectError("Zastareo prikaz zadatka. Ponovo učitaj projekat.", 409)
            if text(row["status"]).upper() != "TO DO":
                raise ProjectError("Zadatak više nema status TO DO.", 409)
            self.image(task_id)
            timestamp = datetime.now(self.zone).isoformat(timespec="seconds")
            self._write([(self.sheet.cell(row["_row"], self.columns["status"]), "DONE"),
                         (self.sheet.cell(row["_row"], self.columns["timestamp"]), timestamp)])
            row["status"], row["timestamp"] = "DONE", timestamp
            LOG.info("Capture completed batch=%s index=%s", batch, row["unique_capture_index"])
            return self.current(batch, filters)

    def _write(self, changes):
        """Apply (cell, value) pairs, save atomically, roll the cells back on failure."""
        if self.path.with_name("~$" + self.path.name).exists():
            raise ProjectError("Excel je otvoren. Zatvori ga i pokušaj ponovo.", 409)
        previous = [(cell, cell.value) for cell, _ in changes]
        temporary = None
        try:
            for cell, value in changes:
                cell.value = value
            fd, temporary = tempfile.mkstemp(suffix=".xlsx", prefix=".onscreen-", dir=self.path.parent)
            os.close(fd)
            self.workbook.save(temporary)
            with open(temporary, "r+b") as stream:
                os.fsync(stream.fileno())
            self.check_revision()
            new_revision = digest(Path(temporary))
            os.replace(temporary, self.path)
            self.revision = new_revision
        except Exception as error:
            for cell, value in previous:
                cell.value = value
            if isinstance(error, ProjectError):
                raise
            LOG.exception("Workbook save failed")
            raise ProjectError("Excel nije sačuvan. Zatvori Excel, proveri dozvole i pokušaj ponovo.", 409) from error
        finally:
            if temporary and Path(temporary).exists():
                Path(temporary).unlink()

    def swap_device(self, batch, old_device, device_os, model, filters=None):
        """Replace a capture device on the batch's remaining TO DO rows."""
        with self.mutex:
            self.check_revision()
            old = parse_filter(old_device)
            device_os, model = text(device_os), text(model)
            if old is None:
                raise ProjectError("Izaberi uređaj koji menjaš.")
            if device_os not in ("Android", "iOS") or not model:
                raise ProjectError("Unesi OS (Android ili iOS) i model novog uređaja.")
            self.current(batch, filters)
            rows = [row for row in self.rows if row["batch"] == batch and text(row["status"]).upper() == "TO DO"
                    and old == [text(row["device_os"]), text(row["operational_device_model"])]]
            if not rows:
                raise ProjectError("Nema preostalih TO DO zadataka za izabrani uređaj.", 409)
            self._write([(self.sheet.cell(row["_row"], self.columns[key]), value)
                         for row in rows for key, value in (("device_os", device_os), ("operational_device_model", model))])
            for row in rows:
                row["device_os"], row["operational_device_model"] = device_os, model
            LOG.info("Device swapped batch=%s rows=%d", batch, len(rows))
            return self.current(batch, filters)

    def timestamp(self, value):
        if isinstance(value, datetime):
            date = value
        elif isinstance(value, str):
            try:
                date = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        else:
            return None
        if date.tzinfo is None:
            date = date.replace(tzinfo=self.zone)
        return date.isoformat()

    def records(self):
        return {"records": [{"task_id": row["task_id"], "batch": row["batch"], "status": text(row["status"]), "timestamp": self.timestamp(row["timestamp"])} for row in self.rows]}

    def dashboard(self):
        result = []
        for batch in self.batches:
            counts = Counter(text(row["status"]).upper() for row in self.rows if row["batch"] == batch)
            result.append({"name": batch, "total": sum(counts.values()), "captured": counts["DONE"], "labelled": None, "validated": None, "recaptures": None})
        return {"batches": result, "source": "Excel", "updated_at": datetime.now(self.zone).isoformat(), "workbook_path": str(self.path)}
