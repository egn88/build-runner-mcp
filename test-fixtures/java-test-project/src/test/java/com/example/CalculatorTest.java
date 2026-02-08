package com.example;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for Calculator with various pass/fail/error scenarios.
 */
class CalculatorTest {

    private Calculator calculator;

    @BeforeEach
    void setUp() {
        calculator = new Calculator();
    }

    // ========== PASSING TESTS ==========

    @Test
    @DisplayName("Add two positive numbers")
    void testAddPositiveNumbers() {
        assertEquals(5, calculator.add(2, 3));
    }

    @Test
    @DisplayName("Subtract numbers")
    void testSubtract() {
        assertEquals(2, calculator.subtract(5, 3));
    }

    @Test
    @DisplayName("Multiply numbers")
    void testMultiply() {
        assertEquals(15, calculator.multiply(3, 5));
    }

    // ========== FAILING TESTS ==========
    // Uncomment these to test failure parsing

    // @Test
    // @DisplayName("This test fails with assertion error")
    // void testFailingAssertion() {
    //     assertEquals(10, calculator.add(2, 3), "Expected 10 but got 5");
    // }

    // @Test
    // @DisplayName("This test fails comparing strings")
    // void testFailingStringComparison() {
    //     String result = calculator.formatResult("addition", 5);
    //     assertEquals("Wrong result", result);
    // }

    // ========== ERROR TESTS ==========
    // Uncomment these to test error parsing

    // @Test
    // @DisplayName("This test throws NullPointerException")
    // void testNullPointerError() {
    //     Calculator nullCalc = null;
    //     nullCalc.add(1, 2); // NPE here
    // }

    // @Test
    // @DisplayName("This test throws custom exception")
    // void testDivideByZeroError() {
    //     // This will throw ArithmeticException
    //     calculator.divide(10, 0);
    // }
}
