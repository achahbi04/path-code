package com.example;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
class AddTest {
  @Test
  void adds() {
    assertEquals(4, Add.add(2, 2));
  }
}
