package com.example;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests that are designed to FAIL for testing MCP error parsing.
 * Run with: mvn test -Dtest=FailingTest
 */
class FailingTest {

    @Test
    @DisplayName("Assertion failure with message")
    void testFailingAssertion() {
        int expected = 10;
        int actual = 5;
        assertEquals(expected, actual, "Expected sum to be 10 but Calculator returned 5");
    }

    @Test
    @DisplayName("String comparison failure")
    void testFailingStringComparison() {
        String expected = "Hello World";
        String actual = "Hello world"; // lowercase 'w'
        assertEquals(expected, actual);
    }

    @Test
    @DisplayName("Boolean assertion failure")
    void testFailingBoolean() {
        boolean result = false;
        assertTrue(result, "Expected the operation to return true");
    }
}
