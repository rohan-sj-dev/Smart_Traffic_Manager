#include <stdio.h>
#include "server_pool.h"

Server* get_best_server(Server* servers, int server_count){
    servers = get_servers();
    server_count = get_server_count();

    Server* best_server = &servers[0];
    for(int i=0; i<server_count; i++){
        if(servers[i].score < best_server->score){
            best_server = &servers[i];
        }
    }

    return best_server;
}