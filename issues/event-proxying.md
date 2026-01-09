# Feature: Full Event Object Proxying

## Problem
Currently, when callbacks receive event objects from the replay context (e.g., click events on DOM elements), these events are sent as placeholders (`{ __nonSerializable: true, type: 'object' }`) because Event objects cannot be serialized across contexts via postMessage.

## Current Limitation
```javascript
button.onclick = function(event) {
  // event is just { __nonSerializable: true, type: 'object' }
  // Cannot access event.target, event.type, etc.
}
```

## Desired Behavior
```javascript
button.onclick = function(proxyEvent) {
  // proxyEvent should be a proxy that forwards property access
  console.log(proxyEvent.type);        // Works
  console.log(proxyEvent.target);      // Returns another proxy
  proxyEvent.preventDefault();         // Calls method in other context
}
```

## Implementation Approach
Based on the original design document:

1. Create a MessageChannel for each non-serializable object passed to callbacks
2. Return a Proxy that intercepts property access and method calls
3. Forward all operations back to the original context via the MessageChannel
4. Handle nested property access (e.g., `event.target.tagName`)

## Related Code
- `_createFunctionFromChannel()` in recorder.js (currently sends placeholders)
- `createProxyReferenceForCallback()` in recorder.js (partial implementation exists)

## Dependencies
- Requires the bidirectional callback infrastructure (already implemented)
- May need to extend `_handlePortMessage()` to support proxy property requests

## Priority
Medium - Improves developer experience but callbacks work without full event access

## Related Issue
Part of #2 (Bidirectional Function Callbacks)
