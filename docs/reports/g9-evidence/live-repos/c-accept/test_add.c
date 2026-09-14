#include <stdio.h>
#include <stdlib.h>
int add(int a, int b);
int main(void) {
  if (add(2, 2) != 4) {
    fprintf(stderr, "add failed\n");
    return 1;
  }
  return 0;
}
