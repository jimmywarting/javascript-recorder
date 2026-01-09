/**
 * Example demonstrating non-executing recording with automatic replay
 * This shows how operations are recorded but NOT executed during recording,
 * only during replay.
 */

import { Recorder, createRecordHandler } from './recorder.js';

console.log('='.repeat(60));
console.log('Non-Executing Recording Example');
console.log('='.repeat(60));

// Mock objects to simulate the recording environment
const mockWindow = {
  document: {
    createElement(tagName) {
      console.log(`[REAL] createElement called with: ${tagName}`);
      return { tagName, children: [] };
    },
    body: {
      append(element) {
        console.log(`[REAL] body.append called with:`, element);
      }
    }
  },
  frames: [null, null, { contentWindow: { alert(msg) { console.log(`[REAL] alert: ${msg}`); } } }],
  alert(msg) {
    console.log(`[REAL] window.alert: ${msg}`);
  }
};

console.log('\n--- Phase 1: Recording (NO execution) ---\n');

// Create recorder with automatic replay to mockWindow
const recorder = new Recorder({
  replayContext: mockWindow,
  autoReplay: true
});

const recordHandler = createRecordHandler(recorder);
const proxiedWindow = new Proxy({}, recordHandler);

console.log('1. Accessing proxiedWindow.document.createElement("div")');
console.log('   (This should NOT actually create an element)');
const ref = proxiedWindow.document.createElement('div');

console.log('\n2. Calling proxiedWindow.document.body.append(ref)');
console.log('   (This should NOT actually append anything)');
proxiedWindow.document.body.append(ref);

console.log('\n3. Accessing proxiedWindow.frames[2].contentWindow.alert("hello world")');
console.log('   (This should NOT show any alert)');
proxiedWindow.frames[2].contentWindow.alert('hello world');

console.log('\n--- Recorded Operations ---\n');
console.log(`Total operations recorded: ${recorder.getRecordings().length}`);
recorder.getRecordings().forEach((op, i) => {
  console.log(`${i + 1}. ${op.type} - ${op.property || op.constructorName || 'function'}`, 
    op.args ? `args: ${JSON.stringify(op.args)}` : '');
});

console.log('\n--- Phase 2: Automatic Replay (will execute on next microtask) ---\n');
console.log('Waiting for microtask to execute automatic replay...\n');

// The replay will happen automatically on the next microtask
// Let's wait a bit to see it
await new Promise(resolve => setTimeout(resolve, 10));

console.log('\n' + '='.repeat(60));
console.log('Notice: Operations were recorded but NOT executed during recording.');
console.log('They were automatically replayed in the real context.');
console.log('='.repeat(60));
