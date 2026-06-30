const assert = require('node:assert/strict');
const test = require('node:test');
const { configureStreamResponse } = require('../src/stream-response');
const Streamer = require('../src/streamer');

function makeReq(headers = {}) {
  const normalised = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get(name) {
      return normalised[name.toLowerCase()];
    }
  };
}

function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    }
  };
}

const streamer = {
  channelName: 'Poolsuite FM'
};

test('stream response without Icy-MetaData omits icy-metaint', () => {
  const res = makeRes();

  const options = configureStreamResponse(makeReq(), res, streamer);

  assert.equal(res.headers['content-type'], 'audio/mpeg');
  assert.equal(res.headers['icy-name'], 'Skinnydip - Poolsuite FM');
  assert.equal(res.headers['icy-metaint'], undefined);
  assert.deepEqual(options, {
    icyMetadata: false,
    metaint: Streamer.ICY_META_INTERVAL
  });
});

test('stream response with Icy-MetaData: 1 includes icy-metaint', () => {
  const res = makeRes();

  const options = configureStreamResponse(makeReq({ 'Icy-MetaData': '1' }), res, streamer);

  assert.equal(res.headers['content-type'], 'audio/mpeg');
  assert.equal(res.headers['icy-name'], 'Skinnydip - Poolsuite FM');
  assert.equal(res.headers['icy-genre'], 'Electronic');
  assert.equal(res.headers['icy-br'], '128');
  assert.equal(res.headers['icy-metaint'], String(Streamer.ICY_META_INTERVAL));
  assert.deepEqual(options, {
    icyMetadata: true,
    metaint: Streamer.ICY_META_INTERVAL
  });
});
