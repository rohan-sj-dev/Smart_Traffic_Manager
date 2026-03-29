#include "metrics.h"

float get_average_score(Server* servers, int server_count){
    float average_score = 0;
    
    for(int i = 0; i < server_count; i++){
        average_score += servers[i].score;
    }

    average_score /= (float)server_count;
    return average_score;
}