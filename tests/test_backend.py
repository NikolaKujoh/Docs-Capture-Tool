import hashlib
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

from onscreen.project import HEADERS, Project, ProjectError, equipment_key
from onscreen.web import create_app


@pytest.fixture
def dataset(tmp_path):
    root = tmp_path / "images"
    batch = root / "batch_10"
    batch.mkdir(parents=True)
    # Bytes are deliberately not decoded by the backend.
    (batch / "sample-front.png").write_bytes(b"original-image-bytes\x00\xff")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Capture"
    sheet.append(HEADERS + ["extra"])
    for index, os_name, model in [("001", "Android", "Pixel"), ("002", "iOS", "iPhone"), ("003", "Android", "Pixel")]:
        data = dict.fromkeys(HEADERS)
        data.update(unique_capture_index=index, batch="batch_10", issuing_country="usa", doc_type="id_card",
                    **{"user_id-document_view": "sample-front"}, device_os=os_name,
                    operational_device_model=model, replay_device_type="Monitor", replay_device_model="Dell",
                    orientation="Portrait", status=" to do ", notes="keep me", instance_ID="instance")
        sheet.append([data[key] for key in HEADERS] + ["=1+2"])
    sheet["A2"].font = Font(bold=True, color="FF0000")
    workbook.create_sheet("Other")["A1"] = "untouched"
    path = tmp_path / "capture.xlsx"
    workbook.save(path)
    workbook.close()
    return path, root


def open_client(client, dataset):
    token = client.get("/api/session").json()["token"]
    client.headers["X-OnScreen-Token"] = token
    response = client.post("/api/project/open", json={"workbook_path": str(dataset[0]), "image_root": str(dataset[1])})
    assert response.status_code == 200, response.text
    return response.json()


def test_complete_resume_original_bytes_and_workbook_preservation(dataset):
    path, root = dataset
    original_image = (root / "batch_10/sample-front.png").read_bytes()
    with TestClient(create_app()) as client:
        open_client(client, dataset)
        task = client.get("/api/batches/batch_10/current").json()["task"]
        assert task["unique_capture_index"] == "001"
        response = client.get(task["image_url"])
        assert hashlib.sha256(response.content).digest() == hashlib.sha256(original_image).digest()
        body = {"batch": "batch_10", "revision": task["revision"]}
        result = client.post(f"/api/tasks/{task['task_id']}/complete", json=body)
        assert result.status_code == 200, result.text
        assert result.json()["task"]["unique_capture_index"] == "002"
        records = client.get("/api/reports/captures").json()["records"]
        timestamp = records[0]["timestamp"]
        assert datetime.fromisoformat(timestamp).tzinfo is not None
        assert client.post(f"/api/tasks/{task['task_id']}/complete", json=body).status_code == 200
        assert client.get("/api/reports/captures").json()["records"][0]["timestamp"] == timestamp
        assert client.get("/api/reports/dashboard").json()["batches"][0]["captured"] == 1
        assert client.get("/api/reports/dashboard").json()["batches"][0]["labelled"] is None
    with TestClient(create_app()) as client:
        open_client(client, dataset)
        assert client.get("/api/batches/batch_10/current").json()["task"]["unique_capture_index"] == "002"
    wb = load_workbook(path)
    assert wb["Capture"]["K2"].value == "DONE"
    assert wb["Capture"]["M2"].value == "keep me"
    assert wb["Capture"]["P2"].value == "=1+2"
    assert wb["Capture"]["A2"].font.bold
    assert wb["Other"]["A1"].value == "untouched"
    wb.close()


def test_filtered_complete_and_empty_combination(dataset):
    with TestClient(create_app()) as client:
        open_client(client, dataset)
        filters = {"capture_device": equipment_key("Android", "Pixel")}
        current = client.get("/api/batches/batch_10/current", params=filters).json()
        assert current["progress"]["total"] == 2
        task = current["task"]
        result = client.post(f"/api/tasks/{task['task_id']}/complete", json={"batch": "batch_10", "revision": task["revision"], "filters": filters}).json()
        assert result["task"]["unique_capture_index"] == "003"
        assert result["progress"]["done"] == 1
        assert len(result["filter_options"]["capture_devices"]) == 2
        assert client.get("/api/batches/batch_10/current", params={"capture_device": '[]'}).status_code == 422
        empty = client.get("/api/batches/batch_10/current", params={"capture_device": equipment_key("Other", "Other")}).json()
        assert empty["task"] is None and empty["progress"]["total"] == 0


def test_failed_save_and_external_change(dataset):
    project = Project(str(dataset[0]), str(dataset[1]))
    try:
        task = project.current("batch_10")["task"]
        with patch("onscreen.project.os.replace", side_effect=PermissionError("locked")):
            with pytest.raises(ProjectError, match="nije sačuvan"):
                project.complete(task["task_id"], "batch_10", task["revision"])
        assert project.current("batch_10")["task"]["status"].strip() == "to do"
        assert not list(dataset[0].parent.glob(".onscreen-*.xlsx"))
        wb = load_workbook(dataset[0])
        wb.active["M2"] = "external edit"
        wb.save(dataset[0]); wb.close()
        with pytest.raises(ProjectError, match="izmenjen spolja"):
            project.complete(task["task_id"], "batch_10", task["revision"])
    finally:
        project.close()


def test_lock_duplicate_validation_and_missing_images(dataset):
    first = Project(str(dataset[0]), str(dataset[1]))
    try:
        with pytest.raises(ProjectError, match="druga instanca"):
            Project(str(dataset[0]), str(dataset[1]))
    finally:
        first.close()
    (dataset[1] / "batch_10/sample-front.png").unlink()
    project = Project(str(dataset[0]), str(dataset[1]))
    try:
        assert len(project.info()["warnings"]) == 3
        task = project.current("batch_10")["task"]
        with pytest.raises(ProjectError, match="nedostaje"):
            project.complete(task["task_id"], "batch_10", task["revision"])
    finally:
        project.close()
    wb = load_workbook(dataset[0]); wb.active["A3"] = "001"; wb.save(dataset[0]); wb.close()
    with pytest.raises(ProjectError, match="Dupliran"):
        Project(str(dataset[0]), str(dataset[1]))


def test_session_security_and_invalid_reopen_preserves_project(dataset):
    with TestClient(create_app()) as client:
        assert client.post("/api/project/open", json={}).status_code == 403
        open_client(client, dataset)
        bad = client.post("/api/project/open", json={"workbook_path": str(dataset[0]), "image_root": "not-found"})
        assert bad.status_code == 422
        assert client.get("/api/batches/batch_10/current").status_code == 200
        assert client.post("/api/project/open", headers={"Origin": "http://other-site"}, json={}).status_code == 403
        assert client.get("/api/session", headers={"host": "other-site"}).status_code == 400


def test_document_folder_with_different_filename_and_ambiguity(dataset):
    batch = dataset[1] / "batch_10"
    document = batch / "sample-front"
    document.mkdir()
    (batch / "sample-front.png").rename(document / "original-research-photo.jpg")
    project = Project(str(dataset[0]), str(dataset[1]))
    try:
        task = project.current("batch_10")["task"]
        assert project.image(task["task_id"]).name == "original-research-photo.jpg"
        assert not project.image_errors
    finally:
        project.close()
    (document / "another.jpg").write_bytes(b"ambiguous")
    project = Project(str(dataset[0]), str(dataset[1]))
    try:
        assert len(project.image_errors) == 3
        assert all("Više slika" in value for value in project.image_errors.values())
    finally:
        project.close()


def test_swap_device_changes_only_remaining_rows(dataset):
    with TestClient(create_app()) as client:
        open_client(client, dataset)
        task = client.get("/api/batches/batch_10/current").json()["task"]
        client.post(f"/api/tasks/{task['task_id']}/complete", json={"batch": "batch_10", "revision": task["revision"]})
        body = {"batch": "batch_10", "old_device": equipment_key("Android", "Pixel"), "device_os": "iOS", "model": "iPhone 15"}
        assert client.post("/api/devices/swap", json={**body, "device_os": "Windows"}).status_code == 422
        assert client.post("/api/devices/swap", json={**body, "old_device": equipment_key("Android", "Nope")}).status_code == 409
        result = client.post("/api/devices/swap", json=body)
        assert result.status_code == 200, result.text
        assert result.json()["task"]["unique_capture_index"] == "002"
        values = [option["value"] for option in result.json()["filter_options"]["capture_devices"]]
        assert equipment_key("Android", "Pixel") not in values
        assert equipment_key("iOS", "iPhone 15") in values
    sheet = load_workbook(dataset[0])["Capture"]
    assert [sheet[f"{c}2"].value for c in "FG"] == ["Android", "Pixel"]  # DONE row untouched
    assert [sheet[f"{c}4"].value for c in "FG"] == ["iOS", "iPhone 15"]  # TO DO row swapped
