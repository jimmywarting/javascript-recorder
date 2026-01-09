/**
 * Tests for JavaScript Recorder
 */

import { Recorder, createRecordHandler } from './recorder.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('Running JavaScript Recorder Tests\n');

// Test 1: Recorder creation
test('Recorder can be created', () => {
  const recorder = new Recorder();
  assert(recorder instanceof Recorder, 'Recorder should be an instance of Recorder');
  assert(Array.isArray(recorder.recordings), 'Recordings should be an array');
  assert(recorder.recordings.length === 0, 'Recordings should start empty');
});

// Test 2: Record property access
test('Records property access', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = { name: 'test', value: 42 };
  const proxied = new Proxy(obj, handler);
  
  const name = proxied.name;
  
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  assert(recorder.recordings[0].type === 'get', 'Should record get operation');
  assert(recorder.recordings[0].property === 'name', 'Should record correct property');
});

// Test 3: Record multiple property accesses
test('Records multiple property accesses', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = { a: 1, b: 2, c: 3 };
  const proxied = new Proxy(obj, handler);
  
  proxied.a;
  proxied.b;
  proxied.c;
  
  assert(recorder.recordings.length >= 3, 'Should have recorded at least 3 operations');
});

// Test 4: Record function calls
test('Records function calls', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = {
    add: (a, b) => a + b
  };
  const proxied = new Proxy(obj, handler);
  
  const result = proxied.add(5, 3);
  
  assert(result === 8, 'Function should work correctly');
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  assert(
    recorder.recordings.some(r => r.type === 'apply'),
    'Should record apply operation'
  );
});

// Test 5: Record constructor calls
test('Records constructor calls', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  
  class TestClass {
    constructor(value) {
      this.value = value;
    }
  }
  
  const obj = { TestClass };
  const proxied = new Proxy(obj, handler);
  
  const instance = new proxied.TestClass(42);
  
  assert(instance.value === 42, 'Constructor should work correctly');
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  assert(
    recorder.recordings.some(r => r.type === 'construct'),
    'Should record construct operation'
  );
});

// Test 6: Pause and resume recording
test('Can pause and resume recording', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = { a: 1, b: 2 };
  const proxied = new Proxy(obj, handler);
  
  proxied.a;
  const countAfterFirst = recorder.recordings.length;
  
  recorder.pause();
  proxied.b;
  const countAfterPause = recorder.recordings.length;
  
  recorder.resume();
  proxied.a;
  const countAfterResume = recorder.recordings.length;
  
  assert(countAfterPause === countAfterFirst, 'Should not record while paused');
  assert(countAfterResume > countAfterPause, 'Should record after resume');
});

// Test 7: Clear recordings
test('Can clear recordings', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = { a: 1 };
  const proxied = new Proxy(obj, handler);
  
  proxied.a;
  assert(recorder.recordings.length > 0, 'Should have recordings');
  
  recorder.clear();
  assert(recorder.recordings.length === 0, 'Recordings should be cleared');
});

// Test 8: Get recordings
test('Can get recordings', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = { test: 'value' };
  const proxied = new Proxy(obj, handler);
  
  proxied.test;
  const recordings = recorder.getRecordings();
  
  assert(Array.isArray(recordings), 'Should return an array');
  assert(recordings.length > 0, 'Should have recordings');
});

// Test 9: Record property set
test('Records property set', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = {};
  const proxied = new Proxy(obj, handler);
  
  proxied.newProp = 'value';
  
  assert(obj.newProp === 'value', 'Property should be set');
  assert(
    recorder.recordings.some(r => r.type === 'set'),
    'Should record set operation'
  );
});

// Test 10: Nested object access
test('Records nested object access', () => {
  const recorder = new Recorder();
  const handler = createRecordHandler(recorder);
  const obj = {
    nested: {
      value: 42
    }
  };
  const proxied = new Proxy(obj, handler);
  
  const value = proxied.nested.value;
  
  assert(value === 42, 'Should access nested value');
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
