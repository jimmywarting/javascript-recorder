/**
 * Tests for MessagePort and Symbol.dispose features
 */

import { Recorder, createRecordHandler, RecordedObjectHandle, createRecordedObject } from './recorder.js';

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

console.log('Running MessagePort and Symbol.dispose Tests\n');

// Test 1: MessagePort creation
test('Recorder can be created with MessagePort', () => {
  const messageChannel = new MessageChannel();
  const recorder = new Recorder({ port: messageChannel.port1 });
  
  assert(recorder.port !== null, 'Port should be set');
  assert(recorder.objectRefCounts instanceof Map, 'Should have ref counts map');
  assert(recorder.objectRegistry instanceof Map, 'Should have object registry');
  
  messageChannel.port1.close();
  messageChannel.port2.close();
});

// Test 2: MessagePort communication
test('Operations are sent through MessagePort', async () => {
  const messageChannel = new MessageChannel();
  let messageReceived = false;
  
  messageChannel.port2.onmessage = (event) => {
    messageReceived = true;
    assert(event.data.type === 'replay', 'Message should be replay type');
    assert(Array.isArray(event.data.operations), 'Should contain operations array');
  };
  messageChannel.port2.start();
  
  const recorder = new Recorder({
    port: messageChannel.port1,
    autoReplay: true
  });
  
  const handler = createRecordHandler(recorder);
  const proxied = new Proxy({}, handler);
  proxied.test;
  
  // Wait for message to be sent
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(messageReceived, 'Message should have been received');
  
  messageChannel.port1.close();
  messageChannel.port2.close();
});

// Test 3: Cross-context replay
test('Operations replay in target context via MessagePort', async () => {
  const messageChannel = new MessageChannel();
  let functionCalled = false;
  
  const mockContext = {
    testFunction() {
      functionCalled = true;
    }
  };
  
  // Recording side
  const recordingRecorder = new Recorder({
    port: messageChannel.port1,
    autoReplay: true
  });
  
  // Replay side
  const replayRecorder = new Recorder({
    port: messageChannel.port2,
    replayContext: mockContext,
    autoReplay: true
  });
  
  // Record operation
  const handler = createRecordHandler(recordingRecorder);
  const proxied = new Proxy({}, handler);
  proxied.testFunction();
  
  // Wait for message to be sent and replayed
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(functionCalled, 'Function should have been called in target context');
  
  messageChannel.port1.close();
  messageChannel.port2.close();
});

// Test 4: Reference counting
test('Reference counting increments and decrements', () => {
  const recorder = new Recorder({ autoReplay: false });
  
  recorder.incrementRefCount('obj_1');
  assert(recorder.objectRefCounts.get('obj_1') === 1, 'Ref count should be 1');
  
  recorder.incrementRefCount('obj_1');
  assert(recorder.objectRefCounts.get('obj_1') === 2, 'Ref count should be 2');
  
  recorder.decrementRefCount('obj_1');
  assert(recorder.objectRefCounts.get('obj_1') === 1, 'Ref count should be 1');
  
  recorder.decrementRefCount('obj_1');
  assert(!recorder.objectRefCounts.has('obj_1'), 'Object should be cleaned up');
});

// Test 5: Symbol.dispose on Recorder
test('Recorder supports Symbol.dispose', () => {
  const recorder = new Recorder({ autoReplay: false });
  
  recorder.incrementRefCount('obj_1');
  recorder.record({ type: 'test' });
  
  assert(recorder.objectRefCounts.size > 0, 'Should have ref counts');
  
  recorder[Symbol.dispose]();
  
  assert(recorder.objectRefCounts.size === 0, 'Ref counts should be cleared');
  assert(recorder.objectRegistry.size === 0, 'Registry should be cleared');
  assert(recorder.port === null, 'Port should be null');
});

// Test 6: RecordedObjectHandle creation
test('RecordedObjectHandle can be created', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handle = createRecordedObject(recorder);
  
  assert(handle instanceof RecordedObjectHandle, 'Should be RecordedObjectHandle instance');
  assert(handle.proxy !== undefined, 'Should have proxy');
  assert(handle.objectId === 'globalThis', 'Should have object ID');
  assert(handle.recorder === recorder, 'Should reference recorder');
  
  // Clean up
  handle[Symbol.dispose]();
});

// Test 7: RecordedObjectHandle increments ref count
test('RecordedObjectHandle increments ref count on creation', () => {
  const recorder = new Recorder({ autoReplay: false });
  
  const initialCount = recorder.objectRefCounts.get('globalThis') || 0;
  const handle = createRecordedObject(recorder);
  
  assert(
    recorder.objectRefCounts.get('globalThis') === initialCount + 1,
    'Ref count should be incremented'
  );
  
  // Clean up
  handle[Symbol.dispose]();
});

// Test 8: RecordedObjectHandle decrements ref count on dispose
test('RecordedObjectHandle decrements ref count on dispose', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handle = createRecordedObject(recorder);
  
  const countBeforeDispose = recorder.objectRefCounts.get('globalThis');
  handle[Symbol.dispose]();
  
  const countAfterDispose = recorder.objectRefCounts.get('globalThis') || 0;
  assert(
    countAfterDispose === countBeforeDispose - 1,
    'Ref count should be decremented'
  );
});

// Test 9: RecordedObjectHandle.value returns proxy
test('RecordedObjectHandle.value returns the proxy', () => {
  const recorder = new Recorder({ autoReplay: false });
  const handle = createRecordedObject(recorder);
  
  const proxy = handle.value;
  assert(proxy !== undefined, 'Value should not be undefined');
  
  // Should be able to use it
  proxy.test;
  assert(recorder.recordings.length > 0, 'Should have recorded operations');
  
  // Clean up
  handle[Symbol.dispose]();
});

// Test 10: Ref count messages through MessagePort
test('Reference count updates are sent through MessagePort', async () => {
  const messageChannel = new MessageChannel();
  let refCountMessageReceived = false;
  
  messageChannel.port2.onmessage = (event) => {
    if (event.data.type === 'refCount') {
      refCountMessageReceived = true;
      assert(event.data.objectId === 'test_obj', 'Should have object ID');
      assert(event.data.delta === 1, 'Should have delta');
    }
  };
  messageChannel.port2.start();
  
  const recorder = new Recorder({ port: messageChannel.port1 });
  recorder.incrementRefCount('test_obj');
  
  // Wait for message
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(refCountMessageReceived, 'Ref count message should be received');
  
  messageChannel.port1.close();
  messageChannel.port2.close();
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
