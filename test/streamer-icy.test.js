const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const Streamer = require('../src/streamer');

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.chunks = [];
    this.writableEnded = false;
  }

  write(chunk) {
    this.chunks.push(Buffer.from(chunk));
  }

  body() {
    return Buffer.concat(this.chunks);
  }
}

function makeStreamer(currentTrack) {
  const streamer = new Streamer({
    getCurrentTrack: () => currentTrack
  });
  streamer.isStreaming = true;
  return streamer;
}

function parseFirstIcyBlock(buffer, metaint) {
  const lengthByteOffset = metaint;
  const length = buffer[lengthByteOffset];
  const payloadStart = lengthByteOffset + 1;
  const payloadEnd = payloadStart + (length * 16);
  const payload = buffer.subarray(payloadStart, payloadEnd).toString('utf8').replace(/\0+$/, '');
  return {
    audioBefore: buffer.subarray(0, metaint),
    length,
    payload,
    remainder: buffer.subarray(payloadEnd)
  };
}

function stripIcyBlocks(buffer, metaint) {
  const chunks = [];
  let offset = 0;

  while (offset < buffer.length) {
    const audioEnd = Math.min(offset + metaint, buffer.length);
    chunks.push(buffer.subarray(offset, audioEnd));
    offset = audioEnd;

    if (offset >= buffer.length) break;

    const length = buffer[offset];
    offset += 1 + (length * 16);
  }

  return Buffer.concat(chunks);
}

test('raw clients receive byte-identical audio without ICY metadata', () => {
  const audio = Buffer.from('abcdefghijklmnop');
  const streamer = makeStreamer({ artist: 'Pool Artist', title: 'Pool Title' });
  const res = new FakeResponse();

  streamer.addClient(res);
  streamer.broadcast(audio);

  assert.deepEqual(res.body(), audio);
});

test('ICY clients receive StreamTitle blocks after each metadata interval', () => {
  const streamer = makeStreamer({ artist: 'Pool Artist', title: 'Pool Title' });
  const res = new FakeResponse();

  streamer.addClient(res, { icyMetadata: true, metaint: 4 });
  streamer.broadcast(Buffer.from('abcdefgh'));

  const block = parseFirstIcyBlock(res.body(), 4);
  assert.deepEqual(block.audioBefore, Buffer.from('abcd'));
  assert.equal(block.payload, "StreamTitle='Pool Artist - Pool Title';");
  assert.deepEqual(stripIcyBlocks(res.body(), 4), Buffer.from('abcdefgh'));
});

test('ICY clients receive an empty metadata block when no track is current', () => {
  const streamer = makeStreamer(null);
  const res = new FakeResponse();

  streamer.addClient(res, { icyMetadata: true, metaint: 4 });
  streamer.broadcast(Buffer.from('abcdefgh'));

  const block = parseFirstIcyBlock(res.body(), 4);
  assert.equal(block.length, 0);
  assert.equal(block.payload, '');
  assert.deepEqual(stripIcyBlocks(res.body(), 4), Buffer.from('abcdefgh'));
});

test('ICY StreamTitle sanitises quotes, CR/LF, NUL, and long titles', () => {
  const streamer = makeStreamer({
    artist: "Pool'Artist\r\n\0",
    title: `${'Long '.repeat(200)}Title`
  });
  const res = new FakeResponse();

  streamer.addClient(res, { icyMetadata: true, metaint: 4 });
  streamer.broadcast(Buffer.from('abcdefgh'));

  const block = parseFirstIcyBlock(res.body(), 4);
  assert.ok(block.length <= 255);
  assert.match(block.payload, /^StreamTitle='/);
  assert.match(block.payload, /PoolArtist - Long Long/);
  assert.doesNotMatch(block.payload, /Pool'Artist|\r|\n|\0/);
});

test('closed clients are removed from the streamer', () => {
  const streamer = makeStreamer({ artist: 'Pool Artist', title: 'Pool Title' });
  const res = new FakeResponse();

  streamer.addClient(res, { icyMetadata: true, metaint: 4 });
  assert.equal(streamer.clients.size, 1);

  res.emit('close');
  assert.equal(streamer.clients.size, 0);
});
