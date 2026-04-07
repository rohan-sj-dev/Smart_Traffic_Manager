#ifndef SCALER_H
#define SCALER_H

#include <stdbool.h>
#include <time.h>
#include "cJSON.h"
#include "compat.h"
#include "predictor.h"

#define SCALER_MAX_EVENTS 100

typedef enum {
    SCALE_EVENT_UP,
    SCALE_EVENT_DOWN
} ScaleEventType;

typedef struct {
    ScaleEventType type;
    int from_count;
    int to_count;
    double trigger_load;
    const char *reason;
    time_t timestamp;
} ScaleEvent;

typedef struct {
    int min_servers;
    int max_servers;
    int current_count;
    double scale_up_threshold;    
    double scale_down_threshold;  
    int cooldown_seconds;
    time_t last_scale_time;
    ScaleEvent events[SCALER_MAX_EVENTS];
    int event_count;
    int event_index;              
    compat_mutex_t lock;
} AutoScaler;


void scaler_init(AutoScaler *s, int min_servers, int max_servers,
                 double up_threshold, double down_threshold, int cooldown);


void scaler_destroy(AutoScaler *s);
int scaler_evaluate(AutoScaler *s, Predictor *p);

void scaler_set_count(AutoScaler *s, int count);


cJSON *scaler_config_to_json(AutoScaler *s);

cJSON *scaler_events_to_json(AutoScaler *s, int max_events);

cJSON *scaler_decision_to_json(AutoScaler *s, int delta);

int should_scale_up(AutoScaler *s, Predictor *p);
int should_scale_down(AutoScaler *s, Predictor *p);

#endif
