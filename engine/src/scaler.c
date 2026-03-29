#include "scaler.h"
#include "metrics.h"
#include "server_pool.h"

int should_scale_up(Server* servers, int server_count){
    int average_score = get_average_score(servers, server_count);
    if(average_score > THRESHOLD_AVERAGE_SCORE){
        return 1;
    }
}

int should_scale_down(Server* servers, int server_count){
    int average_score = get_average_score(servers, server_count);
    if(average_score < THRESHOLD_AVERAGE_SCORE){
        return 1;
    }
}