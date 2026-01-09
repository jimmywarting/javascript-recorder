/**
 * JavaScript Recorder - Records and replays JavaScript operations using Proxies
 */

class Recorder {
  constructor() {
    this.recordings = [];
    this.recordingEnabled = true;
  }

  /**
   * Record an operation
   * @param {Object} operation - The operation to record
   */
  record(operation) {
    if (this.recordingEnabled) {
      this.recordings.push(operation);
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
   * Replay recorded operations in a given context
   * @param {Object} context - The context to replay operations in
   */
  replay(context) {
    const results = [];
    const objectMap = new Map();
    objectMap.set('globalThis', context);

    for (const operation of this.recordings) {
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
    const { type, target, property, args, receiver, constructorName } = operation;

    switch (type) {
      case 'get':
        const obj = objectMap.get(target) || context;
        return obj[property];

      case 'set':
        const setObj = objectMap.get(target) || context;
        setObj[property] = operation.value;
        return true;

      case 'apply':
        const fn = objectMap.get(target);
        const thisArg = objectMap.get(receiver) || context;
        return fn.apply(thisArg, args);

      case 'construct':
        const Constructor = objectMap.get(target);
        return new Constructor(...args);

      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }
}

/**
 * Create a recording handler for Proxy
 * @param {Recorder} recorder - The recorder instance
 * @param {string} targetId - Unique identifier for the target
 * @returns {Object} Proxy handler
 */
function createRecordHandler(recorder, targetId = 'globalThis') {
  const objectIds = new WeakMap();
  let idCounter = 0;

  function getObjectId(obj) {
    if (!objectIds.has(obj)) {
      objectIds.set(obj, `obj_${idCounter++}`);
    }
    return objectIds.get(obj);
  }

  return {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      
      recorder.record({
        type: 'get',
        target: targetId,
        property: String(property),
        receiver: getObjectId(receiver)
      });

      // Wrap functions to record their calls
      if (typeof value === 'function') {
        const functionId = getObjectId(value);
        
        return new Proxy(value, {
          apply(target, thisArg, argumentsList) {
            recorder.record({
              type: 'apply',
              target: functionId,
              receiver: getObjectId(thisArg),
              args: argumentsList
            });
            
            const result = Reflect.apply(target, thisArg, argumentsList);
            
            // Wrap result objects to continue tracking
            if (result && typeof result === 'object') {
              const resultId = getObjectId(result);
              return new Proxy(result, createRecordHandler(recorder, resultId));
            }
            
            return result;
          },
          
          construct(target, argumentsList, newTarget) {
            const constructorId = getObjectId(target);
            
            recorder.record({
              type: 'construct',
              target: constructorId,
              args: argumentsList,
              constructorName: target.name
            });
            
            const result = Reflect.construct(target, argumentsList, newTarget);
            
            // Wrap constructed objects to continue tracking
            if (result && typeof result === 'object') {
              const resultId = getObjectId(result);
              return new Proxy(result, createRecordHandler(recorder, resultId));
            }
            
            return result;
          }
        });
      }

      // Wrap objects to continue tracking
      if (value && typeof value === 'object') {
        const valueId = getObjectId(value);
        return new Proxy(value, createRecordHandler(recorder, valueId));
      }

      return value;
    },

    set(target, property, value, receiver) {
      recorder.record({
        type: 'set',
        target: targetId,
        property: String(property),
        value: value,
        receiver: getObjectId(receiver)
      });

      return Reflect.set(target, property, value, receiver);
    }
  };
}

// Export for ES modules
export { Recorder, createRecordHandler };
