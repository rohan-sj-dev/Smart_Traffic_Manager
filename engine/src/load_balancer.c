#include "load_balancer.h"
#include <float.h>
#include <stdio.h>
#include <time.h>

Server *get_best_server(ServerPool *pool) {
    Server *best = NULL;
    double best_score = DBL_MAX;

    for (int i = 0; i < pool->count; i++) {
        Server *s = &pool->servers[i];
        if (s->status != healthy) continue;
        if (s->active_connections >= s->max_connections) continue;

        double score = (double)s->active_connections / s->weight;
        if (score < best_score) {
            best_score = score;
            best = s;
        }
    }
    return best;
}

cJSON *route_request(ServerPool *pool, const char *request_id, const char *url) {
    compat_mutex_lock(&pool->lock);
    Server *chosen = get_best_server(pool);
    if (!chosen) {
        compat_mutex_unlock(&pool->lock);
        cJSON *err = cJSON_CreateObject();
        cJSON_AddStringToObject(err, "type", "route_response");
        cJSON_AddStringToObject(err, "request_id", request_id ? request_id : "");
        cJSON_AddStringToObject(err, "error", "no_healthy_server");
        return err;
    }

    double score = (double)chosen->active_connections / chosen->weight;
    chosen->active_connections++;
    chosen->total_connections++;
    chosen->requests++;
    chosen->score = score;

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "route_response");
    cJSON_AddStringToObject(resp, "request_id", request_id ? request_id : "");
    cJSON_AddStringToObject(resp, "server_id", chosen->id);
    cJSON_AddStringToObject(resp, "server_name", chosen->name);
    cJSON_AddStringToObject(resp, "server_ip", chosen->ip);
    cJSON_AddNumberToObject(resp, "server_port", chosen->port);
    cJSON_AddStringToObject(resp, "url", url ? url : "");
    cJSON_AddStringToObject(resp, "algorithm", "WLC");
    cJSON_AddNumberToObject(resp, "score", score);
    cJSON_AddStringToObject(resp, "status", get_status_str(chosen));
    cJSON_AddNumberToObject(resp, "timestamp", (double)time(NULL));

    compat_mutex_unlock(&pool->lock);
    return resp;
}

int release_server(ServerPool *pool, const char *server_id) {
    return server_pool_dec_connections(pool, server_id);
}
