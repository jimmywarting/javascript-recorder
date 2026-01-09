# javascript-recorder

This JavaScript module records exactly everything you do inside of JavaScript using JavaScript Proxies **without actually executing the operations**. Operations are recorded and can be automatically replayed in a different context.

## Overview

The JavaScript Recorder uses ES6 Proxies to intercept and record all JavaScript operations **without executing them**:
- Property access (get/set)
- Function calls
- Constructor invocations
- Nested object operations

**Key Feature**: Operations are NOT executed during recording - they only execute during replay. This allows you to "code" against APIs that don't exist in the current context (like DOM APIs in a Worker), record those operations, and replay them in the correct context (like the main thread).

## Installation

```bash
npm install javascript-recorder
```

Or simply clone and use:

```bash
git clone https://github.com/jimmywarting/javascript-recorder.git
```

**Note:** This package is ES module only. You must use `import` syntax, not `require()`.

## Usage

### Basic Example - Non-Executing Recording

```javascript
import { Recorder, createRecordHandler } from './recorder.js';

// Create a recorder instance
const recorder = new Recorder({ autoReplay: false });

// Create a recording handler
const recordHandler = createRecordHandler(recorder);

// Wrap an object with the recording proxy
const proxied = new Proxy({}, recordHandler);

// Operations are recorded but NOT executed
const value = proxied.document.createElement('div'); // Does NOT actually create an element
proxied.body.append(value); // Does NOT actually append anything

// View recordings
console.log(recorder.getRecordings());
// [
//   { type: 'get', property: 'document', resultId: 'obj_0', ... },
//   { type: 'get', property: 'createElement', resultId: 'obj_1', ... },
//   { type: 'apply', args: ['div'], resultId: 'obj_2', ... },
//   { type: 'get', property: 'body', resultId: 'obj_3', ... },
//   { type: 'get', property: 'append', resultId: 'obj_4', ... },
//   { type: 'apply', args: [{ __recordedObjectId: 'obj_2' }], ... }
// ]
```

### Automatic Replay - Worker to Main Thread Pattern

```javascript
// In a Worker
import { Recorder, createRecordHandler } from './recorder.js';

// Create recorder with automatic replay enabled
// Provide the real context where operations should execute
const recorder = new Recorder({
  replayContext: window, // or any target context
  autoReplay: true
});

const recordHandler = createRecordHandler(recorder);
const proxiedWindow = new Proxy({}, recordHandler);

// "Code" against the DOM without actually touching it
const ref = proxiedWindow.document.createElement('div');
proxiedWindow.document.body.append(ref);

// Operations are automatically replayed on the next microtask
// in the real window context!
```

### Manual Replay

```javascript
const recorder = new Recorder({ autoReplay: false });
const handler = createRecordHandler(recorder);
const proxied = new Proxy({}, handler);

// Record operations
const ref = proxied.document.createElement('div');
proxied.document.body.append(ref);

// Later, replay in actual context
const realWindow = window; // or any real context
recorder.replay(realWindow);
// Now the operations execute in the real context
```

## API

### `Recorder`

The main recorder class that stores all recorded operations.

#### Constructor Options

```javascript
new Recorder({
  replayContext: null,  // Context for automatic replay (default: null)
  autoReplay: true      // Enable automatic replay on microtask (default: true)
})
```

#### Methods

- `record(operation)` - Record an operation (usually called internally)
- `getRecordings()` - Get all recorded operations
- `clear()` - Clear all recordings
- `pause()` - Pause recording
- `resume()` - Resume recording
- `setReplayContext(context)` - Set the context for automatic replay
- `replay(context)` - Manually replay recorded operations in a given context

### `createRecordHandler(recorder, targetId, sharedObjectIds, sharedCounter)`

Creates a Proxy handler that records all operations without executing them.

**Parameters:**
- `recorder` - A `Recorder` instance
- `targetId` - (Optional) A unique identifier for the target object
- `sharedObjectIds` - (Internal) Shared WeakMap for tracking objects
- `sharedCounter` - (Internal) Shared counter for generating IDs

**Returns:** A Proxy handler object

## Recording Format

Each recorded operation is an object with the following structure:

```javascript
{
  type: 'get' | 'set' | 'apply' | 'construct',
  target: 'string',         // object identifier
  property: 'string',       // for get/set operations
  args: Array,              // for apply/construct operations
  value: any,               // for set operations
  receiver: 'string',       // receiver identifier
  constructorName: 'string',// for construct operations
  resultId: 'string'        // identifier for the result object
}
```

**Object References**: When an argument is a previously recorded object, it's serialized as:
```javascript
{ __recordedObjectId: 'obj_N' }
```

This allows the replay system to properly resolve object relationships.

## Examples

See the example files for complete working examples:

- `example-no-exec.js` - Demonstrates non-executing recording with automatic replay
- `example-rtc.js` - Shows the RTCPeerConnection use case
- `example.js` - General usage examples

Run any example:

```bash
node example-no-exec.js
```

## Testing

Run the test suite:

```bash
npm test
```

Or directly:

```bash
node test.js
```

## How It Works

The recorder uses ES6 Proxy traps to intercept operations **without executing them**:

1. **Property Access (get)**: When you access a property, the `get` trap records it and returns a dummy proxy instead of the actual value.

2. **Property Assignment (set)**: When you assign a value, the `set` trap records the operation but doesn't actually set anything.

3. **Function Calls (apply)**: When you call a function, the `apply` trap records the call with its arguments but doesn't execute the function. It returns a dummy proxy.

4. **Constructor Calls (construct)**: When you use `new` with a constructor, the `construct` trap records the instantiation but doesn't create the object. It returns a dummy proxy.

5. **Object Reference Tracking**: All returned proxies are tracked with unique IDs. When a proxy is used as an argument, it's serialized as an object ID reference.

6. **Automatic Replay**: If `autoReplay` is enabled and a `replayContext` is set, all recorded operations are automatically replayed on the next microtask in the real context.

All objects in recordings are referenced by their IDs, allowing proper reconstruction during replay.

## Use Cases

- **Worker-to-Main-Thread Communication**: Record DOM operations in a Worker, automatically replay them on the main thread
- **Testing**: Record operations for test replay without side effects
- **Debugging**: Track all operations without executing them
- **API Mocking**: "Code" against APIs that don't exist in the current context
- **Operation Queuing**: Batch operations and replay them later
- **Cross-Context Execution**: Record in one environment, execute in another

## Limitations

- Minimal performance overhead due to proxy wrapping
- Return values during recording are dummy proxies, not real values
- Some native APIs may have special behavior that's hard to replay
- Circular references are handled through ID tracking

## License

MIT

## Author

Jimmy Wärting

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.