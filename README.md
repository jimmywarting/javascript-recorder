# javascript-recorder

This JavaScript module records exactly everything you do inside of JavaScript using JavaScript Proxies.

## Overview

The JavaScript Recorder uses ES6 Proxies to intercept and record all JavaScript operations including:
- Property access (get/set)
- Function calls
- Constructor invocations
- Nested object operations

Once recorded, these operations can be replayed in another context.

## Installation

```bash
npm install javascript-recorder
```

Or simply clone and use:

```bash
git clone https://github.com/jimmywarting/javascript-recorder.git
```

## Usage

### Basic Example

```javascript
import { Recorder, createRecordHandler } from './recorder.js';

// Create a recorder instance
const recorder = new Recorder();

// Create a recording handler
const recordHandler = createRecordHandler(recorder);

// Wrap an object with the recording proxy
const myObj = { value: 42 };
const proxied = new Proxy(myObj, recordHandler);

// All operations are now recorded
proxied.value; // recorded as 'get'
proxied.newValue = 100; // recorded as 'set'

// View recordings
console.log(recorder.getRecordings());
```

### Recording Global Context

```javascript
import { Recorder, createRecordHandler } from './recorder.js';

const recorder = new Recorder();
const recordHandler = createRecordHandler(recorder);

// Wrap globalThis to record all global operations
globalThis.globalThis = new Proxy(globalThis, recordHandler);

// Now all operations are recorded
const peer = new RTCPeerConnection({});
// This constructor call is recorded!
```

### Recording Function Calls

```javascript
const recorder = new Recorder();
const handler = createRecordHandler(recorder);

const math = {
  add: (a, b) => a + b,
  multiply: (a, b) => a * b
};

const proxiedMath = new Proxy(math, handler);
proxiedMath.add(5, 3); // recorded
proxiedMath.multiply(4, 7); // recorded
```

### Recording Constructor Calls

```javascript
const recorder = new Recorder();
const handler = createRecordHandler(recorder);

class MyClass {
  constructor(value) {
    this.value = value;
  }
}

const container = { MyClass };
const proxied = new Proxy(container, handler);

const instance = new proxied.MyClass(42); // recorded
```

## API

### `Recorder`

The main recorder class that stores all recorded operations.

#### Methods

- `record(operation)` - Record an operation
- `getRecordings()` - Get all recorded operations
- `clear()` - Clear all recordings
- `pause()` - Pause recording
- `resume()` - Resume recording
- `replay(context)` - Replay recorded operations in a given context (experimental)

### `createRecordHandler(recorder, targetId)`

Creates a Proxy handler that records all operations.

**Parameters:**
- `recorder` - A `Recorder` instance
- `targetId` - (Optional) A unique identifier for the target object

**Returns:** A Proxy handler object

## Recording Format

Each recorded operation is an object with the following structure:

```javascript
{
  type: 'get' | 'set' | 'apply' | 'construct',
  target: 'string', // object identifier
  property: 'string', // for get/set operations
  args: Array, // for apply/construct operations
  value: any, // for set operations
  receiver: 'string', // receiver identifier
  constructorName: 'string' // for construct operations
}
```

## Examples

See `example.js` for a complete working example:

```bash
node example.js
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

The recorder uses ES6 Proxy traps to intercept operations:

1. **Property Access (get)**: When you access a property, the `get` trap records it and wraps the returned value if it's an object or function.

2. **Property Assignment (set)**: When you assign a value, the `set` trap records the operation.

3. **Function Calls (apply)**: When you call a function, a nested proxy's `apply` trap records the call with its arguments.

4. **Constructor Calls (construct)**: When you use `new` with a constructor, the `construct` trap records the instantiation.

All objects returned from these operations are automatically wrapped in proxies to continue the recording chain.

## Use Cases

- **Testing**: Record operations for test replay
- **Debugging**: Track all operations for debugging purposes
- **Auditing**: Monitor and log all JavaScript operations
- **Migration**: Record operations in one environment and replay in another
- **Learning**: Understand how code interacts with objects

## Limitations

- Performance overhead due to proxy wrapping
- Replay functionality is experimental and may not work for all contexts
- Some native APIs may not be fully compatible with proxies
- Circular references need careful handling

## License

MIT

## Author

Jimmy Wärting

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.