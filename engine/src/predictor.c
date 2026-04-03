#include "predictor.h"
#include <math.h>
#include <string.h>

void predictor_init(Predictor *p, double alpha) {
    memset(p->window, 0, sizeof(p->window));
    p->window_count = 0;
    p->window_index = 0;
    p->ema = 0.0;
    p->alpha = (alpha > 0.0 && alpha <= 1.0) ? alpha : 0.3;
    p->predicted_load = 0.0;
    p->confidence = 0.0;
    p->rate_of_change = 0.0;
    p->trend = TREND_STABLE;
    p->spike_detected = false;
    p->action = ACTION_NONE;
    compat_mutex_init(&p->lock);
}

void predictor_destroy(Predictor *p) {
    compat_mutex_destroy(&p->lock);
}

/* Compute mean of values in the window */
static double window_mean(Predictor *p) {
    if (p->window_count == 0) return 0.0;
    double sum = 0.0;
    int count = p->window_count < PREDICTOR_WINDOW_SIZE ? p->window_count : PREDICTOR_WINDOW_SIZE;
    for (int i = 0; i < count; i++) {
        sum += p->window[i];
    }
    return sum / count;
}

/* Compute standard deviation of values in the window */
static double window_stddev(Predictor *p) {
    if (p->window_count < 2) return 0.0;
    double mean = window_mean(p);
    double sum_sq = 0.0;
    int count = p->window_count < PREDICTOR_WINDOW_SIZE ? p->window_count : PREDICTOR_WINDOW_SIZE;
    for (int i = 0; i < count; i++) {
        double diff = p->window[i] - mean;
        sum_sq += diff * diff;
    }
    return sqrt(sum_sq / count);
}

double predictor_update(Predictor *p, double observed) {
    compat_mutex_lock(&p->lock);

    double prev_ema = p->ema;

    /* Store in sliding window (circular buffer) */
    p->window[p->window_index] = observed;
    p->window_index = (p->window_index + 1) % PREDICTOR_WINDOW_SIZE;
    if (p->window_count < PREDICTOR_WINDOW_SIZE) p->window_count++;

    /* EMA update: EMA_new = alpha * observed + (1 - alpha) * EMA_old */
    if (p->window_count == 1) {
        p->ema = observed;
    } else {
        p->ema = p->alpha * observed + (1.0 - p->alpha) * p->ema;
    }

    /* Rate of change */
    p->rate_of_change = p->ema - prev_ema;

    /* Trend detection */
    if (p->rate_of_change > 0.5) {
        p->trend = TREND_RISING;
    } else if (p->rate_of_change < -0.5) {
        p->trend = TREND_FALLING;
    } else {
        p->trend = TREND_STABLE;
    }

    /* Spike detection: observed > mean + 2*stddev */
    double mean = window_mean(p);
    double stddev = window_stddev(p);
    p->spike_detected = (stddev > 0.0 && observed > mean + 2.0 * stddev);

    /* Predicted load = EMA + rate_of_change (simple linear extrapolation) */
    p->predicted_load = p->ema + p->rate_of_change;
    if (p->predicted_load < 0.0) p->predicted_load = 0.0;

    /* Confidence: based on how many data points we have */
    p->confidence = (double)p->window_count / PREDICTOR_WINDOW_SIZE;
    if (p->confidence > 1.0) p->confidence = 1.0;

    /* Recommended action */
    if (p->predicted_load > 80.0 || p->spike_detected) {
        p->action = ACTION_SCALE_UP;
    } else if (p->predicted_load < 30.0 && p->trend == TREND_FALLING) {
        p->action = ACTION_SCALE_DOWN;
    } else {
        p->action = ACTION_NONE;
    }

    double result = p->predicted_load;
    compat_mutex_unlock(&p->lock);
    return result;
}

cJSON *predictor_to_json(Predictor *p) {
    compat_mutex_lock(&p->lock);
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddStringToObject(obj, "type", "prediction");
    cJSON_AddNumberToObject(obj, "ema", p->ema);
    cJSON_AddNumberToObject(obj, "predicted_load", p->predicted_load);
    cJSON_AddNumberToObject(obj, "confidence", p->confidence);
    cJSON_AddNumberToObject(obj, "rate_of_change", p->rate_of_change);

    const char *trend_str = "stable";
    if (p->trend == TREND_RISING) trend_str = "rising";
    else if (p->trend == TREND_FALLING) trend_str = "falling";
    cJSON_AddStringToObject(obj, "trend", trend_str);

    cJSON_AddBoolToObject(obj, "spike_detected", p->spike_detected);

    const char *action_str = "none";
    if (p->action == ACTION_SCALE_UP) action_str = "scale_up";
    else if (p->action == ACTION_SCALE_DOWN) action_str = "scale_down";
    cJSON_AddStringToObject(obj, "recommended_action", action_str);

    cJSON_AddNumberToObject(obj, "alpha", p->alpha);
    cJSON_AddNumberToObject(obj, "window_size", PREDICTOR_WINDOW_SIZE);
    cJSON_AddNumberToObject(obj, "data_points", p->window_count);
    compat_mutex_unlock(&p->lock);
    return obj;
}
