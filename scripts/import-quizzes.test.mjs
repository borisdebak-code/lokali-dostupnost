import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './import-quizzes.mjs';

test('CSV s navodnicima, zarezima i praznim redovima', () => {
  const rows = parseCsv('organizator,lokal,dan,napomena\r\nFast Facts Trivia,"Test, bar",uto,"Rezervacija ""obavezna"""\n\n,Drugi,sri,\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lokal, 'Test, bar');
  assert.equal(rows[0].napomena, 'Rezervacija "obavezna"');
  assert.equal(rows[1].organizator, '');
  assert.equal(rows[1].dan, 'sri');
});
