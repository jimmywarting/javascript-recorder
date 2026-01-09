/**
 * Test for Nested Proxy Operations in Callbacks
 * Validates that proxy operations inside callbacks are properly replayed
 */

import { Recorder, createRecordHandler } from './recorder.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
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

console.log('Testing Nested Proxy Operations in Callbacks\n');

// Run all tests sequentially
(async () => {

// Test 1: Basic nested proxy operation in callback
await test('Nested proxy set operation in callback is replayed', async () => {
  const messageChannel = new MessageChannel();
  
  // Recording side
  const recordingRecorder = new Recorder({
    port: messageChannel.port1,
    autoReplay: true
  });
  
  const handler = createRecordHandler(recordingRecorder);
  const proxied = new Proxy({}, handler);
  
  const obj = proxied.someProperty;
  obj.value = 'initial';
  
  obj.onclick = function() {
    obj.value = 'updated';
  };
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Replay side
  const mockContext = { value: 'initial' };
  const replayRecorder = new Recorder({
    port: messageChannel.port2,
    replayContext: mockContext,
    autoReplay: true
  });
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Trigger the callback
  mockContext.onclick();
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  assert(mockContext.value === 'updated', 'Value should be updated after nested operation');
  
  messageChannel.port1.close();
  messageChannel.port2.close();
});

// Test 2: Button click example (from issue)
await test('Button text updates correctly in callback', async () => {
  const messageChannel = new MessageChannel();
  
  const mockWindow = {
    document: {
      createElement() {
        return {
          innerText: '',
          onclick: null,
          click() {
            if (this.onclick) this.onclick({});
          }
        };
      },
      body: {
        appendChild(element) {
          this._element = element;
        }
      }
    }
  };
  
  const mainRecorder = new Recorder({
    port: messageChannel.port2,
    replayContext: mockWindow,
    autoReplay: true
  });
  
  const workerRecorder = new Recorder({
    port: messageChannel.port1,
    autoReplay: true
  });
  
  const handler = createRecordHandler(workerRecorder);
  const proxiedWindow = new Proxy({}, handler);
  
  let clickCount = 0;
  const button = proxiedWindow.document.createElement('button');
  button.innerText = 'Click me: 0';
  
  button.onclick = function() {
    clickCount++;
    button.innerText = `Click me: ${clickCount}`;
  };
  
  proxiedWindow.document.body.appendChild(button);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const buttonElement = mockWindow.document.body._element;
  assert(buttonElement.innerText === 'Click me: 0', 'Initial text should be set');
  
  buttonElement.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert(buttonElement.innerText === 'Click me: 1', 'Text should update after first click');
  
  buttonElement.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert(buttonElement.innerText === 'Click me: 2', 'Text should update after second click');
  
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

})(); // End of async wrapper
