#ifndef CACHE_H
#define CACHE_H

typedef struct {
    Node* next;
    Node* prev;
    int key;
    int value;
} Node;

typedef struct {
    Node* head;
    Node* tail;
    int size;
} DoublyLinkedList;

typedef struct {
    DoublyLinkedList dll;
    Node** hashmap;
    int capacity;
} Cache;

void node_init(Node* node);
void cache_init(DoublyLinkedList* dll);
void cache_add(DoublyLinkedList* dll, int key, int value);
void cache_remove(DoublyLinkedList* dll);
void cache_remove_node(DoublyLinkedList* dll, Node* node);
void move_front(DoublyLinkedList* dll, Node* node);
int cache_size(DoublyLinkedList* dll);
int cache_is_empty(DoublyLinkedList* dll);
Node* cache_get_most_recent(DoublyLinkedList* dll); 
int cache_get(Cache* cache, int key);
void cache_put(Cache* cache, int key, int value);

#endif