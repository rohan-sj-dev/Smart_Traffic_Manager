#ifndef SERVER_POOL_H
#define SERVER_POOL_H

#include <stdbool.h>
#include "cJSON.h"
#include "compat.h"

#define MAX_SERVERS 100
#define SERVER_ID_LEN 64
#define SERVER_IP_LEN 46
#define SERVER_NAME_LEN 50

typedef enum {
    healthy,
    overloaded,
    degraded
} Status;

typedef struct {
    char id[SERVER_ID_LEN];
    char name[SERVER_NAME_LEN];
    char ip[SERVER_IP_LEN];
    int port;
    Status status;
    double weight;
    int active_connections;
    int max_connections;
    int total_connections;
    int requests;
    double cpu;
    double memory;
    double score;
} Server;

typedef struct {
    Server servers[MAX_SERVERS];
    int count;
    compat_mutex_t lock;
} ServerPool;


void server_pool_init(ServerPool *pool);
void server_pool_destroy(ServerPool *pool);

int add_server(ServerPool *pool, const char *id, const char *name,
               const char *ip, int port, double weight, int max_connections);

int server_pool_remove(ServerPool *pool, const char *id);
Server *server_pool_find(ServerPool *pool, const char *id);
int server_pool_update_health(ServerPool *pool, const char *id,
                              double cpu, double mem, bool is_healthy);

int server_pool_inc_connections(ServerPool *pool, const char *id);
int server_pool_dec_connections(ServerPool *pool, const char *id);

float compute_score(Server *s);
void update_status(Server *s);
Server *get_servers(ServerPool *pool);
int get_server_count(ServerPool *pool);
const char *get_name(ServerPool *pool, const char *id);
const char *get_status_str(Server *s);
float get_cpu(ServerPool *pool, const char *id);
float get_memory(ServerPool *pool, const char *id);
int get_active_connections(ServerPool *pool, const char *id);
float get_score_for(ServerPool *pool, const char *id);
int get_requests(ServerPool *pool, const char *id);

cJSON *server_pool_to_json(ServerPool *pool);

int server_pool_from_json(ServerPool *pool, cJSON *json);

#endif
