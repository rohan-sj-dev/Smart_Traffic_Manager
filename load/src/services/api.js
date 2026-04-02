export async function startLoad(data) {
  return fetch("/api/start-load", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMetrics() {
  const res = await fetch("/api/metrics");
  return res.json();
}