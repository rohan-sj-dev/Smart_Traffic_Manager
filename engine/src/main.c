/*
 * Intelligent Load Balancer Engine
 * ================================
 * Core decision engine written in C.
 * Communicates via JSON over stdin/stdout with the Node.js bridge layer.
 *
 * Message Types (stdin):
 *   - route_request:   { type, request_id, url, method }
 *   - request_done:    { type, request_id, server_id, latency_ms, status_code, cache_hit }
 *   - health_update:   { type, server_id, cpu, memory, healthy }
 *   - add_server:      { type, id, ip, port, weight, max_connections }
 *   - remove_server:   { type, server_id }
 *   - cache_put:       { type, key, value, size, ttl }
 *   - cache_get:       { type, key }
 *   - cache_remove:    { type, key }
 *   - get_status:      { type }
 *   - shutdown:        { type }
 *
 * Message Types (stdout):
 *   - route_response:  routing decision with selected server
 *   - cache_response:  cache lookup result
 *   - scale_command:   auto-scaling decision
 *   - prediction:      current prediction state
 *   - metrics:         current metrics snapshot
 *   - status:          full engine status
 *   - error:           error message
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <signal.h>
#include <time.h>
#include "compat.h"

#include "cJSON.h"
#include "server_pool.h"
#include "load_balancer.h"
#include "cache.h"
#include "predictor.h"
#include "scaler.h"
#include "metrics.h"

/* Global state */
static ServerPool g_pool;
static Cache g_cache;
static Predictor g_predictor;
static AutoScaler g_scaler;
static MetricsCollector g_metrics;
static volatile bool g_running = true;

/* Send a JSON message to stdout (one line, newline terminated) */
static void send_message(cJSON *msg) {
    char *str = cJSON_PrintUnformatted(msg);
    if (str) {
        fprintf(stdout, "%s\n", str);
        fflush(stdout);
        free(str);
    }
}

/* Send an error message */
static void send_error(const char *msg) {
    cJSON *err = cJSON_CreateObject();
    cJSON_AddStringToObject(err, "type", "error");
    cJSON_AddStringToObject(err, "message", msg);
    send_message(err);
    cJSON_Delete(err);
}

/* Handle: route_request */
static void handle_route_request(cJSON *msg) {
    cJSON *req_id = cJSON_GetObjectItem(msg, "request_id");
    cJSON *url = cJSON_GetObjectItem(msg, "url");

    /* Check cache first */
    if (url && url->valuestring) {
        char cached_value[CACHE_VAL_LEN];
        if (cache_get(&g_cache, url->valuestring, cached_value, sizeof(cached_value))) {
            cJSON *resp = cJSON_CreateObject();
            cJSON_AddStringToObject(resp, "type", "cache_response");
            cJSON_AddStringToObject(resp, "request_id",
                                    req_id ? req_id->valuestring : "");
            cJSON_AddBoolToObject(resp, "cache_hit", true);
            cJSON_AddStringToObject(resp, "cached_value", cached_value);
            cJSON_AddStringToObject(resp, "url", url->valuestring);
            send_message(resp);
            cJSON_Delete(resp);
            return;
        }
    }

    /* Route via WLC */
    cJSON *resp = route_request(&g_pool,
        req_id ? req_id->valuestring : "",
        url ? url->valuestring : "");
    send_message(resp);
    cJSON_Delete(resp);
}

/* Handle: request_done */
static void handle_request_done(cJSON *msg) {
    cJSON *server_id = cJSON_GetObjectItem(msg, "server_id");
    cJSON *latency = cJSON_GetObjectItem(msg, "latency_ms");
    cJSON *status = cJSON_GetObjectItem(msg, "status_code");
    cJSON *cache_hit = cJSON_GetObjectItem(msg, "cache_hit");

    if (server_id && server_id->valuestring) {
        release_server(&g_pool, server_id->valuestring);
    }

    double lat = latency ? latency->valuedouble : 0.0;
    bool is_error = status && status->valueint >= 500;
    bool hit = cache_hit && cJSON_IsTrue(cache_hit);

    metrics_record_request(&g_metrics, lat, is_error, hit);
}

/* Handle: health_update */
static void handle_health_update(cJSON *msg) {
    cJSON *sid = cJSON_GetObjectItem(msg, "server_id");
    cJSON *cpu = cJSON_GetObjectItem(msg, "cpu");
    cJSON *mem = cJSON_GetObjectItem(msg, "memory");
    cJSON *healthy = cJSON_GetObjectItem(msg, "healthy");

    if (!sid || !sid->valuestring) {
        send_error("health_update: missing server_id");
        return;
    }

    server_pool_update_health(&g_pool, sid->valuestring,
        cpu ? cpu->valuedouble : 0.0,
        mem ? mem->valuedouble : 0.0,
        healthy ? cJSON_IsTrue(healthy) : true);
}

/* Handle: add_server */
static void handle_add_server(cJSON *msg) {
    cJSON *id = cJSON_GetObjectItem(msg, "id");
    cJSON *jname = cJSON_GetObjectItem(msg, "name");
    cJSON *ip = cJSON_GetObjectItem(msg, "ip");
    cJSON *port = cJSON_GetObjectItem(msg, "port");
    cJSON *weight = cJSON_GetObjectItem(msg, "weight");
    cJSON *max_conn = cJSON_GetObjectItem(msg, "max_connections");

    if (!id || !ip || !port) {
        send_error("add_server: missing id, ip, or port");
        return;
    }

    int result = add_server(&g_pool, id->valuestring,
        jname ? jname->valuestring : id->valuestring,
        ip->valuestring, port->valueint,
        weight ? weight->valuedouble : 1.0,
        max_conn ? max_conn->valueint : 100);

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "server_added");
    cJSON_AddStringToObject(resp, "server_id", id->valuestring);
    cJSON_AddBoolToObject(resp, "success", result == 0);
    send_message(resp);
    cJSON_Delete(resp);
}

/* Handle: remove_server */
static void handle_remove_server(cJSON *msg) {
    cJSON *sid = cJSON_GetObjectItem(msg, "server_id");
    if (!sid || !sid->valuestring) {
        send_error("remove_server: missing server_id");
        return;
    }

    int result = server_pool_remove(&g_pool, sid->valuestring);

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "server_removed");
    cJSON_AddStringToObject(resp, "server_id", sid->valuestring);
    cJSON_AddBoolToObject(resp, "success", result == 0);
    send_message(resp);
    cJSON_Delete(resp);
}

/* Handle: cache_put */
static void handle_cache_put(cJSON *msg) {
    cJSON *key = cJSON_GetObjectItem(msg, "key");
    cJSON *value = cJSON_GetObjectItem(msg, "value");
    cJSON *size = cJSON_GetObjectItem(msg, "size");
    cJSON *ttl = cJSON_GetObjectItem(msg, "ttl");

    if (!key || !value || !key->valuestring || !value->valuestring) {
        send_error("cache_put: missing key or value");
        return;
    }

    cache_put(&g_cache, key->valuestring, value->valuestring,
        size ? (size_t)size->valueint : strlen(value->valuestring),
        ttl ? ttl->valueint : 300);
}

/* Handle: cache_get */
static void handle_cache_get(cJSON *msg) {
    cJSON *key = cJSON_GetObjectItem(msg, "key");
    if (!key || !key->valuestring) {
        send_error("cache_get: missing key");
        return;
    }

    char value[CACHE_VAL_LEN];
    bool found = cache_get(&g_cache, key->valuestring, value, sizeof(value));

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "cache_response");
    cJSON_AddStringToObject(resp, "key", key->valuestring);
    cJSON_AddBoolToObject(resp, "cache_hit", found);
    if (found) {
        cJSON_AddStringToObject(resp, "value", value);
    }
    send_message(resp);
    cJSON_Delete(resp);
}

/* Handle: cache_remove */
static void handle_cache_remove(cJSON *msg) {
    cJSON *key = cJSON_GetObjectItem(msg, "key");
    if (!key || !key->valuestring) {
        send_error("cache_remove: missing key");
        return;
    }
    cache_remove(&g_cache, key->valuestring);
}

/* Handle: set_server_count — sync scaler's internal counter with bridge reality */
static void handle_set_server_count(cJSON *msg) {
    cJSON *count = cJSON_GetObjectItem(msg, "count");
    if (!count) return;
    scaler_set_count(&g_scaler, count->valueint);
}

/* Handle: get_status — return full engine state */
static void handle_get_status(void) {
    cJSON *status = cJSON_CreateObject();
    cJSON_AddStringToObject(status, "type", "status");

    /* Servers */
    cJSON *servers = server_pool_to_json(&g_pool);
    cJSON_AddItemToObject(status, "servers", servers);

    /* Cache stats */
    cJSON *cache_stats = cache_stats_to_json(&g_cache);
    cJSON_AddItemToObject(status, "cache", cache_stats);

    /* Cache top items */
    cJSON *cache_items = cache_top_items_json(&g_cache, 10);
    cJSON_AddItemToObject(status, "cache_items", cache_items);

    /* Prediction */
    cJSON *pred = predictor_to_json(&g_predictor);
    cJSON_AddItemToObject(status, "prediction", pred);

    /* Scaler config */
    cJSON *scaler_cfg = scaler_config_to_json(&g_scaler);
    cJSON_AddItemToObject(status, "scaling", scaler_cfg);

    /* Scaling events */
    cJSON *events = scaler_events_to_json(&g_scaler, 20);
    cJSON_AddItemToObject(status, "scaling_events", events);

    /* Metrics */
    cJSON *metrics = metrics_current_to_json(&g_metrics);
    cJSON_AddItemToObject(status, "metrics", metrics);

    /* System */
    cJSON *sys = metrics_system_to_json(&g_metrics);
    cJSON_AddItemToObject(status, "system", sys);

    send_message(status);
    cJSON_Delete(status);
}

/* Periodic tick thread: runs every second to flush metrics, update predictor/scaler */
#ifdef _WIN32
static DWORD WINAPI tick_thread(LPVOID arg) {
#else
static void *tick_thread(void *arg) {
#endif
    (void)arg;
    while (g_running) {
        /* Compute aggregate CPU, memory, and connection utilization */
        double total_cpu = 0.0, total_mem = 0.0;
        int total_active_conns = 0, total_max_conns = 0;
        compat_mutex_lock(&g_pool.lock);
        int active = 0;
        for (int i = 0; i < g_pool.count; i++) {
            if (g_pool.servers[i].status == healthy) {
                active++;
                total_cpu += g_pool.servers[i].cpu;
                total_mem += g_pool.servers[i].memory;
                total_active_conns += g_pool.servers[i].active_connections;
                total_max_conns += g_pool.servers[i].max_connections;
            }
        }
        compat_mutex_unlock(&g_pool.lock);

        double avg_cpu = 0.0, avg_mem = 0.0, conn_util = 0.0;
        if (active > 0) {
            avg_cpu = total_cpu / active;
            avg_mem = total_mem / active;
            total_cpu = avg_cpu;
            total_mem = avg_mem;
        }
        if (total_max_conns > 0) {
            conn_util = ((double)total_active_conns / total_max_conns) * 100.0;
        }

        /* Flush metrics interval */
        metrics_flush_interval(&g_metrics, active, total_cpu, total_mem);

        /* Get latest RPS for composite score */
        cJSON *current = metrics_current_to_json(&g_metrics);
        cJSON *rps_json = cJSON_GetObjectItem(current, "rps");
        double rps = rps_json ? rps_json->valuedouble : 0.0;
        cJSON_Delete(current);

        /* Composite load score (0-100): weighted blend of CPU, memory,
           connection utilization, and RPS normalized per server.
           Weights: CPU 35%, Memory 25%, Connections 25%, RPS 15% */
        double rps_per_server = active > 0 ? rps / active : 0.0;
        double rps_score = rps_per_server > 50.0 ? 100.0 : (rps_per_server / 50.0) * 100.0;
        double composite = 0.35 * avg_cpu
                         + 0.25 * avg_mem
                         + 0.25 * conn_util
                         + 0.15 * rps_score;
        if (composite > 100.0) composite = 100.0;
        if (composite < 0.0)   composite = 0.0;

        /* Update predictor with composite load score */
        predictor_update(&g_predictor, composite);

        /* Evaluate auto-scaler */
        int delta = scaler_evaluate(&g_scaler, &g_predictor);
        if (delta != 0) {
            cJSON *cmd = scaler_decision_to_json(&g_scaler, delta);
            send_message(cmd);
            cJSON_Delete(cmd);
        }

        /* Evict expired cache entries */
        cache_evict_expired(&g_cache);

        /* Sleep 1 second */
        compat_sleep_ms(1000);
    }
    return 0;
}

/* Signal handler for graceful shutdown */
static void signal_handler(int sig) {
    (void)sig;
    g_running = false;
}

/* Process a single JSON message */
static void process_message(const char *line) {
    cJSON *msg = cJSON_Parse(line);
    if (!msg) {
        send_error("invalid JSON");
        return;
    }

    cJSON *type = cJSON_GetObjectItem(msg, "type");
    if (!type || !type->valuestring) {
        send_error("missing message type");
        cJSON_Delete(msg);
        return;
    }

    const char *t = type->valuestring;

    if (strcmp(t, "route_request") == 0) {
        handle_route_request(msg);
    } else if (strcmp(t, "request_done") == 0) {
        handle_request_done(msg);
    } else if (strcmp(t, "health_update") == 0) {
        handle_health_update(msg);
    } else if (strcmp(t, "add_server") == 0) {
        handle_add_server(msg);
    } else if (strcmp(t, "remove_server") == 0) {
        handle_remove_server(msg);
    } else if (strcmp(t, "cache_put") == 0) {
        handle_cache_put(msg);
    } else if (strcmp(t, "cache_get") == 0) {
        handle_cache_get(msg);
    } else if (strcmp(t, "cache_remove") == 0) {
        handle_cache_remove(msg);
    } else if (strcmp(t, "set_server_count") == 0) {
        handle_set_server_count(msg);
    } else if (strcmp(t, "get_status") == 0) {
        handle_get_status();
    } else if (strcmp(t, "shutdown") == 0) {
        g_running = false;
    } else {
        char err_buf[256];
        snprintf(err_buf, sizeof(err_buf), "unknown message type: %s", t);
        send_error(err_buf);
    }

    cJSON_Delete(msg);
}

int main(void) {
    /* Setup signal handlers */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    /* Initialize all subsystems */
    server_pool_init(&g_pool);
    cache_init(&g_cache, 1024);           /* 1024 entry cache */
    predictor_init(&g_predictor, 0.3);    /* alpha = 0.3 */
    scaler_init(&g_scaler, 3, 10, 70.0, 25.0, 20);  /* min=3, max=10, up>70%, down<25%, cooldown=20s */
    metrics_init(&g_metrics);

    /* Send startup message */
    cJSON *startup = cJSON_CreateObject();
    cJSON_AddStringToObject(startup, "type", "engine_started");
    cJSON_AddStringToObject(startup, "version", "1.0.0");
    cJSON_AddStringToObject(startup, "algorithm", "weighted_least_connections");
    cJSON_AddStringToObject(startup, "predictor", "ema");
    cJSON_AddNumberToObject(startup, "cache_capacity", 1024);
    cJSON_AddNumberToObject(startup, "timestamp", (double)time(NULL));
    send_message(startup);
    cJSON_Delete(startup);

    /* Start the periodic tick thread */
    compat_thread_t tick;
    compat_thread_create(&tick, tick_thread, NULL);

    /* Main message loop: read JSON from stdin line by line */
    char line_buf[65536];
    while (g_running && fgets(line_buf, sizeof(line_buf), stdin) != NULL) {
        /* Strip trailing newline */
        size_t len = strlen(line_buf);
        while (len > 0 && (line_buf[len - 1] == '\n' || line_buf[len - 1] == '\r')) {
            line_buf[--len] = '\0';
        }
        if (len == 0) continue;

        process_message(line_buf);
    }

    /* Shutdown */
    g_running = false;
    compat_thread_join(tick);

    /* Cleanup */
    server_pool_destroy(&g_pool);
    cache_destroy(&g_cache);
    predictor_destroy(&g_predictor);
    scaler_destroy(&g_scaler);
    metrics_destroy(&g_metrics);

    /* Send shutdown confirmation */
    cJSON *bye = cJSON_CreateObject();
    cJSON_AddStringToObject(bye, "type", "engine_stopped");
    cJSON_AddNumberToObject(bye, "timestamp", (double)time(NULL));
    send_message(bye);
    cJSON_Delete(bye);

    return 0;
}
