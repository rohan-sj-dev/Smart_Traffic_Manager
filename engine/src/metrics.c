#include "metrics.h"
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>

void metrics_init(MetricsCollector *m) {
    memset(m, 0, sizeof(MetricsCollector));
    m->start_time = time(NULL);
    compat_mutex_init(&m->lock);
}

void metrics_destroy(MetricsCollector *m) {
    compat_mutex_destroy(&m->lock);
}

void metrics_record_request(MetricsCollector *m, double latency_ms, bool is_error, bool cache_hit) {
    compat_mutex_lock(&m->lock);
    m->interval_requests++;
    m->lifetime_requests++;
    m->interval_latency_sum += latency_ms;
    if (latency_ms > m->interval_latency_max) {
        m->interval_latency_max = latency_ms;
    }
    if (m->interval_latency_count < 10000) {
        m->interval_latencies[m->interval_latency_count++] = latency_ms;
    }
    if (is_error) {
        m->interval_errors++;
        m->lifetime_errors++;
    }

    /* Update cache stats in the latest history entry */
    if (m->history_count > 0) {
        int last = (m->history_index - 1 + METRICS_HISTORY_SIZE) % METRICS_HISTORY_SIZE;
        if (cache_hit) m->history[last].cache_hits++;
        else m->history[last].cache_misses++;
    }

    compat_mutex_unlock(&m->lock);
}

/* Comparison function for qsort */
static int cmp_double(const void *a, const void *b) {
    double da = *(const double *)a;
    double db = *(const double *)b;
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
}

void metrics_flush_interval(MetricsCollector *m, int active_servers, double cpu, double mem) {
    compat_mutex_lock(&m->lock);

    MetricSnapshot *snap = &m->history[m->history_index];
    snap->rps = (double)m->interval_requests;
    snap->total_requests = m->lifetime_requests;
    snap->total_errors = m->lifetime_errors;
    snap->active_servers = active_servers;
    snap->total_cpu = cpu;
    snap->total_memory = mem;
    snap->timestamp = time(NULL);

    if (m->interval_requests > 0) {
        snap->avg_latency_ms = m->interval_latency_sum / m->interval_requests;
    } else {
        snap->avg_latency_ms = 0.0;
    }

    /* P99 calculation */
    if (m->interval_latency_count > 0) {
        qsort(m->interval_latencies, (size_t)m->interval_latency_count,
              sizeof(double), cmp_double);
        int p99_idx = (int)(m->interval_latency_count * 0.99);
        if (p99_idx >= m->interval_latency_count) p99_idx = m->interval_latency_count - 1;
        snap->p99_latency_ms = m->interval_latencies[p99_idx];
    } else {
        snap->p99_latency_ms = 0.0;
    }

    /* Carry over cache stats from previous snapshot if needed */
    snap->cache_hits = 0;
    snap->cache_misses = 0;

    /* Advance circular buffer */
    m->history_index = (m->history_index + 1) % METRICS_HISTORY_SIZE;
    if (m->history_count < METRICS_HISTORY_SIZE) m->history_count++;

    /* Reset interval counters */
    m->interval_requests = 0;
    m->interval_errors = 0;
    m->interval_latency_sum = 0.0;
    m->interval_latency_max = 0.0;
    m->interval_latency_count = 0;

    compat_mutex_unlock(&m->lock);
}

cJSON *metrics_current_to_json(MetricsCollector *m) {
    compat_mutex_lock(&m->lock);
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddStringToObject(obj, "type", "metrics");

    if (m->history_count > 0) {
        int last = (m->history_index - 1 + METRICS_HISTORY_SIZE) % METRICS_HISTORY_SIZE;
        MetricSnapshot *snap = &m->history[last];
        cJSON_AddNumberToObject(obj, "rps", snap->rps);
        cJSON_AddNumberToObject(obj, "avg_latency_ms", snap->avg_latency_ms);
        cJSON_AddNumberToObject(obj, "p99_latency_ms", snap->p99_latency_ms);
        cJSON_AddNumberToObject(obj, "total_requests", (double)snap->total_requests);
        cJSON_AddNumberToObject(obj, "total_errors", (double)snap->total_errors);
        cJSON_AddNumberToObject(obj, "active_servers", snap->active_servers);
        cJSON_AddNumberToObject(obj, "total_cpu", snap->total_cpu);
        cJSON_AddNumberToObject(obj, "total_memory", snap->total_memory);
    } else {
        cJSON_AddNumberToObject(obj, "rps", 0);
        cJSON_AddNumberToObject(obj, "avg_latency_ms", 0);
        cJSON_AddNumberToObject(obj, "p99_latency_ms", 0);
        cJSON_AddNumberToObject(obj, "total_requests", 0);
        cJSON_AddNumberToObject(obj, "total_errors", 0);
        cJSON_AddNumberToObject(obj, "active_servers", 0);
        cJSON_AddNumberToObject(obj, "total_cpu", 0);
        cJSON_AddNumberToObject(obj, "total_memory", 0);
    }

    double uptime = difftime(time(NULL), m->start_time);
    cJSON_AddNumberToObject(obj, "uptime_seconds", uptime);
    cJSON_AddNumberToObject(obj, "lifetime_requests", (double)m->lifetime_requests);
    cJSON_AddNumberToObject(obj, "lifetime_errors", (double)m->lifetime_errors);

    compat_mutex_unlock(&m->lock);
    return obj;
}

cJSON *metrics_system_to_json(MetricsCollector *m) {
    compat_mutex_lock(&m->lock);
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddStringToObject(obj, "type", "system_metrics");
    cJSON_AddNumberToObject(obj, "uptime_seconds", difftime(time(NULL), m->start_time));
    cJSON_AddNumberToObject(obj, "lifetime_requests", (double)m->lifetime_requests);
    cJSON_AddNumberToObject(obj, "lifetime_errors", (double)m->lifetime_errors);
    double error_rate = m->lifetime_requests > 0
        ? (double)m->lifetime_errors / m->lifetime_requests * 100.0
        : 0.0;
    cJSON_AddNumberToObject(obj, "error_rate_percent", error_rate);
    compat_mutex_unlock(&m->lock);
    return obj;
}

cJSON *metrics_history_to_json(MetricsCollector *m, int count) {
    compat_mutex_lock(&m->lock);
    cJSON *arr = cJSON_CreateArray();
    int total = m->history_count < count ? m->history_count : count;
    int idx = (m->history_index - total + METRICS_HISTORY_SIZE) % METRICS_HISTORY_SIZE;
    for (int i = 0; i < total; i++) {
        MetricSnapshot *snap = &m->history[idx];
        cJSON *obj = cJSON_CreateObject();
        cJSON_AddNumberToObject(obj, "rps", snap->rps);
        cJSON_AddNumberToObject(obj, "avg_latency_ms", snap->avg_latency_ms);
        cJSON_AddNumberToObject(obj, "p99_latency_ms", snap->p99_latency_ms);
        cJSON_AddNumberToObject(obj, "total_requests", (double)snap->total_requests);
        cJSON_AddNumberToObject(obj, "active_servers", snap->active_servers);
        cJSON_AddNumberToObject(obj, "timestamp", (double)snap->timestamp);
        cJSON_AddItemToArray(arr, obj);
        idx = (idx + 1) % METRICS_HISTORY_SIZE;
    }
    compat_mutex_unlock(&m->lock);
    return arr;
}

float get_average_score(Server *servers, int server_count) {
    if (server_count <= 0 || !servers) return 0.0f;
    float total = 0.0f;
    for (int i = 0; i < server_count; i++) {
        total += compute_score(&servers[i]);
    }
    return total / server_count;
}
