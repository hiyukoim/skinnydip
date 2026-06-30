const Streamer = require('./streamer');

function configureStreamResponse(req, res, streamer) {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('icy-name', `Skinnydip - ${streamer.channelName}`);
  res.setHeader('icy-genre', 'Electronic');
  res.setHeader('icy-br', '128');

  const icyMetadata = req.get('Icy-MetaData') === '1';
  if (icyMetadata) {
    res.setHeader('icy-metaint', String(Streamer.ICY_META_INTERVAL));
  }

  return {
    icyMetadata,
    metaint: Streamer.ICY_META_INTERVAL
  };
}

module.exports = {
  configureStreamResponse
};
