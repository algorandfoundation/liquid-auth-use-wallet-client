// globalSetup.ts
import { JSDOM } from 'jsdom';

// Setup jsdom
const { window } = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
global.window = window;
global.document = window.document;
global.self = window; // Define `self` for the qr library