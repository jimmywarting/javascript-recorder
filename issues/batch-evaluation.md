# Feature: Batch Evaluation Support

## Problem
Currently, `evaluate()` only supports single value evaluation. To get multiple properties from a proxy object requires multiple round-trips across contexts, which is inefficient.

## Current Limitation
```javascript
// Need 3 separate evaluate calls = 3 round-trips
const width = await recorder.evaluate(canvas.width);
const height = await recorder.evaluate(canvas.height);
const context = await recorder.evaluate(canvas.getContext('2d'));
```

## Desired Behavior
```javascript
// Single evaluate call = 1 round-trip
const data = await recorder.evaluate({
  width: canvas.width,
  height: canvas.height,
  context: canvas.getContext('2d')
});

console.log(`Canvas size: ${data.width}x${data.height}`);
```

## Implementation Approach
Based on the original design document:

1. Detect when `evaluate()` receives a plain object
2. Scan the object for proxy references (`__recordedObjectId`)
3. Send a batch request with all the object IDs and property paths
4. In the replay context, resolve all references and build the result object
5. Send back the serialized result

## Example Implementation
```javascript
async evaluate(refOrObj) {
  if (typeof refOrObj === 'object' && !refOrObj.__recordedObjectId) {
    // Batch evaluation mode
    const requests = this._serializeBatchRequest(refOrObj);
    // Send batch request, get back batch response
    return this._sendBatchEvaluate(requests);
  } else {
    // Single value mode (current implementation)
    return this._sendSingleEvaluate(refOrObj);
  }
}
```

## Benefits
- Reduced latency (one round-trip instead of many)
- More ergonomic API for common use cases
- Better performance for reading multiple properties

## Related Code
- `evaluate()` method in recorder.js (current single-value implementation)
- `_handleEvaluateRequest()` needs extension for batch mode

## Priority
Medium - Nice optimization but single-value evaluate works

## Related Issue
Part of #2 (Bidirectional Function Callbacks), original design document
