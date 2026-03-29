#include <stdio.h>
#include <string.h>
#include "server_pool.h"

Server* servers[MAX_SERVERS];
int server_count;

float compute_score(Server* s){
    float load = s->active_connections / (float)s->weight;
    float history = s->total_connections / (float)(s->requests + 1);

    float status_factor;
    switch (s->status)
    {
        case healthy: status_factor = 1.0;
        break;
        case degraded: status_factor = 1.5;
        break;
        case overloaded: status_factor = 3.0;
        break;
    }

    return (0.4 * load + 0.3 * s->cpu + 0.2 * s->memory + 0.1 * history) * status_factor;
}

void add_server(int id, int weight, char name[], int total_connections){
    Server* s = (Server*)malloc(sizeof(Server));
    s->id = id;
    strcpy(s->name, name);
    s->weight = weight;
    s->active_connections = 0;
    s->cpu = 0;
    s->memory = 0;
    s->status = healthy;
    s->total_connections = total_connections;
    
    return s;
}

Server* get_servers(){
    return servers;
}

int get_server_count(){
    return server_count;
}

char* get_name(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->name;
        }
    }
}
char* get_status(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->status;
        }
    }
}
void update_active_connections(int id, int connections){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            servers[i]->active_connections = connections;
            break;
        }
    }
}
float get_cpu(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->cpu;
        }
    }
}
float get_memory(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->memory;
        }
    }
}
int get_active_connections(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->active_connections;
        }
    }
}
int get_weight(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->weight;
        }
    }
}
float get_score(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->score;
        }
    }
}
int get_requests(int id){
    for(int i = 0; i<MAX_SERVERS; i++){
        if(servers[i]->id == id){
            return servers[i]->requests;
        }
    }
}