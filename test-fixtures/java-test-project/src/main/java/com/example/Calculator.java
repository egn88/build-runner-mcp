package com.example;

/**
 * A simple calculator for testing build and test scenarios.
 */
public class Calculator {

    public int add(int a, int b) {
        return a + b;
    }

    public int subtract(int a, int b) {
        return a - b;
    }

    public int multiply(int a, int b) {
        return a * b;
    }

    public int divide(int a, int b) {
        if (b == 0) {
            throw new ArithmeticException("Division by zero");
        }
        return a / b;
    }

    public String formatResult(String operation, int result) {
        return String.format("Result of %s: %d", operation, result);
    }
}
