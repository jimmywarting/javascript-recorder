/**
 * Example demonstrating MessagePort-based cross-context recording
 * This simulates the worker-to-main-thread communication pattern
 */

import { Recorder, createRecordHandler } from './recorder.js';

console.log('='.repeat(60));
console.log('MessagePort Cross-Context Recording Example');
console.log('='.repeat(60));

// Create a MessageChannel to simulate cross-context communication
const messageChannel = new MessageChannel();
const port1 = messageChannel.port1; // Recording side (e.g., worker)
const port2 = messageChannel.port2; // Replay side (e.g., main thread)

// Mock the window object for the main thread
const mockWindow = {
  document: {
    createElement(tagName) {
      console.log(`[MAIN THREAD] createElement called: ${tagName}`);
      return { tagName, children: [], textContent: '' };
    },
    body: {
      append(element) {
        console.log(`[MAIN THREAD] body.append called with:`, element);
      }
    }
  },
  alert(msg) {
    console.log(`[MAIN THREAD] alert: ${msg}`);
  }
};

console.log('\n--- Setting up recording and replay contexts ---\n');

// Set up the recording side (simulating a worker)
console.log('1. Creating recorder on "worker" side with port1');
const recordingRecorder = new Recorder({
  port: port1,
  autoReplay: true // Operations will be sent through the port
});

// Set up the replay side (simulating main thread)
console.log('2. Creating recorder on "main thread" side with port2');
const replayRecorder = new Recorder({
  port: port2,
  replayContext: mockWindow,
  autoReplay: true // Operations received will be replayed automatically
});

console.log('\n--- Recording operations on "worker" side ---\n');

// Create a proxy on the "worker" side
const handler = createRecordHandler(recordingRecorder);
const proxiedWindow = new Proxy({}, handler);

console.log('3. Calling proxiedWindow.document.createElement("div")');
console.log('   (This should NOT execute on worker side)');
const ref = proxiedWindow.document.createElement('div');

console.log('\n4. Calling proxiedWindow.document.body.append(ref)');
console.log('   (This should NOT execute on worker side)');
proxiedWindow.document.body.append(ref);

console.log('\n5. Calling proxiedWindow.alert("Hello from worker!")');
console.log('   (This should NOT execute on worker side)');
proxiedWindow.alert('Hello from worker!');

console.log('\n--- Waiting for operations to be sent and replayed ---\n');

// Wait for microtask to send operations and for them to be received
// Using setTimeout to ensure messages are fully processed
await new Promise(resolve => setTimeout(resolve, 10));

console.log('\n' + '='.repeat(60));
console.log('Result: Operations were recorded on worker side,');
console.log('sent through MessagePort, and replayed on main thread!');
console.log('='.repeat(60));

// Clean up
port1.close();
port2.close();
