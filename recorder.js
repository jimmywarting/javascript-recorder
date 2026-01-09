/**
 * JavaScript Recorder - Records and replays JavaScript operations using Proxies
 */

class Recorder {
  constructor(options = {}) {
    this.recordings = [];
    this.recordingEnabled = true;
    this.replayContext = options.replayContext || null;
    this.autoReplay = options.autoReplay ?? true; // Default to true
    this.replayScheduled = false;
    this.port = options.port || null; // MessagePort for cross-context communication
    this.objectRefCounts = new Map(); // Track reference counts for cross-context objects
    this.objectRegistry = new Map(); // Store actual objects for reference tracking
    this.useFinalization = options.useFinalization ?? true; // Enable finalization by default
    this.debug = options.debug ?? false; // Debug logging for finalization
    this.onerror = options.onerror || null; // Error handler callback
    
    // WeakMap to track functions to their MessageChannels (for reuse)
    this.functionChannels = new WeakMap();
    
    // Map to store MessageChannels for cleanup (weak references via FinalizationRegistry)
    this.activeChannels = new Map(); // channelId -> { port1, port2 }
    
    // Pending transferables to be sent with next operations batch
    this.pendingTransferables = [];
    
    // Set up FinalizationRegistry for automatic cleanup when objects are garbage collected
    if (this.useFinalization && typeof FinalizationRegistry !== 'undefined') {
      this.finalizationRegistry = new FinalizationRegistry((objectId) => {
        // Called when a proxy is garbage collected
        this._handleFinalization(objectId);
      });
      
      // FinalizationRegistry for MessageChannel cleanup when functions are GC'd
      this.channelFinalizationRegistry = new FinalizationRegistry((channelId) => {
        this._cleanupChannel(channelId);
      });
    } else {
      this.finalizationRegistry = null;
      this.channelFinalizationRegistry = null;
    }
    
    // If port is provided, set up message handler for receiving replay commands
    if (this.port) {
      this.port.onmessage = (event) => {
        this._handlePortMessage(event.data, event);
      };
      this.port.start();
    }
  }

  /**
   * Record an operation
   * @param {Object} operation - The operation to record
   */
  record(operation) {
    if (this.recordingEnabled) {
      this.recordings.push(operation);
      
      // If using MessagePort, send operations to the other context
      if (this.port && this.autoReplay) {
        if (!this.replayScheduled) {
          this.replayScheduled = true;
          queueMicrotask(() => {
            this.replayScheduled = false;
            this._sendOperationsViaPort();
          });
        }
      }
      // Otherwise use local replay context
      else if (this.autoReplay && this.replayContext && !this.replayScheduled) {
        this.replayScheduled = true;
        queueMicrotask(() => {
          this.replayScheduled = false;
          this._autoReplay();
        });
      }
    }
  }

  /**
   * Get all recorded operations
   * @returns {Array} Array of recorded operations
   */
  getRecordings() {
    return this.recordings;
  }

  /**
   * Clear all recordings
   */
  clear() {
    this.recordings = [];
  }

  /**
   * Pause recording
   */
  pause() {
    this.recordingEnabled = false;
  }

  /**
   * Resume recording
   */
  resume() {
    this.recordingEnabled = true;
  }

  /**
   * Set the replay context for automatic replay
   * @param {Object} context - The context to replay operations in
   */
  setReplayContext(context) {
    this.replayContext = context;
  }

  /**
   * Internal method for automatic replay
   * @private
   */
  _autoReplay() {
    if (!this.replayContext || this.recordings.length === 0) {
      return;
    }

    const recordingsToReplay = [...this.recordings];
    this.recordings = []; // Clear after copying

    this._replayRecordings(recordingsToReplay, this.replayContext);
  }

  /**
   * Manually replay recorded operations in a given context
   * @param {Object} context - The context to replay operations in
   */
  replay(context) {
    const recordingsToReplay = [...this.recordings];
    this.recordings = [];
    return this._replayRecordings(recordingsToReplay, context);
  }

  /**
   * Replay a set of recordings
   * @private
   */
  _replayRecordings(recordings, context) {
    const results = [];
    const objectMap = new Map();
    objectMap.set('globalThis', context);

    for (const operation of recordings) {
      try {
        const result = this._replayOperation(operation, context, objectMap);
        results.push(result);
      } catch (error) {
        console.error('Error replaying operation:', operation, error);
        results.push({ error: error.message });
      }
    }

    return results;
  }

  /**
   * Replay a single operation
   * @private
   */
  _replayOperation(operation, context, objectMap) {
    const { type, target, property, args, receiver, constructorName, value, resultId } = operation;

    // Helper to resolve arguments that might be object references or function channels
    const resolveArgs = (args) => {
      if (!args) return args;
      return args.map(arg => {
        // Check if this is a function channel
        if (arg && typeof arg === 'object' && arg.__functionChannel) {
          // Create a wrapper function that sends messages through the channel
          return this._createFunctionFromChannel(arg.__functionChannel, objectMap);
        }
        
        // Check if this is a transferable stream marker
        if (arg && typeof arg === 'object' && arg.__transferableStream) {
          // The stream was transferred, it should be in the MessageEvent ports
          // For now, return undefined as we'll need to handle this differently
          return undefined;
        }
        
        // Check if this argument is a recorded object ID marker
        if (arg && typeof arg === 'object' && arg.__recordedObjectId) {
          return objectMap.get(arg.__recordedObjectId);
        }
        return arg;
      });
    };

    // Helper to resolve a value that might be an object reference or function channel
    const resolveValue = (val) => {
      if (val && typeof val === 'object') {
        if (val.__functionChannel) {
          return this._createFunctionFromChannel(val.__functionChannel, objectMap);
        }
        if (val.__transferableStream) {
          // The stream was transferred
          return undefined;
        }
        if (val.__recordedObjectId) {
          return objectMap.get(val.__recordedObjectId);
        }
      }
      return val;
    };

    switch (type) {
      case 'get': {
        const obj = objectMap.get(target) || context;
        const result = obj[property];
        if (resultId && result !== undefined && result !== null) {
          objectMap.set(resultId, result);
          // Store in registry for evaluate()
          this.objectRegistry.set(resultId, result);
        }
        return result;
      }

      case 'set': {
        const setObj = objectMap.get(target) || context;
        const resolvedValue = resolveValue(value);
        setObj[property] = resolvedValue;
        return true;
      }

      case 'apply': {
        const fn = objectMap.get(target);
        const thisArg = objectMap.get(receiver) || context;
        const resolvedArgs = resolveArgs(args);
        const result = fn.apply(thisArg, resolvedArgs);
        if (resultId && result !== undefined && result !== null) {
          objectMap.set(resultId, result);
          // Store in registry for evaluate()
          this.objectRegistry.set(resultId, result);
        }
        return result;
      }

      case 'construct': {
        const Constructor = objectMap.get(target);
        const resolvedArgs = resolveArgs(args);
        const result = new Constructor(...resolvedArgs);
        if (resultId && result !== undefined && result !== null) {
          objectMap.set(resultId, result);
          // Store in registry for evaluate()
          this.objectRegistry.set(resultId, result);
        }
        return result;
      }

      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  /**
   * Create a function wrapper that communicates through a MessageChannel
   * @private
   */
  _createFunctionFromChannel(channelId, objectMap) {
    // Return a function that sends calls through the channel
    return (...args) => {
      // Get the channel info
      const channelInfo = this.objectRegistry.get(channelId);
      if (!channelInfo || !channelInfo.port) {
        console.warn(`[Recorder] Function channel ${channelId} not found`);
        return;
      }
      
      // Serialize arguments - replace objects in objectMap with their IDs
      const serializedArgs = args.map(arg => {
        // Primitives can be sent directly
        if (arg === null || arg === undefined) return arg;
        if (typeof arg === 'string' || typeof arg === 'number' || 
            typeof arg === 'boolean' || typeof arg === 'bigint') {
          return arg;
        }
        
        // Check if this is an object from the replay context that we're tracking
        for (const [id, obj] of objectMap.entries()) {
          if (obj === arg) {
            return { __recordedObjectId: id };
          }
        }
        
        // For other objects, try to serialize them
        // If the object is not serializable, we'll get an error
        try {
          // Test if it can be structured cloned
          structuredClone(arg);
          return arg;
        } catch (e) {
          // Object is not serializable, return a placeholder
          console.warn(`[Recorder] Non-serializable argument in callback:`, e.message);
          return { __nonSerializable: true, type: typeof arg };
        }
      });
      
      // Send the function call
      try {
        channelInfo.port.postMessage({
          args: serializedArgs,
          callId: Math.random().toString(36)
        });
      } catch (error) {
        console.error('[Recorder] Error sending callback args:', error);
        if (this.onerror) {
          this.onerror(error);
        }
      }
    };
  }

  /**
   * Send operations to the other context via MessagePort
   * @private
   */
  _sendOperationsViaPort() {
    if (!this.port || this.recordings.length === 0) {
      return;
    }

    const recordingsToSend = [...this.recordings];
    this.recordings = []; // Clear after copying
    
    const transferablesToSend = [...this.pendingTransferables];
    this.pendingTransferables = []; // Clear after copying

    // Send operations through the port with transferables
    this.port.postMessage({
      type: 'replay',
      operations: recordingsToSend
    }, transferablesToSend);
  }

  /**
   * Handle messages received via MessagePort
   * @private
   */
  _handlePortMessage(data, event) {
    if (!data || typeof data !== 'object') {
      console.warn('[Recorder] Invalid message received via MessagePort:', data);
      return;
    }

    if (data.type === 'replay') {
      if (!Array.isArray(data.operations)) {
        console.warn('[Recorder] Invalid replay message: operations must be an array');
        return;
      }
      if (this.replayContext) {
        // Extract any transferred ports from the event
        const transferredPorts = event.ports || [];
        
        // Process operations to map function channels and streams to transferred ports
        let portIndex = 0;
        data.operations.forEach(op => {
          if (op.type === 'set' && op.value && typeof op.value === 'object') {
            if (op.value.__functionChannel) {
              // Map the channel ID to the transferred port
              if (portIndex < transferredPorts.length) {
                this.objectRegistry.set(op.value.__functionChannel, {
                  port: transferredPorts[portIndex++]
                });
              }
            }
          } else if (op.type === 'apply' && Array.isArray(op.args)) {
            op.args.forEach(arg => {
              if (arg && typeof arg === 'object' && arg.__functionChannel) {
                if (portIndex < transferredPorts.length) {
                  this.objectRegistry.set(arg.__functionChannel, {
                    port: transferredPorts[portIndex++]
                  });
                }
              }
            });
          }
        });
        
        // Replay operations received from the other context
        try {
          this._replayRecordings(data.operations, this.replayContext);
        } catch (error) {
          if (this.onerror) {
            this.onerror(error);
          } else {
            console.error('[Recorder] Error during replay:', error);
          }
        }
      }
    } else if (data.type === 'refCount') {
      if (typeof data.objectId !== 'string') {
        console.warn('[Recorder] Invalid refCount message: objectId must be a string');
        return;
      }
      if (typeof data.delta !== 'number') {
        console.warn('[Recorder] Invalid refCount message: delta must be a number');
        return;
      }
      // Handle reference count updates
      this._updateRefCount(data.objectId, data.delta);
    } else if (data.type === 'callFunction') {
      // Handle function call from the other context
      this._handleFunctionCall(data);
    } else if (data.type === 'registerFunction') {
      // Handle function registration from the other context
      this._handleFunctionRegistration(data, event);
    } else if (data.type === 'evaluate') {
      // Handle evaluate request
      this._handleEvaluateRequest(data);
    } else if (data.type === 'proxyGet') {
      // Handle proxy property access
      this._handleProxyGet(data);
    } else {
      console.warn('[Recorder] Unknown message type:', data.type);
    }
  }

  /**
   * Update reference count for an object
   * @private
   */
  _updateRefCount(objectId, delta) {
    const currentCount = this.objectRefCounts.get(objectId) || 0;
    const newCount = currentCount + delta;

    if (newCount < 0) {
      console.warn(`[Recorder] Reference count for ${objectId} would become negative (${newCount}). Setting to 0.`);
      this.objectRefCounts.delete(objectId);
      this.objectRegistry.delete(objectId);
      return;
    }

    if (newCount === 0) {
      // Clean up object when ref count reaches zero
      this.objectRefCounts.delete(objectId);
      this.objectRegistry.delete(objectId);
    } else {
      this.objectRefCounts.set(objectId, newCount);
    }
  }

  /**
   * Increment reference count for an object
   * @param {string} objectId - The object identifier
   */
  incrementRefCount(objectId) {
    this._updateRefCount(objectId, 1);
    
    // Send ref count update through port if available
    if (this.port) {
      this.port.postMessage({
        type: 'refCount',
        objectId: objectId,
        delta: 1
      });
    }
  }

  /**
   * Decrement reference count for an object
   * @param {string} objectId - The object identifier
   */
  decrementRefCount(objectId) {
    this._updateRefCount(objectId, -1);
    
    // Send ref count update through port if available
    if (this.port) {
      this.port.postMessage({
        type: 'refCount',
        objectId: objectId,
        delta: -1
      });
    }
  }

  /**
   * Clean up a MessageChannel
   * @private
   */
  _cleanupChannel(channelId) {
    const channel = this.activeChannels.get(channelId);
    if (channel) {
      channel.port1?.close();
      channel.port2?.close();
      this.activeChannels.delete(channelId);
      if (this.debug) {
        console.log(`[Recorder] Cleaned up MessageChannel ${channelId}`);
      }
    }
  }

  /**
   * Handle function call from the other context
   * @private
   */
  _handleFunctionCall(data) {
    // This is handled by the MessageChannel port directly
    // No action needed in the recorder itself
  }

  /**
   * Handle function registration from the other context
   * @private
   */
  _handleFunctionRegistration(data, event) {
    if (!this.replayContext) return;
    
    const { functionId, targetId, property, port } = data;
    
    // Store the port for later use
    if (!this.objectRegistry.has(functionId)) {
      this.objectRegistry.set(functionId, { port, targetId, property });
    }
  }

  /**
   * Handle evaluate request from the other context
   * @private
   */
  _handleEvaluateRequest(data) {
    const { objectId, responsePort } = data;
    
    if (!this.replayContext) {
      responsePort?.postMessage({ error: 'No replay context available' });
      return;
    }
    
    // Find the object in the object map
    const obj = this.objectRegistry.get(objectId);
    
    if (!obj) {
      responsePort?.postMessage({ error: `Object ${objectId} not found` });
      return;
    }
    
    try {
      // Send the actual object back
      responsePort?.postMessage({ result: obj });
    } catch (error) {
      responsePort?.postMessage({ error: error.message });
    }
  }

  /**
   * Handle proxy property get from the other context
   * @private
   */
  _handleProxyGet(data) {
    const { objectId, property, responsePort } = data;
    
    if (!this.replayContext) {
      responsePort?.postMessage({ error: 'No replay context available' });
      return;
    }
    
    const obj = this.objectRegistry.get(objectId);
    
    if (!obj) {
      responsePort?.postMessage({ error: `Object ${objectId} not found` });
      return;
    }
    
    try {
      const value = obj[property];
      responsePort?.postMessage({ result: value });
    } catch (error) {
      responsePort?.postMessage({ error: error.message });
    }
  }

  /**
   * Evaluate a proxy reference to get its actual value
   * @param {Object} proxyRef - The proxy reference with __recordedObjectId
   * @returns {Promise<any>} The actual value from the other context
   */
  async evaluate(proxyRef) {
    if (!this.port) {
      throw new Error('Cannot evaluate: no MessagePort configured');
    }
    
    // Extract objectId from proxy reference
    const objectId = proxyRef?.__recordedObjectId;
    if (!objectId) {
      throw new Error('Invalid proxy reference: missing __recordedObjectId');
    }
    
    // Create a new MessageChannel for this evaluation
    const channel = new MessageChannel();
    
    return new Promise((resolve, reject) => {
      channel.port1.onmessage = (event) => {
        channel.port1.close();
        channel.port2.close();
        
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      };
      
      // Send evaluate request with response port
      this.port.postMessage({
        type: 'evaluate',
        objectId,
        responsePort: channel.port2
      }, [channel.port2]);
    });
  }

  /**
   * Handle finalization when a proxy is garbage collected
   * @private
   */
  _handleFinalization(objectId) {
    // Decrement ref count when object is finalized
    const currentCount = this.objectRefCounts.get(objectId);
    if (currentCount !== undefined && currentCount > 0) {
      if (this.debug) {
        console.log(`[Recorder] Finalizing object ${objectId}, ref count: ${currentCount}`);
      }
      this._updateRefCount(objectId, -1);
      
      // Send finalization notification through port if available
      if (this.port) {
        this.port.postMessage({
          type: 'finalize',
          objectId: objectId
        });
      }
    }
  }

  /**
   * Register a proxy for finalization tracking
   * @param {Object} proxy - The proxy to track
   * @param {string} objectId - The object identifier
   */
  registerForFinalization(proxy, objectId) {
    if (this.finalizationRegistry) {
      this.finalizationRegistry.register(proxy, objectId, proxy);
    }
  }

  /**
   * Unregister a proxy from finalization tracking
   * @param {Object} proxy - The proxy to untrack
   */
  unregisterFromFinalization(proxy) {
    if (this.finalizationRegistry) {
      this.finalizationRegistry.unregister(proxy);
    }
  }

  /**
   * Dispose method for Symbol.dispose support
   */
  [Symbol.dispose]() {
    // Clean up all references
    this.objectRefCounts.clear();
    this.objectRegistry.clear();
    
    // Close the port if it exists
    if (this.port) {
      this.port.close();
      this.port = null;
    }
  }
}

/**
 * Create a recording handler for Proxy
 * @param {Recorder} recorder - The recorder instance
 * @param {string} targetId - Unique identifier for the target
 * @param {WeakMap} sharedObjectIds - Shared WeakMap for tracking object IDs across all proxies
 * @param {Object} sharedCounter - Shared counter object for generating unique IDs
 * @returns {Object} Proxy handler
 */
function createRecordHandler(recorder, targetId = 'globalThis', sharedObjectIds = null, sharedCounter = null) {
  // Use shared or create new tracking structures
  const objectIds = sharedObjectIds || new WeakMap();
  const counter = sharedCounter || { value: 0 };

  function getObjectId(obj) {
    if (obj === null || obj === undefined) {
      return null;
    }
    if (!objectIds.has(obj)) {
      objectIds.set(obj, `obj_${counter.value++}`);
    }
    return objectIds.get(obj);
  }

  // Check if an object already has an ID without creating one
  function hasObjectId(obj) {
    if (obj === null || obj === undefined) {
      return false;
    }
    return objectIds.has(obj);
  }

  // Helper to check if value is a stream that should be transferred
  function isTransferableStream(value) {
    if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
      return true;
    }
    if (typeof WritableStream !== 'undefined' && value instanceof WritableStream) {
      return true;
    }
    if (typeof TransformStream !== 'undefined' && value instanceof TransformStream) {
      return true;
    }
    return false;
  }

  // Helper to check if value can be structured cloned
  function isStructuredCloneable(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'symbol') return false;
    
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') {
      return true;
    }
    
    // Check for known structured cloneable types
    if (value instanceof Date || value instanceof RegExp) return true;
    if (value instanceof Map || value instanceof Set) return true;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
    if (value instanceof Blob || value instanceof File) return true;
    if (typeof ImageData !== 'undefined' && value instanceof ImageData) return true;
    
    // Plain objects and arrays are cloneable
    if (Array.isArray(value)) return true;
    if (Object.getPrototypeOf(value) === Object.prototype) return true;
    
    return false;
  }

  // Helper to create or reuse a MessageChannel for a function
  function getOrCreateFunctionChannel(fn) {
    // Check if we already have a channel for this function
    let channelInfo = recorder.functionChannels.get(fn);
    
    if (!channelInfo) {
      // Create a new MessageChannel for this function
      const channel = new MessageChannel();
      const channelId = `channel_${counter.value++}`;
      
      // Set up listener on port1 to execute the function when called
      channel.port1.onmessage = (event) => {
        const { args, callId, responsePort } = event.data;
        
        try {
          // Deserialize arguments - create proxy references for recorded objects
          const deserializedArgs = args.map(arg => {
            if (arg && typeof arg === 'object' && arg.__recordedObjectId) {
              // Return a proxy reference that can be used in this context
              return createProxyReferenceForCallback(arg.__recordedObjectId);
            }
            return arg;
          });
          
          // Call the function
          const result = fn(...deserializedArgs);
          
          // Send result back if responsePort provided
          if (responsePort) {
            responsePort.postMessage({ callId, result });
          }
        } catch (error) {
          if (responsePort) {
            responsePort.postMessage({ callId, error: error.message });
          } else if (recorder.onerror) {
            recorder.onerror(error);
          }
        }
      };
      
      channelInfo = {
        port2: channel.port2,
        channelId
      };
      
      // Store the channel for reuse
      recorder.functionChannels.set(fn, channelInfo);
      recorder.activeChannels.set(channelId, { port1: channel.port1, port2: channel.port2 });
      
      // Register for cleanup when function is GC'd
      if (recorder.channelFinalizationRegistry) {
        recorder.channelFinalizationRegistry.register(fn, channelId, fn);
      }
    }
    
    return channelInfo;
  }

  // Create a proxy reference for an object passed to a callback
  function createProxyReferenceForCallback(objectId) {
    // Create a proxy that records operations on the object from the other context
    const proxyHandler = {
      get(target, property) {
        if (property === '__recordedObjectId') {
          return objectId;
        }
        
        // For now, return a simple proxy that tracks the property access
        const resultId = `obj_${counter.value++}`;
        
        recorder.record({
          type: 'get',
          target: objectId,
          property: String(property),
          resultId: resultId
        });
        
        return createDummyObject(resultId);
      },
      
      set(target, property, value) {
        const serializedValue = (value && typeof value === 'object' && getObjectId(value))
          ? { __recordedObjectId: getObjectId(value) }
          : value;
        
        recorder.record({
          type: 'set',
          target: objectId,
          property: String(property),
          value: serializedValue
        });
        
        return true;
      }
    };
    
    const proxy = new Proxy({}, proxyHandler);
    objectIds.set(proxy, objectId);
    return proxy;
  }

  // Serialize arguments, converting proxy objects to their IDs
  function serializeArgs(args) {
    return args.map(arg => {
      // Check if this is a recorded object/proxy first (including function proxies)
      if (arg && typeof arg === 'object') {
        if (hasObjectId(arg)) {
          return { __recordedObjectId: getObjectId(arg) };
        }
      }
      
      // Check if this is a proxy function
      if (typeof arg === 'function') {
        if (hasObjectId(arg)) {
          // This is a proxy function, not a real callback
          return { __recordedObjectId: getObjectId(arg) };
        }
        
        // This is a real user function - create MessageChannel
        const channelInfo = getOrCreateFunctionChannel(arg);
        // Add port to transferables
        recorder.pendingTransferables.push(channelInfo.port2);
        return { __functionChannel: channelInfo.channelId };
      }
      
      // Handle streams - mark for transfer
      if (isTransferableStream(arg)) {
        recorder.pendingTransferables.push(arg);
        return { __transferableStream: true };
      }
      
      return arg;
    });
  }

  // Create a dummy function that acts as a placeholder
  function createDummyFunction(id) {
    const dummy = function() {};
    objectIds.set(dummy, id);
    return new Proxy(dummy, createRecordHandler(recorder, id, objectIds, counter));
  }

  // Create a dummy object that acts as a placeholder
  function createDummyObject(id) {
    const dummy = function() {}; // Use function as base to support both call and construct
    const proxy = new Proxy(dummy, createRecordHandler(recorder, id, objectIds, counter));
    objectIds.set(proxy, id); // Set ID on the proxy, not the dummy!
    
    // Add Symbol.dispose support directly to the proxy
    // This allows using the proxy with the `using` keyword
    // When an object is used with `using`, the runtime will access Symbol.dispose
    if (typeof Symbol.dispose !== 'undefined') {
      let disposeCalled = false;
      Object.defineProperty(proxy, Symbol.dispose, {
        value: function() {
          // Only decrement if we haven't already
          if (!disposeCalled && recorder && id) {
            // Unregister from finalization since we're manually disposing
            recorder.unregisterFromFinalization(proxy);
            recorder.decrementRefCount(id);
            disposeCalled = true;
          }
        },
        enumerable: false,
        configurable: true
      });
      
      // Increment ref count immediately when proxy is created
      // This represents the fact that the proxy exists and may be used
      if (recorder && id) {
        recorder.incrementRefCount(id);
      }
    }
    
    // Register proxy with FinalizationRegistry for automatic cleanup
    // This provides a fallback if the user doesn't manually dispose
    if (recorder && id) {
      recorder.registerForFinalization(proxy, id);
    }
    
    return proxy;
  }

  return {
    get(target, property, receiver) {
      // Special handling for common property checks
      if (property === 'then') {
        // Prevent proxy from being treated as a thenable
        return undefined;
      }
      if (property === Symbol.toStringTag) {
        return 'RecorderProxy';
      }
      if (property === Symbol.iterator) {
        return undefined;
      }
      
      // Don't actually get the value - just record the operation
      const resultId = `obj_${counter.value++}`;
      
      recorder.record({
        type: 'get',
        target: targetId,
        property: String(property),
        receiver: getObjectId(receiver),
        resultId: resultId
      });

      // Return a dummy proxy that can continue the chain
      return createDummyObject(resultId);
    },

    set(target, property, value, receiver) {
      // Handle function assignments
      if (typeof value === 'function') {
        const channelInfo = getOrCreateFunctionChannel(value);
        
        // Record the set operation with function channel info
        recorder.record({
          type: 'set',
          target: targetId,
          property: String(property),
          value: { __functionChannel: channelInfo.channelId },
          receiver: getObjectId(receiver)
        });
        
        // Add port to transferables
        recorder.pendingTransferables.push(channelInfo.port2);
        
        return true;
      }
      
      // Handle streams - mark for transfer
      if (isTransferableStream(value)) {
        recorder.record({
          type: 'set',
          target: targetId,
          property: String(property),
          value: { __transferableStream: true },
          receiver: getObjectId(receiver)
        });
        
        recorder.pendingTransferables.push(value);
        return true;
      }
      
      // Serialize value if it's a recorded object
      const serializedValue = (value && typeof value === 'object' && getObjectId(value))
        ? { __recordedObjectId: getObjectId(value) }
        : value;

      recorder.record({
        type: 'set',
        target: targetId,
        property: String(property),
        value: serializedValue,
        receiver: getObjectId(receiver)
      });

      // Don't actually set - just return true to indicate success
      return true;
    },

    apply(target, thisArg, argumentsList) {
      const resultId = `obj_${counter.value++}`;
      
      recorder.record({
        type: 'apply',
        target: targetId,
        receiver: getObjectId(thisArg),
        args: serializeArgs(argumentsList),
        resultId: resultId
      });

      // Don't actually call - return a dummy proxy
      return createDummyObject(resultId);
    },

    construct(target, argumentsList, newTarget) {
      const resultId = `obj_${counter.value++}`;
      
      recorder.record({
        type: 'construct',
        target: targetId,
        args: serializeArgs(argumentsList),
        constructorName: target?.name || 'Anonymous',
        resultId: resultId
      });

      // Don't actually construct - return a dummy proxy
      return createDummyObject(resultId);
    },

    has(target, property) {
      // Return true for all properties to allow continued chaining
      return true;
    }
  };
}

/**
 * RecordedObjectHandle - A wrapper for recorded objects that supports Symbol.dispose
 * This allows using the `using` keyword for automatic cleanup
 */
class RecordedObjectHandle {
  constructor(proxy, objectId, recorder) {
    this.proxy = proxy;
    this.objectId = objectId;
    this.recorder = recorder;
    
    // Increment ref count on creation
    if (recorder && objectId) {
      recorder.incrementRefCount(objectId);
    }
  }

  /**
   * Get the proxied object
   */
  get value() {
    return this.proxy;
  }

  /**
   * Dispose method for Symbol.dispose support
   * Automatically decrements reference count when scope exits
   */
  [Symbol.dispose]() {
    if (this.recorder && this.objectId) {
      this.recorder.decrementRefCount(this.objectId);
    }
  }
}

/**
 * Create a recorded object handle that supports `using` keyword
 * @param {Recorder} recorder - The recorder instance
 * @param {Object} target - The target to wrap (optional)
 * @returns {RecordedObjectHandle} A handle that supports Symbol.dispose
 */
function createRecordedObject(recorder, target = {}) {
  const handler = createRecordHandler(recorder);
  const proxy = new Proxy(target, handler);
  
  // Get the object ID from the handler (it will be 'globalThis' by default)
  return new RecordedObjectHandle(proxy, 'globalThis', recorder);
}

// Export for ES modules
export { Recorder, createRecordHandler, RecordedObjectHandle, createRecordedObject };
