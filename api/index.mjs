let app;
let initError;

try {
  const mod = await import('../backend/src/server.js');
  app = mod.default;
} catch (err) {
  initError = err;
  console.error('[INIT_ERROR]', err.stack || err.message);
}

export default function handler(req, res) {
  if (initError) {
    return res.status(500).json({
      error: 'Function initialization failed',
      message: initError.message,
      stack: initError.stack
    });
  }
  return app(req, res);
}
