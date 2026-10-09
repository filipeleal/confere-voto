import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createAnalytics } from '../lib/analytics.mjs';

test('analytics remains disabled without a measurement ID', () => {
  const analytics = createAnalytics();
  assert.equal(analytics.enabled, false);
  assert.equal(analytics.script, '');
  assert.equal(analytics.inject('<head></head>'), '<head></head>');
  assert.ok(!analytics.csp.includes('google'));
});

test('analytics rejects malformed configuration', () => {
  for (const id of ['UA-123', 'G-ABC\"', 'G-', 'G-ABC<script>']) {
    assert.throws(() => createAnalytics(id), /GOOGLE_ANALYTICS_ID/);
  }
});

test('analytics initializes once and asynchronously loads the Google tag', () => {
  const analytics = createAnalytics(' G-TEST12345 ');
  const tags = [];
  const window = {};
  runInNewContext(analytics.script, {
    window,
    document: {
      createElement: () => ({}),
      head: { appendChild: tag => tags.push(tag) },
    },
  });
  assert.equal(window.dataLayer.length, 2);
  assert.equal(window.dataLayer[1][0], 'config');
  assert.equal(window.dataLayer[1][1], 'G-TEST12345');
  assert.equal(window.dataLayer[1][2].allow_google_signals, false);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].async, true);
  assert.equal(tags[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST12345');
  assert.ok(analytics.csp.includes('https://*.google-analytics.com'));
  assert.ok(!analytics.csp.includes('unsafe-inline'));
});

test('all public pages receive one Analytics bootstrap in their head', async () => {
  const analytics = createAnalytics('G-TEST12345');
  for (const file of ['index.html', 'arrival-map.html', 'offices.html']) {
    const html = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
    const result = analytics.inject(html);
    assert.equal(result.match(/src="\/analytics.js"/g)?.length, 1);
    assert.ok(result.indexOf('/analytics.js') < result.indexOf('</head>'));
  }
});
