# Java Test Project for build-runner MCP

This is a minimal Maven project for testing the build-runner MCP tool's error parsing capabilities.

## Project Structure

```
src/
├── main/java/com/example/
│   ├── Calculator.java           # Valid class that compiles
│   └── CompileError.java.disabled # Rename to .java to test compile errors
└── test/java/com/example/
    ├── CalculatorTest.java       # Passing tests
    ├── FailingTest.java          # Tests that FAIL (assertion errors)
    └── ErrorTest.java            # Tests that throw ERRORS (exceptions)
```

## Test Scenarios

### 1. Successful Compilation and Passing Tests
```bash
mvn test -Dtest=CalculatorTest
```

### 2. Test Failures (Assertion Errors)
```bash
mvn test -Dtest=FailingTest
```
Expected: 3 test failures with assertion error messages

### 3. Test Errors (Exceptions)
```bash
mvn test -Dtest=ErrorTest
```
Expected: 4 test errors with exception stack traces:
- NullPointerException
- ArithmeticException
- IllegalArgumentException
- RuntimeException with cause

### 4. Mixed Failures and Errors
```bash
mvn test -Dtest=FailingTest,ErrorTest
```
Expected: 3 failures + 4 errors

### 5. Compilation Errors
```bash
# First, enable the broken file
mv src/main/java/com/example/CompileError.java.disabled src/main/java/com/example/CompileError.java

# Then try to compile
mvn compile

# Restore after testing
mv src/main/java/com/example/CompileError.java src/main/java/com/example/CompileError.java.disabled
```

## Using with build-runner MCP

```javascript
// Test compilation
mcp__build-runner__compile_project({ projectPath: "/path/to/test-fixtures/java-test-project" })

// Test passing tests
mcp__build-runner__run_tests({ projectPath: "/path/to/test-fixtures/java-test-project", testPattern: "CalculatorTest" })

// Test failures
mcp__build-runner__run_tests({ projectPath: "/path/to/test-fixtures/java-test-project", testPattern: "FailingTest" })

// Test errors
mcp__build-runner__run_tests({ projectPath: "/path/to/test-fixtures/java-test-project", testPattern: "ErrorTest" })
```
