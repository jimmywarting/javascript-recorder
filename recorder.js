/**
 * JavaScript Recorder - Records and replays JavaScript operations using Proxies
 */

class Recorder {
  constructor(options = {}) {
    this.recordings = [];
    this.recordingEnabled = true;
    this.replayContext = options.replayContext || null;
    this.autoReplay = options.autoReplay !== false; // Default to true
    this.replayScheduled = false;
  }

  /**
   * Record an operation
   * @param {Object} operation - The operation to record
   */
  record(operation) {
    if (this.recordingEnabled) {
      this.recordings.push(operation);
      
      // Schedule automatic replay on next microtask if enabled
      if (this.autoReplay && this.replayContext && !this.replayScheduled) {
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

    // Helper to resolve arguments that might be object references
    const resolveArgs = (args) => {
      if (!args) return args;
      return args.map(arg => {
        // Check if this argument is a recorded object ID marker
        if (arg && typeof arg === 'object' && arg.__recordedObjectId) {
          return objectMap.get(arg.__recordedObjectId);
        }
        return arg;
      });
    };

    // Helper to resolve a value that might be an object reference
    const resolveValue = (val) => {
      if (val && typeof val === 'object' && val.__recordedObjectId) {
        return objectMap.get(val.__recordedObjectId);
      }
      return val;
    };

    switch (type) {
      case 'get': {
        const obj = objectMap.get(target) || context;
        const result = obj[property];
        if (resultId && result !== undefined && result !== null) {
          objectMap.set(resultId, result);
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
        }
        return result;
      }

      case 'construct': {
        const Constructor = objectMap.get(target);
        const resolvedArgs = resolveArgs(args);
        const result = new Constructor(...resolvedArgs);
        if (resultId && result !== undefined && result !== null) {
          objectMap.set(resultId, result);
        }
        return result;
      }

      default:
        throw new Error(`Unknown operation type: ${type}`);
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

  // Serialize arguments, converting proxy objects to their IDs
  function serializeArgs(args) {
    return args.map(arg => {
      if (arg && typeof arg === 'object') {
        const id = getObjectId(arg);
        if (id) {
          return { __recordedObjectId: id };
        }
      }
      if (arg && typeof arg === 'function') {
        const id = getObjectId(arg);
        if (id) {
          return { __recordedObjectId: id };
        }
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

// Export for ES modules
export { Recorder, createRecordHandler };
