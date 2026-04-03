#include "server_pool.h"
#include <string.h>
#include <stdio.h>

void server_pool_init(ServerPool *pool) {
    pool->count = 0;
    compat_mutex_init(&pool->lock);
    memset(pool->servers, 0, sizeof(pool->servers));
}

void server_pool_destroy(ServerPool *pool) {
    compat_mutex_destroy(&pool->lock);
}

int add_server(ServerPool *pool, const char *id, const char *name,
               const char *ip, int port, double weight, int max_connections) {
    compat_mutex_lock(&pool->lock);
    if (pool->count >= MAX_SERVERS) {
        compat_mutex_unlock(&pool->lock);
        return -1;
    }
    Server *s = &pool->servers[pool->count];
    snprintf(s->id, SERVER_ID_LEN, "%s", id);
    snprintf(s->name, SERVER_NAME_LEN, "%s", name ? name : id);
    snprintf(s->ip, SERVER_IP_LEN, "%s", ip);
    s->port = port;
    s->weight = weight > 0 ? weight : 1.0;
    s->active_connections = 0;
    s->max_connections = max_connections;
    s->total_connections = 0;
    s->requests = 0;
    s->status = healthy;
    s->cpu = 0.0;
    s->memory = 0.0;
    s->score = 0.0;
    pool->count++;
    compat_mutex_unlock(&pool->lock);
    return 0;
}

int server_pool_remove(ServerPool *pool, const char *id) {
    compat_mutex_lock(&pool->lock);
    for (int i = 0; i < pool->count; i++) {
        if (strcmp(pool->servers[i].id, id) == 0) {
            for (int j = i; j < pool->count - 1; j++) {
                pool->servers[j] = pool->servers[j + 1];
            }
            pool->count--;
            compat_mutex_unlock(&pool->lock);
            return 0;
        }
    }
    compat_mutex_unlock(&pool->lock);
    return -1;
}

Server *server_pool_find(ServerPool *pool, const char *id) {
    for (int i = 0; i < pool->count; i++) {
        if (strcmp(pool->servers[i].id, id) == 0) {
            return &pool->servers[i];
        }
    }
    return NULL;
}

int server_pool_update_health(ServerPool *pool, const char *id,
                              double cpu, double mem, bool is_healthy) {
    compat_mutex_lock(&pool->lock);
    Server *s = server_pool_find(pool, id);
    if (!s) {
        compat_mutex_unlock(&pool->lock);
        return -1;
    }
    s->cpu = cpu;
    s->memory = mem;
    s->status = is_healthy ? healthy : degraded;
    update_status(s);
    compat_mutex_unlock(&pool->lock);
    return 0;
}

int server_pool_inc_connections(ServerPool *pool, const char *id) {
    compat_mutex_lock(&pool->lock);
    Server *s = server_pool_find(pool, id);
    if (!s) {
        compat_mutex_unlock(&pool->lock);
        return -1;
    }
    s->active_connections++;
    s->total_connections++;
    s->requests++;
    compat_mutex_unlock(&pool->lock);
    return 0;
}

int server_pool_dec_connections(ServerPool *pool, const char *id) {
    compat_mutex_lock(&pool->lock);
    Server *s = server_pool_find(pool, id);
    if (!s || s->active_connections <= 0) {
        compat_mutex_unlock(&pool->lock);
        return -1;
    }
    s->active_connections--;
    compat_mutex_unlock(&pool->lock);
    return 0;
}

/* Compute composite score: weighted blend of load, cpu, memory, and history */
float compute_score(Server *s) {
    if (!s) return 999.0f;
    double load = s->max_connections > 0
        ? (double)s->active_connections / s->max_connections * 100.0
        : (double)s->active_connections;
    double history = s->total_connections > 0
        ? (double)s->requests / s->total_connections
        : 0.0;

    float status_factor = 1.0f;
    if (s->status == overloaded) status_factor = 2.0f;
    else if (s->status == degraded) status_factor = 3.0f;

    s->score = (0.4 * load + 0.3 * s->cpu + 0.2 * s->memory + 0.1 * history) * status_factor;
    return (float)s->score;
}

/* Update status based on current CPU/memory thresholds */
void update_status(Server *s) {
    if (!s) return;
    if (s->cpu > 90.0 || s->memory > 90.0) {
        s->status = overloaded;
    } else if (s->cpu > 70.0 || s->memory > 70.0) {
        s->status = degraded;
    } else {
        s->status = healthy;
    }
    compute_score(s);
}

/* Getters */
Server *get_servers(ServerPool *pool) {
    return pool->servers;
}

int get_server_count(ServerPool *pool) {
    return pool->count;
}

const char *get_name(ServerPool *pool, const char *id) {
    Server *s = server_pool_find(pool, id);
    return s ? s->name : NULL;
}

const char *get_status_str(Server *s) {
    if (!s) return "unknown";
    switch (s->status) {
        case healthy:    return "healthy";
        case overloaded: return "overloaded";
        case degraded:   return "degraded";
        default:         return "unknown";
    }
}

float get_cpu(ServerPool *pool, const char *id) {
    Server *s = server_pool_find(pool, id);
    return s ? (float)s->cpu : 0.0f;
}

float get_memory(ServerPool *pool, const char *id) {
    Server *s = server_pool_find(pool, id);
    return s ? (float)s->memory : 0.0f;
}

int get_active_connections(ServerPool *pool, const char *id) {
    Server *s = server_pool_find(pool, id);
    return s ? s->active_connections : 0;
}

float get_score_for(ServerPool *pool, const char *id) {
    Server *s = server_pool_find(pool, id);
    return s ? (float)s->score : 0.0f;
}

int get_requests(ServerPool *pool, const char *id) {
    Server *s = server_pool_find(pool, id);
    return s ? s->requests : 0;
}

cJSON *server_pool_to_json(ServerPool *pool) {
    compat_mutex_lock(&pool->lock);
    cJSON *arr = cJSON_CreateArray();
    for (int i = 0; i < pool->count; i++) {
        Server *s = &pool->servers[i];
        cJSON *obj = cJSON_CreateObject();
        cJSON_AddStringToObject(obj, "id", s->id);
        cJSON_AddStringToObject(obj, "name", s->name);
        cJSON_AddStringToObject(obj, "ip", s->ip);
        cJSON_AddNumberToObject(obj, "port", s->port);
        cJSON_AddStringToObject(obj, "status", get_status_str(s));
        cJSON_AddNumberToObject(obj, "weight", s->weight);
        cJSON_AddNumberToObject(obj, "active_connections", s->active_connections);
        cJSON_AddNumberToObject(obj, "max_connections", s->max_connections);
        cJSON_AddNumberToObject(obj, "total_connections", s->total_connections);
        cJSON_AddNumberToObject(obj, "requests", s->requests);
        cJSON_AddNumberToObject(obj, "cpu", s->cpu);
        cJSON_AddNumberToObject(obj, "memory", s->memory);
        cJSON_AddNumberToObject(obj, "score", s->score);
        cJSON_AddItemToArray(arr, obj);
    }
    compat_mutex_unlock(&pool->lock);
    return arr;
}

int server_pool_from_json(ServerPool *pool, cJSON *json) {
    if (!cJSON_IsArray(json)) return -1;
    int size = cJSON_GetArraySize(json);
    for (int i = 0; i < size; i++) {
        cJSON *item = cJSON_GetArrayItem(json, i);
        cJSON *jid = cJSON_GetObjectItem(item, "id");
        cJSON *jname = cJSON_GetObjectItem(item, "name");
        cJSON *jip = cJSON_GetObjectItem(item, "ip");
        cJSON *jport = cJSON_GetObjectItem(item, "port");
        cJSON *jweight = cJSON_GetObjectItem(item, "weight");
        cJSON *jmax = cJSON_GetObjectItem(item, "max_connections");
        if (!jid || !jip || !jport) continue;
        double weight = jweight ? jweight->valuedouble : 1.0;
        int max_conn = jmax ? jmax->valueint : 100;
        add_server(pool, jid->valuestring,
                   jname ? jname->valuestring : jid->valuestring,
                   jip->valuestring, jport->valueint, weight, max_conn);
    }
    return 0;
}
