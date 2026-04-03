#ifndef CACHE_H
#define CACHE_H

#include <stdbool.h>
#include <time.h>
#include "cJSON.h"
#include "compat.h"

#define CACHE_KEY_LEN 256
#define CACHE_VAL_LEN 4096
#define CACHE_HASH_SIZE 1024

typedef struct Node {
    char key[CACHE_KEY_LEN];
    char value[CACHE_VAL_LEN];
    size_t size;
    time_t created_at;
    int ttl_seconds;
    int hit_count;
    struct Node *prev;
    struct Node *next;
    struct Node *hash_next;
} Node;

typedef struct {
    Node *head;         
    Node *tail;         
    Node *hash_table[CACHE_HASH_SIZE];
    int count;
    int capacity;
    long total_hits;
    long total_misses;
    long total_evictions;
    compat_mutex_t lock;
} Cache;


void cache_init(Cache *cache, int capacity);
void cache_destroy(Cache *cache);

bool cache_get(Cache *cache, const char *key, char *value_out, size_t value_out_size);

void cache_put(Cache *cache, const char *key, const char *value, size_t size, int ttl_seconds);
bool cache_remove(Cache *cache, const char *key);
int cache_evict_expired(Cache *cache);

cJSON *cache_stats_to_json(Cache *cache);
cJSON *cache_top_items_json(Cache *cache, int n);

int cache_size(Cache *cache);
int cache_is_empty(Cache *cache);
Node *cache_get_most_recent(Cache *cache);
void move_front(Cache *cache, Node *node);

#endif
