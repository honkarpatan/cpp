// main.c
#include <stdio.h>
#include "math_utils.h"

int main() { 
    int num1, num2;
     
    printf("Enter first number: ");
    scanf("%d", &num1);
    
    printf("Enter second number: ");
  
    scanf("%d", &num2);
    
    printf("\n--- Results ---\n");
    
    printf("Addition: %d + %d = %d\n", num1, num2, add_numbers(num1, num2));
    printf("Subtraction: %d - %d = %d\n", num1, num2, subtract_numbers(num1, num2));
    printf("Multiplication: %d * %d = %d\n", num1, num2, multiply_numbers(num1, num2));
    
    if (num2 != 0) {
        printf("Division: %d / %d = %.2f\n", num1, num2, divide_numbers(num1, num2));
    } else {
        printf("Division: Cannot divide by zero!\n");
    }

    return 0;
}