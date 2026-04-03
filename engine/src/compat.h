#ifndef COMPAT_H
#define COMPAT_H

/*
 * Cross-platform threading compatibility layer.
 * Uses Win32 threads on Windows, pthreads elsewhere.
 */

#ifdef _WIN32

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

typedef CRITICAL_SECTION compat_mutex_t;
typedef HANDLE compat_thread_t;

static inline void compat_mutex_init(compat_mutex_t *m) {
    InitializeCriticalSection(m);
}
static inline void compat_mutex_destroy(compat_mutex_t *m) {
    DeleteCriticalSection(m);
}
static inline void compat_mutex_lock(compat_mutex_t *m) {
    EnterCriticalSection(m);
}
static inline void compat_mutex_unlock(compat_mutex_t *m) {
    LeaveCriticalSection(m);
}

typedef DWORD (WINAPI *compat_thread_func)(LPVOID);

static inline int compat_thread_create(compat_thread_t *t, DWORD (WINAPI *func)(LPVOID), void *arg) {
    *t = CreateThread(NULL, 0, func, arg, 0, NULL);
    return (*t == NULL) ? -1 : 0;
}
static inline void compat_thread_join(compat_thread_t t) {
    WaitForSingleObject(t, INFINITE);
    CloseHandle(t);
}

static inline void compat_sleep_ms(int ms) {
    Sleep(ms);
}

#else /* POSIX */

#include <pthread.h>
#include <time.h>

typedef pthread_mutex_t compat_mutex_t;
typedef pthread_t compat_thread_t;

static inline void compat_mutex_init(compat_mutex_t *m) {
    pthread_mutex_init(m, NULL);
}
static inline void compat_mutex_destroy(compat_mutex_t *m) {
    pthread_mutex_destroy(m);
}
static inline void compat_mutex_lock(compat_mutex_t *m) {
    pthread_mutex_lock(m);
}
static inline void compat_mutex_unlock(compat_mutex_t *m) {
    pthread_mutex_unlock(m);
}

static inline int compat_thread_create(compat_thread_t *t, void *(*func)(void *), void *arg) {
    return pthread_create(t, NULL, func, arg);
}
static inline void compat_thread_join(compat_thread_t t) {
    pthread_join(t, NULL);
}

static inline void compat_sleep_ms(int ms) {
    struct timespec ts;
    ts.tv_sec = ms / 1000;
    ts.tv_nsec = (ms % 1000) * 1000000L;
    nanosleep(&ts, NULL);
}

#endif /* _WIN32 */

#endif /* COMPAT_H */
