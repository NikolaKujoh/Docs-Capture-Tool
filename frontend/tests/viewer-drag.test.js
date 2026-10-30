import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageViewer } from '../viewer.js';

test('dragging index at zoom clamps it inside the image without panning the image', () => {
  const element = rect => ({
    style: {}, events: {}, classList: { add() {}, remove() {} },
    addEventListener(name, callback) { this.events[name] = callback; },
    getBoundingClientRect: () => rect, setPointerCapture() {},
  });
  const previous = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} };
  try {
    const viewport = element({});
    const layer = element({ left: 100, top: 50, width: 1000, height: 500 });
    const overlay = element({ left: 900, top: 80, width: 100, height: 50 });
    const viewer = new ImageViewer({ viewport, layer, overlay, image: {}, onReady() {} });
    viewer.ready = true;
    viewer.view = { x: 20, y: 30, scale: 2 };
    let stopped = false;
    overlay.events.pointerdown({ pointerId: 1, button: 0, clientX: 910, clientY: 90,
      stopPropagation() { stopped = true; }, preventDefault() {} });
    overlay.events.pointermove({ pointerId: 1, clientX: 560, clientY: 285 });
    assert.ok(stopped);
    assert.deepEqual(viewer.indexPosition, { x: .5, y: .5 });
    assert.deepEqual(viewer.view, { x: 20, y: 30, scale: 2 });
    overlay.events.pointermove({ pointerId: 1, clientX: -500, clientY: 2000 });
    assert.deepEqual(viewer.indexPosition, { x: 0, y: 1 });
    assert.equal(overlay.style.transform, 'translate(0%, -100%)');
    overlay.events.pointerup();
    assert.equal(viewer.indexDrag, null);
    layer.style.width = '800px';
    viewer.setIndexSize(150);
    assert.equal(viewer.indexSize, 1.5);
    assert.equal(overlay.style.fontSize, '90px');
    assert.deepEqual(viewer.indexPosition, { x: 0, y: 1 });
    viewer.sizeIndex(400);
    assert.equal(overlay.style.fontSize, '45px');
    viewer.setIndexSize(500);
    assert.equal(viewer.indexSize, 2);
    viewer.setIndexSize(0);
    assert.equal(viewer.indexSize, .5);
  } finally { globalThis.ResizeObserver = previous; }
});
