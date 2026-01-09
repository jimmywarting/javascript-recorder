# Feature: Manual Transfer Utility Function

## Problem
Currently, only ReadableStream, WritableStream, and TransformStream are automatically transferred. For other transferable objects (ArrayBuffer, MessagePort, ImageBitmap, etc.), there's no way for developers to explicitly request transfer instead of proxying.

## Current Limitation
```javascript
// ArrayBuffer is proxied by default (inefficient)
const buffer = new ArrayBuffer(1024 * 1024); // 1MB
proxiedWindow.postMessageToWorker(buffer);  // Proxied, not transferred

// Cannot explicitly transfer
```

## Desired Behavior
```javascript
import { transfer } from './recorder.js';

// Mark object for transfer in next batch
const buffer = new ArrayBuffer(1024 * 1024);
transfer(buffer);
proxiedWindow.postMessageToWorker(buffer);  // Will be transferred

// Transfer multiple objects
const buffer1 = new ArrayBuffer(1024);
const buffer2 = new ArrayBuffer(2048);
transfer(buffer1, buffer2);
proxiedWindow.sendData(buffer1, buffer2);
```

## Implementation Approach

```javascript
// Export utility function
export function transfer(...objects) {
  // Get current recorder from some context (thread-local storage?)
  const recorder = getCurrentRecorder();
  if (!recorder) {
    throw new Error('transfer() can only be used with an active recorder');
  }
  
  // Add to pending transferables
  objects.forEach(obj => {
    if (isTransferable(obj)) {
      recorder.pendingTransferables.push(obj);
    } else {
      console.warn('Object is not transferable:', obj);
    }
  });
}

function isTransferable(obj) {
  return obj instanceof ArrayBuffer ||
         obj instanceof MessagePort ||
         obj instanceof ImageBitmap ||
         (typeof OffscreenCanvas !== 'undefined' && obj instanceof OffscreenCanvas) ||
         obj instanceof ReadableStream ||
         obj instanceof WritableStream ||
         obj instanceof TransformStream;
}
```

## Challenges

1. **Recorder Context**: How to access the current recorder from the utility function?
   - Thread-local storage?
   - Global registry keyed by thread ID?
   - Pass recorder explicitly: `transfer(recorder, buffer)`?

2. **Timing**: Transfer must happen in the same microtask as the operation
   - Objects added to `pendingTransferables` are sent with next batch
   - This should work with current implementation

3. **One-time Use**: Transferred objects become detached
   - Document that transferred objects can't be used again
   - Consider warning if object is already detached

## Alternative Design

```javascript
// More explicit API
recorder.transfer(buffer);
proxiedWindow.sendData(buffer);  // Will be transferred

// Or chaining
recorder.transfer(buffer).send();
```

## Benefits
- Gives developers control over transfer vs proxy
- Improves performance for large binary data
- Follows principle of explicit over implicit

## Related Code
- `isTransferableStream()` in recorder.js (current auto-detection)
- `pendingTransferables` array
- `serializeArgs()` function

## Priority
Low-Medium - Useful optimization but current auto-transfer works for streams

## Related Issue
Mentioned in #2 (Bidirectional Function Callbacks) maintainer comments
