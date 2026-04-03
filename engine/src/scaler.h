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
    double scale_up_threshold;    /* e.g. 80.0 (percent) */
    double scale_down_threshold;  /* e.g. 30.0 (percent) */
    int cooldown_seconds;
    time_t last_scale_time;
    ScaleEvent events[SCALER_MAX_EVENTS];
    int event_count;
    int event_index;              /* circular buffer index */
    compat_mutex_t lock;
} AutoScaler;

/* Initialize the auto-scaler */
void scaler_init(AutoScaler *s, int min_servers, int max_servers,
                 double up_threshold, double down_threshold, int cooldown);

/* Destroy the auto-scaler */
void scaler_destroy(AutoScaler *s);

/* Evaluate scaling decision based on predictor state.
 * Returns: +N for scale up, -N for scale down, 0 for no change. */
int scaler_evaluate(AutoScaler *s, Predictor *p);

/* Set the current server count (called when servers are actually added/removed) */
void scaler_set_count(AutoScaler *s, int count);

/* Get scaler configuration as JSON */
cJSON *scaler_config_to_json(AutoScaler *s);

/* Get scaling events history as JSON array */
cJSON *scaler_events_to_json(AutoScaler *s, int max_events);

/* Get a scaling decision as a JSON message (for output to bridge) */
cJSON *scaler_decision_to_json(AutoScaler *s, int delta);

/* Convenience functions (matching engine_remote naming) */
int should_scale_up(AutoScaler *s, Predictor *p);
int should_scale_down(AutoScaler *s, Predictor *p);

#endif /* SCALER_H */
