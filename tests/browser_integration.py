"""Real backend + browser + temporary XLSX integration, no operator data required."""

import base64
import socket
import tempfile
import threading
import time
from pathlib import Path

import uvicorn
from openpyxl import Workbook, load_workbook
from playwright.sync_api import expect, sync_playwright

from onscreen.project import HEADERS
from onscreen.web import create_app


def run():
    with tempfile.TemporaryDirectory() as temporary, socket.socket() as sock:
        root = Path(temporary)
        images = root / "batch_10"
        images.mkdir()
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=')
        (images / "sample.png").write_bytes(png)
        workbook = Workbook()
        workbook.active.append(HEADERS)
        for index in ('001', '002'):
            data = dict.fromkeys(HEADERS, '')
            data.update(unique_capture_index=index, batch='batch_10', issuing_country='usa',
                        doc_type='id_card', device_os='Android', operational_device_model='Pixel',
                        replay_device_type='Monitor', replay_device_model='Dell', orientation='Portrait',
                        status='TO DO', **{'user_id-document_view': 'sample'})
            workbook.active.append([data[key] for key in HEADERS])
        path = root / 'capture.xlsx'
        workbook.save(path)
        workbook.close()
        sock.bind(('127.0.0.1', 0))
        sock.listen(128)
        server = uvicorn.Server(uvicorn.Config(create_app(), log_level='error'))
        thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
        thread.start()
        try:
            for _ in range(100):
                if server.started:
                    break
                time.sleep(.05)
            assert server.started
            url = f'http://127.0.0.1:{sock.getsockname()[1]}'
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                page = browser.new_page()
                page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(url + '/?mode=api')
                page.locator('#workbook-path').fill(str(path))
                page.locator('#image-root').fill(str(root))
                page.locator('#connect-project').click()
                expect(page.locator('#next-task')).to_be_enabled()
                expect(page.locator('#capture-index')).to_have_text('001')
                page.locator('#capture-device-select').select_option(label='Android · Pixel')
                expect(page.locator('#next-task')).to_be_enabled()
                page.locator('#next-task').click()
                expect(page.locator('#capture-index')).to_have_text('002')
                page.reload()
                expect(page.locator('#capture-index')).to_have_text('002')
                expect(page.locator('#next-task')).to_be_enabled()
                page.locator('#copy-daily-report').click()
                expect(page.locator('#daily-report-status')).to_contain_text('izveštaj je kopiran')
                assert 'Danas capture-ovano: 1' in page.evaluate('navigator.clipboard.readText()')
                page.get_by_role('link', name='Dashboard', exact=True).click()
                expect(page.locator('#batch-rows')).to_contain_text('batch_10')
                expect(page.locator('#summary')).to_contain_text('Nije dostupno')
                page.locator('#copy-report').click()
                expect(page.locator('#report-status')).to_contain_text('je kopiran')
                report = page.evaluate('navigator.clipboard.readText()')
                assert 'Trenutno capture-ovano: 1/2' in report
                assert 'DEMO' not in report
                page.get_by_role('link', name='Otvori capture workspace ↗').click()
                expect(page.locator('#capture-index')).to_have_text('002')
                expect(page.locator('#next-task')).to_be_enabled()
                page.locator('#next-task').click()
                expect(page.locator('#completed-panel')).to_be_visible()
                assert not errors, errors
                browser.close()
            check = load_workbook(path)
            assert [check.active.cell(row, 11).value for row in (2, 3)] == ['DONE', 'DONE']
            assert all(check.active.cell(row, 12).value for row in (2, 3))
            check.close()
            assert (images / 'sample.png').read_bytes() == png
            print('Integrated browser/backend test passed: real XLSX save, resume, filters, clipboard, dashboard, original image.')
        finally:
            server.should_exit = True
            thread.join(timeout=10)


if __name__ == '__main__':
    run()
