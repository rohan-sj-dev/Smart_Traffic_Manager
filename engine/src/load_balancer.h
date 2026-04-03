#ifndef LOAD_BALANCER_H
#define LOAD_BALANCER_H

#include "server_pool.h"

Server *get_best_server(ServerPool *pool);

cJSON *route_request(ServerPool *pool, const char *request_id, const char *url);

int release_server(ServerPool *pool, const char *server_id);

#endif