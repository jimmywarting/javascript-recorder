/**
 * Example usage of the JavaScript Recorder
 */

import { Recorder, createRecordHandler } from './recorder.js';

// Create a recorder instance
const recorder = new Recorder();

// Create a recording handler
const recordHandler = createRecordHandler(recorder);

// Example 1: Record property access
console.log('Example 1: Recording property access');
const testObj = { name: 'test', value: 42 };
const proxiedObj = new Proxy(testObj, recordHandler);
const name = proxiedObj.name;
const value = proxiedObj.value;
console.log('Accessed:', name, value);

// Example 2: Record function calls
console.log('\nExample 2: Recording function calls');
const mathObj = {
  add: (a, b) => a + b,
  multiply: (a, b) => a * b
};
const proxiedMath = new Proxy(mathObj, recordHandler);
const sum = proxiedMath.add(5, 3);
const product = proxiedMath.multiply(4, 7);
console.log('Results:', sum, product);

// Example 3: Record constructor calls (simulated)
console.log('\nExample 3: Recording constructor-like operations');
class MyClass {
  constructor(value) {
    this.value = value;
  }
  getValue() {
    return this.value;
  }
}

const classContainer = { MyClass };
const proxiedContainer = new Proxy(classContainer, recordHandler);
const instance = new proxiedContainer.MyClass(100);
console.log('Instance created with value:', instance.getValue());

// Example 4: Show recordings
console.log('\nRecorded operations:');
console.log(JSON.stringify(recorder.getRecordings(), null, 2));

// Example 5: Demonstrate globalThis wrapping (concept)
console.log('\nExample 5: Concept of wrapping globalThis');
console.log('You can wrap globalThis like this:');
console.log('globalThis.globalThis = new Proxy(globalThis, recordHandler);');
console.log('Then all operations on globalThis will be recorded.');

console.log('\nRecording complete! Total operations recorded:', recorder.getRecordings().length);
