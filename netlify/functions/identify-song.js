// Runs server-side on Netlify, so it can fetch the Icecast stream directly
// without hitting the browser CORS restrictions that block a client-side
// fetch of the raw stream (Icecast servers generally don't send
// Access-Control-Allow-Origin headers).

const STREAM_URL = 'https://sunny-radio-server.cloud-ip.cc/radio/sunnyradio';
const AUDD_API_KEY = process.env.AUDD_API_KEY || '4fed52fcbd5617df4b447455f6f3b74f';
const TARGET_BYTES = 180000; // ~9s of audio at 160kbps, keeps us well inside the function time limit
const STREAM_TIMEOUT_MS = 7000;

exports.handler = async function () {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    const streamResp = await fetch(STREAM_URL, { signal: controller.signal });
    if (!streamResp.ok || !streamResp.body) {
      clearTimeout(timeout);
      return jsonResponse(502, { status: 'error', error: { error_message: 'Could not reach the live stream.' } });
    }

    const reader = streamResp.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < TARGET_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    try { reader.cancel(); } catch (e) {}
    clearTimeout(timeout);

    if (total < 20000) {
      return jsonResponse(502, { status: 'error', error: { error_message: 'Not enough audio captured from the stream.' } });
    }

    const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
    const form = new FormData();
    form.append('api_token', AUDD_API_KEY);
    form.append('file', audioBlob, 'clip.mp3');
    form.append('return', 'spotify,apple_music');

    const auddResp = await fetch('https://api.audd.io/', { method: 'POST', body: form });
    const result = await auddResp.json();

    return jsonResponse(200, result);
  } catch (err) {
    return jsonResponse(500, { status: 'error', error: { error_message: String((err && err.message) || err) } });
  }
};

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  };
}
