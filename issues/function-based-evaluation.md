# Feature: Function-Based Evaluation

## Problem
Currently, `evaluate()` can only materialize the proxy reference itself. Sometimes you need to execute code in the replay context to compute a derived value or perform operations that aren't easily expressible with just property access.

## Current Limitation
```javascript
// Can only get the reference
const canvas = await recorder.evaluate(canvasRef);

// Cannot execute arbitrary code in replay context
// If you need imageData, you must:
// 1. Get canvas
// 2. Get context from canvas (separate call)
// 3. Call getImageData (not possible remotely)
```

## Desired Behavior
```javascript
// Execute function in replay context with proxy references
const result = await recorder.evaluate((canvas, ctx) => {
  return {
    width: canvas.width,
    height: canvas.height,
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
  };
}, canvasRef, ctxRef);

// Complex computations in replay context
const metrics = await recorder.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return {
    width: rect.width,
    height: rect.height,
    backgroundColor: style.backgroundColor,
    visible: rect.width > 0 && rect.height > 0
  };
}, elementRef);
```

## Implementation Approach
Based on the original design document:

1. Detect when first argument to `evaluate()` is a function
2. Serialize the function as a string: `fn.toString()`
3. Extract proxy reference IDs from remaining arguments
4. Send function string + reference IDs to replay context
5. In replay context:
   - Resolve proxy reference IDs to actual objects
   - Create function from string: `new Function('return ' + fnString)()`
   - Call function with resolved arguments
   - Serialize and return result

## Security Considerations
- Function serialization allows arbitrary code execution in replay context
- Should document this as a potential security concern
- Consider adding an opt-in flag: `recorder.evaluate(fn, args, { allowFunctions: true })`
- Or separate method: `recorder.evaluateFunction(fn, ...args)`

## Example Implementation
```javascript
async evaluate(fnOrRef, ...refs) {
  if (typeof fnOrRef === 'function') {
    // Function-based evaluation
    return this._sendFunctionEvaluate(fnOrRef.toString(), refs);
  } else if (typeof fnOrRef === 'object' && !fnOrRef.__recordedObjectId) {
    // Batch evaluation (separate feature)
    return this._sendBatchEvaluate(fnOrRef);
  } else {
    // Single value (current implementation)
    return this._sendSingleEvaluate(fnOrRef);
  }
}
```

## Benefits
- Powerful for complex operations
- Reduces round-trips for computed values
- Enables operations that can't be done remotely

## Risks
- Security: arbitrary code execution
- Serialization: closures and external variables won't work
- Debugging: errors in serialized functions harder to trace

## Related Code
- `evaluate()` method in recorder.js
- `_handleEvaluateRequest()` needs extension for function mode

## Priority
Low - Powerful feature but adds complexity and security concerns

## Related Issue
Part of #2 (Bidirectional Function Callbacks), original design document
