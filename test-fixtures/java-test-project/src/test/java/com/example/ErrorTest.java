package com.example;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

/**
 * Tests that throw ERRORS (exceptions) for testing MCP error parsing.
 * Run with: mvn test -Dtest=ErrorTest
 */
class ErrorTest {

    @Test
    @DisplayName("NullPointerException test")
    void testNullPointerException() {
        String nullString = null;
        // This will throw NullPointerException
        nullString.length();
    }

    @Test
    @DisplayName("ArithmeticException - divide by zero")
    void testArithmeticException() {
        Calculator calculator = new Calculator();
        // This will throw ArithmeticException: Division by zero
        calculator.divide(10, 0);
    }

    @Test
    @DisplayName("IllegalArgumentException test")
    void testIllegalArgumentException() {
        throw new IllegalArgumentException("This is a custom illegal argument error message");
    }

    @Test
    @DisplayName("RuntimeException with cause")
    void testExceptionWithCause() {
        try {
            Integer.parseInt("not a number");
        } catch (NumberFormatException e) {
            throw new RuntimeException("Failed to parse value", e);
        }
    }
}
