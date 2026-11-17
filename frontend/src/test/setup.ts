import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { Modal, message, notification } from 'antd';

// jsdom doesn't implement these; several Radix/antd components touch them.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}
if (!window.ResizeObserver) {
  window.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  }));
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
// Radix primitives call the Pointer Capture API, which jsdom doesn't implement.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

// antd's static APIs (Modal.confirm, message, notification) render into their own React roots, which
// Testing Library's cleanup() never sees. Their close animation unmounts them on a later timer; when that
// fired after the last test file's environment was torn down, React threw "The `document` global was
// defined when React was initialized, but is not defined anymore" and the run failed with every test
// green (HEL-860 item 7: main red since pipeline 3683, 11-12; 4 of 5 local runs). Destroy them after
// each test and let their unmount run while jsdom is still there.
afterEach(async () => {
  cleanup();
  Modal.destroyAll();
  message.destroy();
  notification.destroy();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
