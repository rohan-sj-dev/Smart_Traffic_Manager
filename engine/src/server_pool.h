#ifndef SERVER_POOL_H
#define SERVER_POOL_H
#define MAX_SERVERS 100

typedef enum {
    healthy,
    overloaded,
    degraded
} Status;

typedef struct
{
    int id;
    char name[50];
    Status status;
    float cpu;
    float memory;
    int active_connections;
    int total_connections;
    int weight;
    float score;
    int requests;
} Server;

void add_server(int id, int weight, char name[], int total_connections);
Server* get_servers();
int get_server_count();
char* get_name(int id);
char* get_status(int id);
void update_active_connections(int id, int connections);
float get_cpu(int id);
float get_memory(int id);
int get_active_connections(int id);
int get_weight(int id);
float get_score(int id);
int get_requests(int id);
float compute_score(Server* s);
void update_status(Server* s);

#endif