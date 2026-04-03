CC = gcc
CFLAGS = -Wall -Wextra -O2 -DCJSON_HIDE_SYMBOLS -Ilib -Isrc
LDFLAGS = -lm

SRC_DIR = src
LIB_DIR = lib
BUILD_DIR = build

SOURCES = $(SRC_DIR)/server_pool.c \
          $(SRC_DIR)/load_balancer.c \
          $(SRC_DIR)/cache.c \
          $(SRC_DIR)/predictor.c \
          $(SRC_DIR)/scaler.c \
          $(SRC_DIR)/metrics.c \
          $(SRC_DIR)/main.c \
          $(LIB_DIR)/cJSON.c

OBJECTS = $(patsubst %.c,$(BUILD_DIR)/%.o,$(notdir $(SOURCES)))
TARGET = $(BUILD_DIR)/engine

.PHONY: all clean

all: $(BUILD_DIR) $(TARGET)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $(TARGET) $(LDFLAGS)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/cJSON.o: $(LIB_DIR)/cJSON.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -rf $(BUILD_DIR)
