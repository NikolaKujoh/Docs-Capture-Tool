"""Optional browser smoke checks. Requires Playwright + Chromium, development only."""

import functools
import json
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1100})
        page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        expect(page.locator('#next-task')).to_be_enabled()
        page.evaluate("localStorage.setItem('onscreen.theme', 'light')")
        page.reload()
        expect(page.locator('#next-task')).to_be_enabled()
        page.locator('#theme-toggle').click()
        expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
        page.get_by_role('button', name='? Help', exact=True).click()
        expect(page.locator('#help-dialog')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#help-dialog')).not_to_be_visible()
        page.reload()
        expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
        page.goto(url + '/dashboard.html')
        expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
        page.get_by_role('button', name='? Help', exact=True).click()
        expect(page.locator('#help-dialog')).to_contain_text('Kako se koristi dashboard')
        page.keyboard.press('Escape')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.goto(url)
        expect(page.locator('#next-task')).to_be_enabled()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.set_viewport_size({'width': 1440, 'height': 1100})
        expect(page.locator('#capture-index')).to_have_text('3146')
        page.locator('#capture-device-select').select_option(label='iOS · iPhone 15')
        expect(page.locator('#capture-index')).to_have_text('3242')
        page.locator('#replay-screen-select').select_option(label='Tablet · iPad Air')
        expect(page.locator('#capture-index')).to_have_text('3290')
        page.locator('#capture-device-select').select_option(label='Android · Google Pixel 8a')
        expect(page.locator('#completed-title')).to_have_text('Nema zadataka za ovu kombinaciju.')
        page.locator('#clear-filters').click()
        expect(page.locator('#capture-index')).to_have_text('3146')
        page.locator('#toggle-index').click()
        expect(page.locator('#index-overlay')).to_be_visible()
        expect(page.locator('#overlay-value')).to_have_text('3146')
        page.locator('#zoom-in').click()
        expect(page.locator('#zoom-level')).to_have_text('120%')
        page.locator('#fit-image').click()
        expect(page.locator('#zoom-level')).to_have_text('100%')
        page.locator('#next-task').click()
        expect(page.locator('#capture-index')).to_have_text('3148')
        page.locator('#copy-daily-report').click()
        expect(page.locator('#daily-report-status')).to_contain_text('izveštaj je kopiran')
        report = page.evaluate('navigator.clipboard.readText()')
        assert 'Danas capture-ovano: 1' in report
        assert 'Za jedan capture' in report
        expect(page.locator('#index-overlay')).to_be_hidden()
        page.reload()
        expect(page.locator('#next-task')).to_be_enabled()
        expect(page.locator('#capture-index')).to_have_text('3148')
        page.locator('#batch-select').select_option('batch_11')
        expect(page.locator('#capture-index')).to_have_text('3500')
        page.locator('#next-task').click()
        expect(page.locator('#capture-index')).to_have_text('3502')
        expect(page.locator('#next-task')).to_be_enabled()
        page.locator('#next-task').click()
        expect(page.locator('#completed-panel')).to_be_visible()
        page.locator('#copy-daily-report').click()
        expect(page.locator('#daily-report-status')).to_contain_text('izveštaj je kopiran')
        report = page.evaluate('navigator.clipboard.readText()')
        assert 'Danas capture-ovano: 3' in report
        assert 'batch_10: 1' in report and 'batch_11: 2' in report
        page.locator('#batch-select').select_option('batch_10')
        expect(page.locator('#next-task')).to_be_enabled()
        page.screenshot(path=str(Path(tempfile.gettempdir()) / 'onscreen-desktop.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(Path(tempfile.gettempdir()) / 'onscreen-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1100})

        # Exercise real API adapter with controlled backend responses.
        task = page.evaluate("async () => { const {DemoClient} = await import('./api.js'); return (await new DemoClient({getItem:()=>null,setItem:()=>{}}).getBatch('batch_10')).task; }")
        task['task_id'] = 'real-3146'
        task['revision'] = 'v1'
        current = {'task': task, 'progress': {'total': 1, 'done': 0, 'pending': 1}}
        calls = []

        def route_api(route):
            calls.append(route.request.url)
            if route.request.url.endswith('/session'):
                data = {'token': 'mock-session', 'project': None}
            elif route.request.url.endswith('project/open'):
                data = {'batches': ['batch_10']}
            elif route.request.url.endswith('/current'):
                data = current
            else:
                route.fulfill(status=409, content_type='application/json', body=json.dumps({'detail': 'Excel je zaključan.'}))
                return
            route.fulfill(content_type='application/json', body=json.dumps(data))

        page.route('**/api/**', route_api)
        page.goto(url + '/?mode=api')
        page.locator('#workbook-path').fill('C:\\CaptureData\\input.xlsx')
        page.locator('#image-root').fill('C:\\CaptureData\\images')
        page.locator('#connect-project').click()
        expect(page.locator('#next-task')).to_be_enabled()
        page.locator('#next-task').click()
        expect(page.locator('#error-banner')).to_contain_text('Excel je zaključan.')
        expect(page.locator('#capture-index')).to_have_text('3146')
        expect(page.locator('#save-status')).to_have_text('Nije sačuvano')
        expect(page.locator('#next-task')).to_be_enabled()
        page.locator('#retry').click()
        expect(page.locator('#save-status')).to_have_text('Nije sačuvano')
        assert len([item for item in calls if item.endswith('/complete')]) == 2
        assert not errors, errors
        browser.close()
        print('Browser smoke checks passed: viewer, index reset, resume, batches, mobile layout, API save failure/retry.')
finally:
    server.shutdown()
    server.server_close()
