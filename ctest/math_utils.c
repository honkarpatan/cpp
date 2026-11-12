// math_utils.c
#include "math_utils.h"

int add_numbers(int a, int b) {
    return a + b;
}

int subtract_numbers(int a, int b) {
    return a - b;
}

int multiply_numbers(int a, int b) {
    return a * b;
}

float divide_numbers(int a, int b) {
    if (b == 0) {
        return 0.0f;
    }
    return (float)a / b;
}
