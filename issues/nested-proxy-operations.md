# Feature: Nested Proxy Operations in Callbacks

## Problem
When a callback function (executed in the recording context) tries to perform operations on proxy objects, those operations are not properly recorded and replayed in the replay context.

## Current Limitation
```javascript
let clickCount = 0;
button.onclick = function(event) {
  clickCount++;
  // This operation is recorded but not replayed
  button.innerText = `Clicks: ${clickCount}`;
  // Result: button text on main thread doesn't update
}
```

## Root Cause
When `button.innerText = ...` is executed inside the callback:
1. The operation IS recorded in the recording context
2. The recordings are scheduled for replay
3. However, the operations may not reach the replay context or are not properly handled

## Desired Behavior
```javascript
button.onclick = function(event) {
  clickCount++;
  button.innerText = `Clicks: ${clickCount}`;  // Should update in replay context
  button.classList.add('clicked');             // Should work
  button.style.color = 'red';                  // Should work
}
```

## Implementation Considerations

1. **Recording in Callback Context**: Operations on proxies inside callbacks need to be recorded
2. **Separate Message Flow**: These operations may need their own message flow back to the replay context
3. **Async Coordination**: The callback completes before the operations are replayed
4. **Potential Solution**: 
   - Keep the proxy reference active and connected to the port
   - Ensure recordings inside callbacks are properly sent
   - May need to ensure the recorder port is accessible inside the callback scope

## Related Code
- Example in `example-bidirectional.js` shows this limitation
- `createProxyReferenceForCallback()` in recorder.js
- Recording scheduling in `record()` method

## Test Case
See test in `example-bidirectional.js` where button text stays at "Click me: 0"

## Priority
High - This is a key use case for bidirectional callbacks

## Related Issue
Part of #2 (Bidirectional Function Callbacks)
