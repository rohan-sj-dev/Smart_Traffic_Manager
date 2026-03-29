#ifndef LOAD_BALANCER_H
#define LOAD_BALANCER_H
#include "server_pool.h"

Server* get_best_server(Server* servers, int server_count);

#endif