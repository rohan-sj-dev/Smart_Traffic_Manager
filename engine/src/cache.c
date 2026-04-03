#include "cache.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* FNV-1a hash */
unsigned int hash_key(const char *key) {
    unsigned int hash = 2166136261u;
    while (*key) {
        hash ^= (unsigned char)*key++;
        hash *= 16777619u;
    }
    return hash % CACHE_HASH_SIZE;
}

Node *create_node(const char *key, const char *value,size_t size, int ttl) {
    Node *node = (Node *)calloc(1, sizeof(Node));
    if (!node) return NULL;
    snprintf(node->key, CACHE_KEY_LEN, "%s", key);
    snprintf(node->value, CACHE_VAL_LEN, "%s", value);
    node->size = size;
    node->ttl_seconds = ttl;
    node->created_at = time(NULL);
    node->hit_count = 0;
    return node;
}


void move_to_head(Cache *cache, Node *node) {
    if (node == cache->head) return;

    /* detach from current position */
    if (node->prev) node->prev->next = node->next;
    if (node->next) node->next->prev = node->prev;
    if (node == cache->tail) cache->tail = node->prev;

    /* insert at head */
    node->prev = NULL;
    node->next = cache->head;
    if (cache->head) cache->head->prev = node;
    cache->head = node;
    if (!cache->tail) cache->tail = node;
}

/* Remove node from LRU list (does NOT free or remove from hash) */
static void detach_node(Cache *cache, Node *node) {
    if (node->prev) node->prev->next = node->next;
    else cache->head = node->next;
    if (node->next) node->next->prev = node->prev;
    else cache->tail = node->prev;
    node->prev = NULL;
    node->next = NULL;
    free(node);
}

/* Remove node from hash table */
static void hash_remove(Cache *cache, Node *node) {
    unsigned int idx = hash_key(node->key);
    Node *cur = cache->hash_table[idx];
    Node *prev_hash = NULL;
    while (cur) {
        if (cur == node) {
            if (prev_hash) prev_hash->hash_next = cur->hash_next;
            else cache->hash_table[idx] = cur->hash_next;
            return;
        }
        prev_hash = cur;
        cur = cur->hash_next;
    }
}

/* Find a node in the hash table */
static Node *hash_find(Cache *cache, const char *key) {
    unsigned int idx = hash_key(key);
    Node *cur = cache->hash_table[idx];
    while (cur) {
        if (strcmp(cur->key, key) == 0) return cur;
        cur = cur->hash_next;
    }
    return NULL;
}

/* Insert node into hash table */
static void hash_insert(Cache *cache, Node *node) {
    unsigned int idx = hash_key(node->key);
    node->hash_next = cache->hash_table[idx];
    cache->hash_table[idx] = node;
}

/* Evict the tail (least recently used) node */
static void evict_tail(Cache *cache) {
    if (!cache->tail) return;
    Node *victim = cache->tail;
    detach_node(cache, victim);
    hash_remove(cache, victim);
    free(victim);
    cache->count--;
    cache->total_evictions++;
}

void cache_init(Cache *cache, int capacity) {
    cache->head = NULL;
    cache->tail = NULL;
    cache->count = 0;
    cache->capacity = capacity > 0 ? capacity : 256;
    cache->total_hits = 0;
    cache->total_misses = 0;
    cache->total_evictions = 0;
    memset(cache->hash_table, 0, sizeof(cache->hash_table));
    compat_mutex_init(&cache->lock);
}

void cache_destroy(Cache *cache) {
    compat_mutex_lock(&cache->lock);
    Node *cur = cache->head;
    while (cur) {
        Node *next = cur->next;
        free(cur);
        cur = next;
    }
    cache->head = NULL;
    cache->tail = NULL;
    cache->count = 0;
    memset(cache->hash_table, 0, sizeof(cache->hash_table));
    compat_mutex_unlock(&cache->lock);
    compat_mutex_destroy(&cache->lock);
}

bool cache_get(Cache *cache, const char *key, char *value_out, size_t value_out_size) {
    compat_mutex_lock(&cache->lock);
    Node *node = hash_find(cache, key);
    if (!node) {
        cache->total_misses++;
        compat_mutex_unlock(&cache->lock);
        return false;
    }
    /* Check TTL */
    if (node->ttl_seconds > 0 && difftime(time(NULL), node->created_at) > node->ttl_seconds) {
        /* Expired — remove it */
        detach_node(cache, node);
        hash_remove(cache, node);
        free(node);
        cache->count--;
        cache->total_misses++;
        compat_mutex_unlock(&cache->lock);
        return false;
    }
    node->hit_count++;
    cache->total_hits++;
    move_to_head(cache, node);
    if (value_out && value_out_size > 0) {
        snprintf(value_out, value_out_size, "%s", node->value);
    }
    compat_mutex_unlock(&cache->lock);
    return true;
}

void cache_put(Cache *cache, const char *key, const char *value,
               size_t size, int ttl_seconds) {
    compat_mutex_lock(&cache->lock);

    /* Check if key already exists */
    Node *existing = hash_find(cache, key);
    if (existing) {
        snprintf(existing->value, CACHE_VAL_LEN, "%s", value);
        existing->size = size;
        existing->ttl_seconds = ttl_seconds;
        existing->created_at = time(NULL);
        move_to_head(cache, existing);
        compat_mutex_unlock(&cache->lock);
        return;
    }

    /* Evict if at capacity */
    while (cache->count >= cache->capacity) {
        evict_tail(cache);
    }

    Node *node = create_node(key, value, size, ttl_seconds);
    if (!node) {
        compat_mutex_unlock(&cache->lock);
        return;
    }

    /* Insert at head */
    node->next = cache->head;
    if (cache->head) cache->head->prev = node;
    cache->head = node;
    if (!cache->tail) cache->tail = node;

    hash_insert(cache, node);
    cache->count++;
    compat_mutex_unlock(&cache->lock);
}

bool cache_remove(Cache *cache, const char *key) {
    compat_mutex_lock(&cache->lock);
    Node *node = hash_find(cache, key);
    if (!node) {
        compat_mutex_unlock(&cache->lock);
        return false;
    }
    detach_node(cache, node);
    hash_remove(cache, node);
    free(node);
    cache->count--;
    compat_mutex_unlock(&cache->lock);
    return true;
}

int cache_evict_expired(Cache *cache) {
    compat_mutex_lock(&cache->lock);
    int evicted = 0;
    time_t now = time(NULL);
    Node *cur = cache->tail;
    while (cur) {
        Node *prev_node = cur->prev;
        if (cur->ttl_seconds > 0 && difftime(now, cur->created_at) > cur->ttl_seconds) {
            detach_node(cache, cur);
            hash_remove(cache, cur);
            free(cur);
            cache->count--;
            cache->total_evictions++;
            evicted++;
        }
        cur = prev_node;
    }
    compat_mutex_unlock(&cache->lock);
    return evicted;
}

cJSON *cache_stats_to_json(Cache *cache) {
    compat_mutex_lock(&cache->lock);
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddNumberToObject(obj, "entries", cache->count);
    cJSON_AddNumberToObject(obj, "capacity", cache->capacity);
    cJSON_AddNumberToObject(obj, "total_hits", cache->total_hits);
    cJSON_AddNumberToObject(obj, "total_misses", cache->total_misses);
    cJSON_AddNumberToObject(obj, "total_evictions", cache->total_evictions);
    long total = cache->total_hits + cache->total_misses;
    double hit_rate = total > 0 ? (double)cache->total_hits / total * 100.0 : 0.0;
    cJSON_AddNumberToObject(obj, "hit_rate_percent", hit_rate);
    compat_mutex_unlock(&cache->lock);
    return obj;
}

cJSON *cache_top_items_json(Cache *cache, int n) {
    compat_mutex_lock(&cache->lock);
    cJSON *arr = cJSON_CreateArray();
    Node *cur = cache->head;
    int counted = 0;
    while (cur && counted < n) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "key", cur->key);
        cJSON_AddNumberToObject(item, "hit_count", cur->hit_count);
        cJSON_AddNumberToObject(item, "size", (double)cur->size);
        cJSON_AddNumberToObject(item, "ttl", cur->ttl_seconds);
        cJSON_AddNumberToObject(item, "age_seconds", difftime(time(NULL), cur->created_at));
        cJSON_AddItemToArray(arr, item);
        cur = cur->next;
        counted++;
    }
    compat_mutex_unlock(&cache->lock);
    return arr;
}

/* Convenience functions */
int cache_size(Cache *cache) {
    return cache->count;
}

int cache_is_empty(Cache *cache) {
    return cache->count == 0;
}

Node *cache_get_most_recent(Cache *cache) {
    return cache->head;
}

void move_front(Cache *cache, Node *node) {
    move_to_head(cache, node);
}
