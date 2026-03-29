#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "cache.h"

void node_init(Node* node){
    node->next = NULL;
    node->prev = NULL;
    node->key = -1;
    node->value = -1;
}

void cache_init(DoublyLinkedList* dll){
    Node* node_head = (Node*)malloc(sizeof(Node));
    node_init(node_head);
    dll->head = node_head;
    Node* node_tail = (Node*)malloc(sizeof(Node));
    node_init(node_tail);
    dll->tail = node_tail;
    dll->head->next = node_tail;
    dll->tail->prev = node_head;
}

void cache_add(DoublyLinkedList* dll, int key, int value){
    Node* node = dll->head->next;
    Node* new_node = (Node*)malloc(sizeof(Node));
    node_init(new_node);
    new_node->key = key;
    new_node->value = value;
    node->prev = new_node;
    new_node->next = node;
    new_node->prev = dll->head;
    dll->head->next = new_node;
    dll->size++;
}

void cache_remove_least_recent(DoublyLinkedList* dll){
    if(!cache_is_empty(dll)){
        Node* victim_node = dll->tail->prev;
        Node* node = victim_node->prev;
        node->next = dll->tail;
        dll->tail->prev = node;
        free(victim_node);
        dll->size--;
    }
}

void cache_remove_node(DoublyLinkedList* dll, Node* node){
    if (!dll->size || node == dll->head || node == dll->tail) 
    return;
    Node* prev_node = node->prev;
    Node* next_node = node->next;
    prev_node->next = next_node;
    next_node->prev = prev_node;
    free(node);
    dll->size--; 
}

void move_front(DoublyLinkedList* dll, Node* node){
    node->prev->next = node->next;
    node->next->prev = node->prev;

    dll->head->next->prev = node;
    node->next = dll->head->next;
    dll->head->next = node;
    node->prev = dll->head;
}

int cache_size(DoublyLinkedList* dll){
    return dll->size;
}

int cache_is_empty(DoublyLinkedList* dll){
    if(dll->head->next == dll->tail){
        return 1;
    }
    return 0;
}

Node* cache_get_most_recent(DoublyLinkedList* dll){
    if(!cache_is_empty(dll)){
        return dll->head->next;
    }
    return NULL;
}

int cache_get(Cache* cache, int key){
    int index = key%cache->capacity;
    Node* node = cache->hashmap[index];

    if(node == NULL || node->key != key){
        return -1;
    } else {
        move_front(&cache->dll, node);
        return node->value;
    }
}

void cache_put(Cache* cache, int key, int value){
    int index = key%cache->capacity;
    Node* node = cache->hashmap[index];

    if(node != NULL || node->key == key){
        node->value = value;
        move_front(&cache->dll, node);
        return;
    }
    
    if(cache->dll.size == cache->capacity){
        Node* lru = cache->dll.tail->prev;

        if(lru != cache->dll.head){
            int old_index = lru->key % cache->capacity;
            cache->hashmap[old_index] = NULL;

            cache_remove_node(&cache->dll, lru);
        }
    }

    cache_add(&cache->dll, key, value);
}