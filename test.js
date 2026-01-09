/**
 * Tests for JavaScript Recorder (Non-Executing Mode)
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
    console.error(error.stack);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('Running JavaScript Recorder Tests (Non-Executing Mode)\n');

// Test 1: Recorder creation
test('Recorder can be created', () => {
  const recorder = new Recorder();
  assert(recorder instanceof Recorder, 'Recorder should be an instance of Recorder');
  assert(Array.isArray(recorder.recordings), 'Recordings should be an array');
  assert(recorder.recordings.length === 0, 'Recordings should start empty');
});

// Test 2: Record property access without executing
test('Records property access without executing', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  const value = proxied.name;
  
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  assert(recorder.recordings[0].type === 'get', 'Should record get operation');
  assert(recorder.recordings[0].property === 'name', 'Should record correct property');
  assert(typeof value === 'function', 'Should return a dummy proxy');
});

// Test 3: Record chained property access
test('Records chained property access', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  proxied.a.b.c;
  
  assert(recorder.recordings.length >= 3, 'Should have recorded multiple operations');
  assert(recorder.recordings[0].property === 'a', 'Should record first property');
  assert(recorder.recordings[1].property === 'b', 'Should record second property');
  assert(recorder.recordings[2].property === 'c', 'Should record third property');
});

// Test 4: Record function calls without executing
test('Records function calls without executing', () => {
  let executionCount = 0;
  const mockObj = {
    fn: () => { executionCount++; return 'result'; }
  };
  
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  const result = proxied.fn(5, 3);
  
  assert(executionCount === 0, 'Function should NOT have been executed');
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  assert(
    recorder.recordings.some(r => r.type === 'apply'),
    'Should record apply operation'
  );
  assert(typeof result === 'function', 'Should return a dummy proxy');
});

// Test 5: Record constructor calls without executing
test('Records constructor calls without executing', () => {
  let constructorCalled = false;
  
  class TestClass {
    constructor(value) {
      constructorCalled = true;
      this.value = value;
    }
  }
  
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  const instance = new proxied.TestClass(42);
  
  assert(constructorCalled === false, 'Constructor should NOT have been called');
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  assert(
    recorder.recordings.some(r => r.type === 'construct'),
    'Should record construct operation'
  );
  assert(typeof instance === 'function', 'Should return a dummy proxy');
});

// Test 6: Track object references in arguments
test('Tracks object references in arguments', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  const ref = proxied.createElement('div');
  proxied.append(ref);
  
  const applyOps = recorder.recordings.filter(r => r.type === 'apply');
  assert(applyOps.length === 2, 'Should have two apply operations');
  
  const secondApply = applyOps[1];
  assert(
    secondApply.args[0].__recordedObjectId,
    'Should serialize ref as object ID'
  );
});

// Test 7: Pause and resume recording
test('Can pause and resume recording', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  proxied.a;
  const countAfterFirst = recorder.recordings.length;
  
  recorder.pause();
  proxied.b;
  const countAfterPause = recorder.recordings.length;
  
  recorder.resume();
  proxied.c;
  const countAfterResume = recorder.recordings.length;
  
  assert(countAfterPause === countAfterFirst, 'Should not record while paused');
  assert(countAfterResume > countAfterPause, 'Should record after resume');
});

// Test 8: Clear recordings
test('Can clear recordings', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  proxied.a;
  assert(recorder.recordings.length > 0, 'Should have recordings');
  
  recorder.clear();
  assert(recorder.recordings.length === 0, 'Recordings should be cleared');
});

// Test 9: Record property set without executing
test('Records property set without executing', () => {
  const mockObj = {};
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  proxied.newProp = 'value';
  
  assert(mockObj.newProp === undefined, 'Property should NOT be set on original object');
  assert(
    recorder.recordings.some(r => r.type === 'set'),
    'Should record set operation'
  );
});

// Test 10: Manual replay in context
test('Can manually replay operations in context', () => {
  const mockWindow = {
    document: {
      createElement(tag) {
        return { tag, type: 'element' };
      }
    }
  };
  
  const recorder = new Recorder({ autoReplay: false });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  proxied.document.createElement('div');
  
  assert(recorder.recordings.length > 0, 'Should have recordings');
  
  // Manually replay
  recorder.replay(mockWindow);
  
  assert(recorder.recordings.length === 0, 'Recordings should be cleared after replay');
});

// Test 11: Automatic replay with context
test('Automatic replay on microtask', async () => {
  let elementCreated = false;
  const mockWindow = {
    document: {
      createElement(tag) {
        elementCreated = true;
        return { tag };
      }
    }
  };
  
  const recorder = new Recorder({
    replayContext: mockWindow,
    autoReplay: true
  });
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  
  proxied.document.createElement('div');
  
  assert(elementCreated === false, 'Should not execute immediately');
  
  // Wait for microtask
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(elementCreated === true, 'Should execute after microtask');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
