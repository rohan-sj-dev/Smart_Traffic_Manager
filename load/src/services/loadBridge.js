const BRIDGE_URL = 'http://localhost:4000';

export async function sendLoadRequest(url, method = 'GET') {
  const response = await fetch(`${BRIDGE_URL}/api/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method }),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.error || `Bridge request failed with ${response.status}`);
  }

  return data;
}

export async function runLoadBatch({ url, totalRuns, concurrency, method = 'GET', isActive, onProgress }) {
  const runs = Math.max(1, Number(totalRuns) || 1);
  const workers = Math.max(1, Number(concurrency) || 1);
  let nextRun = 0;
  let completed = 0;
  let failed = 0;
  const startedAt = performance.now();

  async function worker() {
    while (isActive() && nextRun < runs) {
      nextRun += 1;
      const start = performance.now();
      try {
        await sendLoadRequest(url, method);
        completed += 1;
        onProgress?.({ completed, failed, lastLatency: performance.now() - start });
      } catch (err) {
        failed += 1;
        onProgress?.({ completed, failed, error: err.message, lastLatency: performance.now() - start });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, runs) }, worker));

  return {
    completed,
    failed,
    durationMs: performance.now() - startedAt,
  };
}

export async function simulateLoadBatch(url, count, method = 'GET') {
  const response = await fetch(`${BRIDGE_URL}/api/simulate-load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, count, method }),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.error || `Simulate load failed with ${response.status}`);
  }

  return data;
}