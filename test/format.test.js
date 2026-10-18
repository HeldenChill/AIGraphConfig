import test from 'node:test';
import assert from 'node:assert/strict';
import { compact, exact, money } from '../public/format.js';

test('compact', () => {
  assert.equal(compact(950), '950');
  assert.equal(compact(1500), '1.5k');
  assert.equal(compact(412000), '412k');
  assert.equal(compact(4600000), '4.6M');
  assert.equal(compact(null), '–');
});

test('exact', () => {
  assert.equal(exact(412345), '412,345');
});

test('money', () => {
  assert.equal(money(1.234), '$1.23');
  assert.equal(money(1234.5), '$1,234.50');
  assert.equal(money(0.004), '<$0.01');
  assert.equal(money(0), '$0.00');
  assert.equal(money(null), 'no price');
});
