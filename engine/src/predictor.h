#ifndef PREDICTOR_H
#define PREDICTOR_H

#include <stdbool.h>
#include "cJSON.h"
#include "compat.h"

#define PREDICTOR_WINDOW_SIZE 60

typedef enum {
    TREND_STABLE,
    TREND_RISING,
    TREND_FALLING
} Trend;

typedef enum {
    ACTION_NONE,
    ACTION_SCALE_UP,
    ACTION_SCALE_DOWN
} RecommendedAction;

typedef struct {
    double window[PREDICTOR_WINDOW_SIZE];
    int window_count;
    int window_index;                     
    double ema;                           
    double alpha;                         
    double predicted_load;
    double confidence;
    double rate_of_change;
    Trend trend;
    bool spike_detected;
    RecommendedAction action;
    compat_mutex_t lock;
} Predictor;

void predictor_init(Predictor *p, double alpha);

void predictor_destroy(Predictor *p);

double predictor_update(Predictor *p, double observed);

cJSON *predictor_to_json(Predictor *p);

#endif /* PREDICTOR_H */
