#ifndef SCALER_H
#define SCALER_H
#include "server_pool.h"
#define THRESHOLD_AVERAGE_SCORE 10

int should_scale_up(Server* servers, int server_count);
int should_scale_down(Server* servers, int server_count);

#endif