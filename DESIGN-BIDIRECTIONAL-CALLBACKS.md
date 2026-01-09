# Design Discussion: Bidirectional Function Callbacks with Cross-Context Communication

## Overview

This document outlines a design for supporting function assignment across contexts, enabling bidirectional communication between worker threads and the main thread. This is a significant architectural enhancement to the JavaScript recorder.

## Problem Statement

Currently, the recorder operates in a unidirectional model: record operations in one context → replay in another context. However, when assigning event handlers or callbacks in a worker, we need bidirectional communication:

```javascript
// Worker thread
let counter = 0
using button = proxiedWindow.document.createElement('button')
button.innerText = 'click me: 0'
button.onclick = function clickHandler(proxyEvent) {
  counter++
  proxyEvent.target.innerText = 'click me: ' + counter
}
```

When `clickHandler` is triggered in the main thread, it needs to execute in the worker context where `counter` and other worker-local state exists.

## Requirements

### 1. Function Assignment Detection
- Detect when a function is assigned to a property (e.g., `button.onclick = handler`)
- Support various assignment patterns: event handlers, callbacks, method assignments

### 2. MessageChannel Management
- Create a new MessageChannel for each function assignment
- Manage bidirectional communication between contexts
- Handle multiple concurrent function calls

### 3. Event Proxying
- Events are not serializable/transferable across contexts
- Create proxy references for Event objects
- Forward method calls on proxy events back to the original context

### 4. Transferable Detection
- Identify transferable objects: File, ArrayBuffer, MessagePort, ReadableStream, WritableStream
- Automatically transfer instead of proxying when possible
- Handle streams specially for pipeTo/pipeThrough operations

### 5. Evaluate Mechanism
- Provide `evaluate()` function to materialize proxy references
- Support single value evaluation: `await evaluate(ref)`
- Support batch evaluation: `await evaluate({ x: ref.x, y: ref.y })`
- Support function-based evaluation: `await evaluate((ref1, ref2) => ({ x: ref1.x, y: ref2.y }), ref1, ref2)`

## Proposed Architecture

### Core Components

#### 1. FunctionRegistry
Manages function references and their associated MessageChannels.

```javascript
class FunctionRegistry {
  constructor(recorder) {
    this.recorder = recorder;
    this.functions = new Map(); // functionId -> { fn, port, channel }
    this.nextId = 0;
  }

  register(fn) {
    const functionId = `fn_${this.nextId++}`;
    const channel = new MessageChannel();
    
    // Set up listener in current context
    channel.port1.onmessage = (event) => {
      const { args, callId } = event.data;
      const result = fn(...args.map(this.deserializeArg));
      channel.port1.postMessage({ callId, result });
    };
    
    this.functions.set(functionId, { fn, port: channel.port1, channel });
    return { functionId, port: channel.port2 };
  }

  deserializeArg(arg) {
    if (arg && arg.__recordedObjectId) {
      // Return a proxy reference to the object in the other context
      return this.createProxyReference(arg.__recordedObjectId);
    }
    return arg;
  }
}
```

#### 2. TransferableDetector
Identifies and handles transferable objects.

```javascript
class TransferableDetector {
  static isTransferable(value) {
    return value instanceof ArrayBuffer ||
           value instanceof MessagePort ||
           value instanceof ReadableStream ||
           value instanceof WritableStream ||
           value instanceof ImageBitmap ||
           (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas);
  }

  static shouldTransfer(value) {
    // Files are transferable but we might want to proxy them for convenience
    if (value instanceof File) {
      return false; // Decision point: transfer or proxy?
    }
    return this.isTransferable(value);
  }

  static collectTransferables(value, transfers = []) {
    if (this.shouldTransfer(value)) {
      transfers.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(v => this.collectTransferables(v, transfers));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(v => this.collectTransferables(v, transfers));
    }
    return transfers;
  }
}
```

#### 3. EventProxier
Creates proxy references for non-transferable objects like Events.

```javascript
class EventProxier {
  constructor(recorder) {
    this.recorder = recorder;
    this.proxyRefs = new Map(); // proxyId -> { port, channel }
  }

  createProxyReference(obj, objId) {
    const channel = new MessageChannel();
    
    // Create proxy that forwards operations to the original context
    const proxy = new Proxy({}, {
      get(target, property) {
        if (property === '__proxyId') return objId;
        
        // Send get request and wait for response
        return new Promise((resolve) => {
          const requestId = Math.random().toString(36);
          const listener = (event) => {
            if (event.data.requestId === requestId) {
              channel.port1.removeEventListener('message', listener);
              resolve(event.data.value);
            }
          };
          channel.port1.addEventListener('message', listener);
          channel.port1.start();
          channel.port1.postMessage({
            type: 'get',
            property,
            requestId
          });
        });
      }
    });
    
    // Set up listener in original context
    channel.port2.onmessage = (event) => {
      if (event.data.type === 'get') {
        const value = obj[event.data.property];
        channel.port2.postMessage({
          requestId: event.data.requestId,
          value: this.serialize(value)
        });
      }
    };
    
    this.proxyRefs.set(objId, { port: channel.port2, channel });
    return proxy;
  }

  serialize(value) {
    // Handle serialization of the value
    if (typeof value === 'function') {
      return { __type: 'function' };
    }
    return value;
  }
}
```

#### 4. Evaluator
Provides mechanism to materialize proxy references.

```javascript
class Evaluator {
  constructor(recorder, port) {
    this.recorder = recorder;
    this.port = port;
    this.pendingEvaluations = new Map();
  }

  async evaluate(refOrFn, ...refs) {
    const evalId = Math.random().toString(36);
    
    return new Promise((resolve, reject) => {
      this.pendingEvaluations.set(evalId, { resolve, reject });
      
      if (typeof refOrFn === 'function') {
        // Function-based evaluation
        this.port.postMessage({
          type: 'evaluate',
          evalId,
          mode: 'function',
          fn: refOrFn.toString(),
          refs: refs.map(r => r.__recordedObjectId || r)
        });
      } else if (typeof refOrFn === 'object') {
        // Batch evaluation
        this.port.postMessage({
          type: 'evaluate',
          evalId,
          mode: 'batch',
          requests: this.serializeBatchRequest(refOrFn)
        });
      } else {
        // Single value evaluation
        this.port.postMessage({
          type: 'evaluate',
          evalId,
          mode: 'single',
          ref: refOrFn.__recordedObjectId || refOrFn
        });
      }
    });
  }

  handleEvaluationResponse(data) {
    const { evalId, result, error } = data;
    const pending = this.pendingEvaluations.get(evalId);
    if (pending) {
      this.pendingEvaluations.delete(evalId);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  }
}
```

### Integration with Recorder

#### Modified Proxy Handler

```javascript
function createRecordHandler(recorder, targetId, objectIds, counter) {
  // ... existing code ...

  return {
    get(target, property, receiver) {
      // ... existing get logic ...
    },

    set(target, property, value, receiver) {
      // Detect function assignment
      if (typeof value === 'function') {
        // Register function and get port
        const { functionId, port } = recorder.functionRegistry.register(value);
        
        // Record the set operation with function ID
        recorder.record({
          type: 'set',
          target: targetId,
          property: property,
          value: { __functionId: functionId },
          receiver: receiverId
        });

        // Send the port to the other context
        if (recorder.port) {
          recorder.port.postMessage({
            type: 'registerFunction',
            functionId,
            targetId,
            property,
            port
          }, [port]);
        }

        return true;
      }

      // Handle transferable objects
      if (TransferableDetector.shouldTransfer(value)) {
        const transfers = TransferableDetector.collectTransferables(value);
        recorder.record({
          type: 'set',
          target: targetId,
          property: property,
          value: { __transferable: true },
          receiver: receiverId
        });

        if (recorder.port) {
          recorder.port.postMessage({
            type: 'transferValue',
            targetId,
            property,
            value
          }, transfers);
        }

        return true;
      }

      // ... existing set logic ...
    },

    apply(target, thisArg, argumentsList) {
      // ... existing apply logic ...
    },

    construct(target, argumentsList, newTarget) {
      // ... existing construct logic ...
    }
  };
}
```

## Usage Examples

### Example 1: Event Handler

```javascript
// Worker thread
import { Recorder, createRecordHandler } from './recorder.js';

const recorder = new Recorder({
  port: workerPort,
  autoReplay: true
});

const handler = createRecordHandler(recorder);
const proxiedWindow = new Proxy({}, handler);

let counter = 0;
using button = proxiedWindow.document.createElement('button');
button.innerText = 'click me: 0';
button.onclick = function clickHandler(proxyEvent) {
  counter++;
  proxyEvent.target.innerText = 'click me: ' + counter;
};
```

### Example 2: File Evaluation

```javascript
// Worker thread
const fileInput = proxiedWindow.document.querySelector('input[type="file"]');
const fileRef = fileInput.files[0];

// Get actual File object
const actualFile = await recorder.evaluate(fileRef);
const stream = actualFile.stream();
// Use the stream...
```

### Example 3: Batch Evaluation

```javascript
// Worker thread
const data = await recorder.evaluate({
  width: canvas.width,
  height: canvas.height,
  context: canvas.getContext('2d')
});

console.log(`Canvas size: ${data.width}x${data.height}`);
```

### Example 4: Function-based Evaluation

```javascript
// Worker thread
const result = await recorder.evaluate((canvas, ctx) => {
  return {
    width: canvas.width,
    height: canvas.height,
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
  };
}, canvasRef, ctxRef);
```

## Implementation Phases

### Phase 1: Function Registry (Weeks 1-2)
- Implement FunctionRegistry class
- Modify recorder to detect function assignments
- Create MessageChannel per function
- Basic bidirectional communication

### Phase 2: Event Proxying (Weeks 3-4)
- Implement EventProxier class
- Create proxy references for Events
- Forward method calls across contexts
- Handle event property access

### Phase 3: Transferable Detection (Week 5)
- Implement TransferableDetector class
- Identify transferable objects
- Automatically transfer when appropriate
- Special handling for streams

### Phase 4: Evaluator (Weeks 6-7)
- Implement Evaluator class
- Single value evaluation
- Batch evaluation
- Function-based evaluation

### Phase 5: Integration & Testing (Weeks 8-9)
- Integrate all components with Recorder
- Comprehensive test suite
- Browser demos
- Performance optimization

### Phase 6: Documentation (Week 10)
- API documentation
- Usage examples
- Migration guide
- Best practices

## Open Questions

1. **File Handling**: Should Files be transferred or proxied? Transfer is efficient but one-time-use. Proxy allows multiple reads but requires more communication.

2. **Stream Handling**: How to handle ReadableStream/WritableStream in pipeTo scenarios? Should we detect piping operations and automatically transfer?

3. **Async Functions**: Should we detect async functions and handle Promise returns specially?

4. **Memory Management**: How do we clean up MessageChannels when functions are no longer needed? Can we leverage FinalizationRegistry here?

5. **Error Handling**: How should errors in the remote function be communicated back? Stack traces?

6. **Performance**: What's the overhead of creating MessageChannels per function? Should we pool them?

7. **Garbage Collection**: How do we handle circular references between contexts?

## Performance Considerations

- **MessageChannel overhead**: Each function creates a MessageChannel. For apps with many event handlers, this could be significant.
- **Serialization costs**: Converting arguments and return values has overhead.
- **Latency**: Cross-context communication is async, adding latency to all function calls.

## Security Considerations

- **Function serialization**: Should we allow arbitrary function serialization? This could be a security risk.
- **Access control**: Should there be restrictions on which objects can be proxied across contexts?
- **Sandboxing**: Worker threads provide natural sandboxing, but proxy references break some isolation.

## Alternatives Considered

### Alternative 1: Comlink-style Approach
Use a library like Comlink that provides transparent proxy communication. However, this doesn't integrate well with our recording/replay model.

### Alternative 2: Structured Clone with Custom Handlers
Extend structured clone algorithm with custom handlers for functions. More complex but potentially more efficient.

### Alternative 3: Code Generation
Generate wrapper functions automatically at build time. Requires build step but eliminates runtime overhead.

## Conclusion

This design provides a comprehensive approach to bidirectional function callbacks with cross-context communication. It's complex but addresses all the requirements outlined in the original feature request.

The phased implementation approach allows for incremental development and testing. Each phase builds on the previous one, allowing for course correction based on learnings.

## Next Steps

1. **Community Feedback**: Gather feedback on this design from users and maintainers
2. **Prototype**: Build a minimal prototype of Phase 1 to validate the approach
3. **Benchmarking**: Test performance characteristics with realistic workloads
4. **Finalize Design**: Incorporate feedback and finalize the design
5. **Implementation**: Begin phased implementation

## References

- [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- [Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [MessageChannel API](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)
- [Comlink Library](https://github.com/GoogleChromeLabs/comlink)
- [FinalizationRegistry](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry)
