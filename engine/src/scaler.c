#include "scaler.h"
#include <string.h>
#include <stdio.h>

void scaler_init(AutoScaler *s, int min_servers, int max_servers,
                 double up_threshold, double down_threshold, int cooldown) {
    s->min_servers = min_servers > 1 ? min_servers : 1;
    s->max_servers = max_servers > s->min_servers ? max_servers : 10;
    s->current_count = s->min_servers;
    s->scale_up_threshold = up_threshold > 0 ? up_threshold : 80.0;
    s->scale_down_threshold = down_threshold > 0 ? down_threshold : 30.0;
    s->cooldown_seconds = cooldown > 0 ? cooldown : 30;
    s->last_scale_time = 0;
    s->event_count = 0;
    s->event_index = 0;
    memset(s->events, 0, sizeof(s->events));
    compat_mutex_init(&s->lock);
}

void scaler_destroy(AutoScaler *s) {
    compat_mutex_destroy(&s->lock);
}

static void record_event(AutoScaler *s, ScaleEventType type,
                          int from, int to, double load, const char *reason) {
    ScaleEvent *ev = &s->events[s->event_index];
    ev->type = type;
    ev->from_count = from;
    ev->to_count = to;
    ev->trigger_load = load;
    ev->reason = reason;
    ev->timestamp = time(NULL);
    s->event_index = (s->event_index + 1) % SCALER_MAX_EVENTS;
    if (s->event_count < SCALER_MAX_EVENTS) s->event_count++;
}

int scaler_evaluate(AutoScaler *s, Predictor *p) {
    compat_mutex_lock(&s->lock);
    compat_mutex_lock(&p->lock);

    time_t now = time(NULL);
    int delta = 0;

    /* Check cooldown */
    if (difftime(now, s->last_scale_time) < s->cooldown_seconds) {
        compat_mutex_unlock(&p->lock);
        compat_mutex_unlock(&s->lock);
        return 0;
    }

    double load = p->predicted_load;
    bool spike = p->spike_detected;

    /* Scale up decision */
    if (load > s->scale_up_threshold || spike) {
        if (s->current_count < s->max_servers) {
            int old = s->current_count;
            /* Scale aggressively on spikes */
            if (spike && load > 90.0) {
                delta = 2;
            } else {
                delta = 1;
            }
            if (s->current_count + delta > s->max_servers) {
                delta = s->max_servers - s->current_count;
            }
            s->current_count += delta;
            s->last_scale_time = now;
            const char *reason = spike ? "spike_detected" : "high_predicted_load";
            record_event(s, SCALE_EVENT_UP, old, s->current_count, load, reason);
        }
    }
    /* Scale down decision */
    else if (load < s->scale_down_threshold && p->trend == TREND_FALLING) {
        if (s->current_count > s->min_servers) {
            int old = s->current_count;
            delta = -1;
            s->current_count--;
            s->last_scale_time = now;
            record_event(s, SCALE_EVENT_DOWN, old, s->current_count, load, "low_predicted_load");
        }
    }

    compat_mutex_unlock(&p->lock);
    compat_mutex_unlock(&s->lock);
    return delta;
}

void scaler_set_count(AutoScaler *s, int count) {
    compat_mutex_lock(&s->lock);
    s->current_count = count;
    compat_mutex_unlock(&s->lock);
}

cJSON *scaler_config_to_json(AutoScaler *s) {
    compat_mutex_lock(&s->lock);
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddStringToObject(obj, "type", "scaling_config");
    cJSON_AddNumberToObject(obj, "min_servers", s->min_servers);
    cJSON_AddNumberToObject(obj, "max_servers", s->max_servers);
    cJSON_AddNumberToObject(obj, "current_count", s->current_count);
    cJSON_AddNumberToObject(obj, "scale_up_threshold", s->scale_up_threshold);
    cJSON_AddNumberToObject(obj, "scale_down_threshold", s->scale_down_threshold);
    cJSON_AddNumberToObject(obj, "cooldown_seconds", s->cooldown_seconds);
    compat_mutex_unlock(&s->lock);
    return obj;
}

cJSON *scaler_events_to_json(AutoScaler *s, int max_events) {
    compat_mutex_lock(&s->lock);
    cJSON *arr = cJSON_CreateArray();
    int total = s->event_count < max_events ? s->event_count : max_events;
    /* Read from most recent backwards */
    int idx = (s->event_index - 1 + SCALER_MAX_EVENTS) % SCALER_MAX_EVENTS;
    for (int i = 0; i < total; i++) {
        ScaleEvent *ev = &s->events[idx];
        cJSON *obj = cJSON_CreateObject();
        cJSON_AddStringToObject(obj, "action", ev->type == SCALE_EVENT_UP ? "scale_up" : "scale_down");
        cJSON_AddNumberToObject(obj, "from", ev->from_count);
        cJSON_AddNumberToObject(obj, "to", ev->to_count);
        cJSON_AddNumberToObject(obj, "trigger_load", ev->trigger_load);
        cJSON_AddStringToObject(obj, "reason", ev->reason ? ev->reason : "unknown");
        cJSON_AddNumberToObject(obj, "timestamp", (double)ev->timestamp);
        cJSON_AddItemToArray(arr, obj);
        idx = (idx - 1 + SCALER_MAX_EVENTS) % SCALER_MAX_EVENTS;
    }
    compat_mutex_unlock(&s->lock);
    return arr;
}

cJSON *scaler_decision_to_json(AutoScaler *s, int delta) {
    compat_mutex_lock(&s->lock);
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddStringToObject(obj, "type", "scale_command");
    if (delta > 0) {
        cJSON_AddStringToObject(obj, "action", "scale_up");
    } else if (delta < 0) {
        cJSON_AddStringToObject(obj, "action", "scale_down");
    } else {
        cJSON_AddStringToObject(obj, "action", "none");
    }
    cJSON_AddNumberToObject(obj, "delta", delta);
    cJSON_AddNumberToObject(obj, "current_count", s->current_count);
    cJSON_AddNumberToObject(obj, "timestamp", (double)time(NULL));
    compat_mutex_unlock(&s->lock);
    return obj;
}

int should_scale_up(AutoScaler *s, Predictor *p) {
    int delta = scaler_evaluate(s, p);
    return delta > 0 ? 1 : 0;
}

int should_scale_down(AutoScaler *s, Predictor *p) {
    int delta = scaler_evaluate(s, p);
    return delta < 0 ? 1 : 0;
}
