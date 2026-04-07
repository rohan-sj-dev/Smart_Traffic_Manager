#ifndef METRICS_H
#define METRICS_H

#include <stdbool.h>
#include <time.h>
#include "cJSON.h"
#include "compat.h"
#include "server_pool.h"

#define METRICS_HISTORY_SIZE 300 /* 5 minutes at 1-second intervals */

typedef struct {
    double rps;
    double avg_latency_ms;
    double p99_latency_ms;
    long total_requests;
    long total_errors;
    long cache_hits;
    long cache_misses;
    int active_servers;
    double total_cpu;          
    double total_memory;
    time_t timestamp;
} MetricSnapshot;

typedef struct {
    MetricSnapshot history[METRICS_HISTORY_SIZE];
    int history_count;
    int history_index;

    
    long interval_requests;
    long interval_errors;
    double interval_latency_sum;
    double interval_latency_max;
    double interval_latencies[10000];
    int interval_latency_count;

    time_t start_time;
    long lifetime_requests;
    long lifetime_errors;

    compat_mutex_t lock;
} MetricsCollector;
void metrics_init(MetricsCollector *m);

void metrics_destroy(MetricsCollector *m);
void metrics_record_request(MetricsCollector *m, double latency_ms, bool is_error, bool cache_hit);

void metrics_flush_interval(MetricsCollector *m, int active_servers, double cpu, double mem);

cJSON *metrics_current_to_json(MetricsCollector *m);
cJSON *metrics_system_to_json(MetricsCollector *m);
cJSON *metrics_history_to_json(MetricsCollector *m, int count);

float get_average_score(Server *servers, int server_count);

#endif
