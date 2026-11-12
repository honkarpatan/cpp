#include <stdio.h>

int main() {
    int i;
    float num, sum = 0.0;
    int b ;

    scanf("%d", &b);
    printf("Enter %d numbers:\n", b);

    for(i = 1; i <= b; i++) {
        printf("Number %d: ", i);
        scanf("%f", &num);
        
        sum += num; 
    }
  
    printf("\nSum = %.2f\n", sum);

    return 0;
}
