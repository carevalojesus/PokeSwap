import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const catalog = JSON.parse(
  await readFile('src/shared/catalog/species.json', 'utf8'),
);
const sources = JSON.parse(
  await readFile('src/shared/catalog/sources.json', 'utf8'),
);
assert.deepEqual(
  catalog.map(({ id }) => id),
  Array.from({ length: 151 }, (_, i) => i + 1),
);
assert.equal(new Set(catalog.map(({ name }) => name)).size, 151);
assert.equal(sources.images.length, 151);
assert.match(sources.dataRevision, /^[a-f0-9]{40}$/);
assert.match(sources.artRevision, /^[a-f0-9]{40}$/);
const files = (await readdir('public/pokemon')).filter((name) =>
  name.endsWith('.png'),
);
assert.equal(files.length, 151);
for (const [index, species] of catalog.entries()) {
  assert.equal(species.imagePath, `/pokemon/${species.id}.png`);
  const bytes = await readFile(`public${species.imagePath}`);
  const source = sources.images[index];
  assert.equal(source.id, species.id);
  assert.equal(source.bytes, bytes.length);
  assert.equal(source.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 475);
  assert.equal(bytes.readUInt32BE(20), 475);
}
console.log(
  'OK catalog: 151 consecutive species, local PNG assets and SHA-256 checksums.',
);
