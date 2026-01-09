/**
 * Example demonstrating bidirectional function callbacks
 * This simulates a worker thread recording DOM operations with event handlers
 * that execute back in the worker context when triggered
 */

import { Recorder, createRecordHandler } from './recorder.js';

console.log('='.repeat(70));
console.log('Bidirectional Function Callbacks Example');
console.log('Worker → Main Thread Recording with Callback Execution');
console.log('='.repeat(70));

// Create a MessageChannel to simulate cross-context communication
const messageChannel = new MessageChannel();
const workerPort = messageChannel.port1; // "Worker" side
const mainPort = messageChannel.port2;   // "Main thread" side

// ==================================================================
// MAIN THREAD SIDE - Setup
// ==================================================================

console.log('\n--- Setting up Main Thread context ---\n');

// Mock DOM environment on main thread
const mockWindow = {
  document: {
    createElement(tagName) {
      console.log(`[MAIN] createElement('${tagName}')`);
      return {
        tagName,
        innerText: '',
        onclick: null,
        setAttribute(name, value) {
          console.log(`[MAIN] element.setAttribute('${name}', '${value}')`);
          this[name] = value;
        },
        click() {
          console.log(`[MAIN] element.click() - triggering onclick handler`);
          if (this.onclick) {
            // Create a simple event object
            const event = {
              type: 'click',
              target: this,
              currentTarget: this
            };
            this.onclick(event);
          }
        }
      };
    },
    body: {
      appendChild(element) {
        console.log(`[MAIN] body.appendChild(<${element.tagName}>)`);
        this._element = element;
      }
    }
  }
};

// Create recorder on main thread side to receive and replay operations
const mainRecorder = new Recorder({
  port: mainPort,
  replayContext: mockWindow,
  autoReplay: true,
  onerror: (error) => {
    console.error('[MAIN] Error during replay:', error);
  }
});

console.log('✓ Main thread recorder configured');

// ==================================================================
// WORKER THREAD SIDE - Recording with Event Handler
// ==================================================================

console.log('\n--- Setting up Worker context ---\n');

// Create recorder on worker side to record and send operations
const workerRecorder = new Recorder({
  port: workerPort,
  autoReplay: true,
  onerror: (error) => {
    console.error('[WORKER] Error:', error);
  }
});

console.log('✓ Worker recorder configured');

// Create proxy for window object
const handler = createRecordHandler(workerRecorder);
const proxiedWindow = new Proxy({}, handler);

console.log('\n--- Recording operations on Worker side ---\n');

// Worker-local state
let clickCount = 0;

// Create button element (doesn't actually execute, just records)
console.log('[WORKER] Creating button element...');
const button = proxiedWindow.document.createElement('button');

// Set initial text
console.log('[WORKER] Setting button text...');
button.innerText = 'Click me: 0';

// Set button id
console.log('[WORKER] Setting button id...');
button.setAttribute('id', 'click-button');

// Assign event handler - THIS IS THE KEY FEATURE!
// This function will execute in the worker context when the button is clicked
// on the main thread
console.log('[WORKER] Assigning click handler...');
button.onclick = function clickHandler(event) {
  console.log('[WORKER] 🎉 Click handler executed in WORKER context!');
  
  // Note: Event objects are not serializable, so we receive a placeholder
  console.log(`[WORKER]   Event received:`, event);
  
  // Access worker-local state
  clickCount++;
  console.log(`[WORKER]   Click count: ${clickCount}`);
  
  // Update button text via proxy (will be replayed on main thread)
  // Note: We use the button reference from worker scope, not event.target
  button.innerText = `Click me: ${clickCount}`;
  console.log(`[WORKER]   Updated button text to: "Click me: ${clickCount}"`);
};

// Append to body
console.log('[WORKER] Appending button to body...');
proxiedWindow.document.body.appendChild(button);

console.log('\n[WORKER] ✓ All operations recorded and sent\n');

// ==================================================================
// SIMULATION - Wait for operations to be transferred and replayed
// ==================================================================

console.log('--- Waiting for operations to be transferred and replayed ---\n');

await new Promise(resolve => setTimeout(resolve, 100));

console.log('✓ Operations transferred and replayed on main thread\n');

// ==================================================================
// MAIN THREAD - Trigger the event
// ==================================================================

console.log('--- Simulating user interaction on Main Thread ---\n');

// Get the button element that was created
const buttonElement = mockWindow.document.body._element;

console.log('[MAIN] User clicks the button...\n');
buttonElement.click();

// Wait for callback to execute
await new Promise(resolve => setTimeout(resolve, 100));

console.log('\n[MAIN] Button text is now:', buttonElement.innerText);

// Click again
console.log('\n[MAIN] User clicks the button again...\n');
buttonElement.click();

await new Promise(resolve => setTimeout(resolve, 100));

console.log('\n[MAIN] Button text is now:', buttonElement.innerText);

// Click one more time
console.log('\n[MAIN] User clicks the button one more time...\n');
buttonElement.click();

await new Promise(resolve => setTimeout(resolve, 100));

console.log('\n[MAIN] Final button text:', buttonElement.innerText);
console.log('[MAIN] Note: Button text not updated because proxy operations inside');
console.log('[MAIN]       callbacks need additional work (see limitations below)');

// ==================================================================
// SUMMARY
// ==================================================================

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log('✓ Worker recorded DOM operations without executing them');
console.log('✓ Operations were sent to main thread via MessageChannel');
console.log('✓ Main thread replayed operations in real DOM context');
console.log('✓ Event handler was set up with bidirectional MessageChannel');
console.log('✓ When button was clicked on main thread:');
console.log('  - Click event triggered the handler');
console.log('  - Handler executed in WORKER context (accessing worker state)');
console.log(`  - Click counter incremented correctly: ${clickCount} clicks`);
console.log('');
console.log('CURRENT LIMITATIONS:');
console.log('  - Event objects cannot be fully serialized (placeholder sent)');
console.log('  - Proxy operations inside callbacks need additional implementation');
console.log('  - This is an MVP demonstrating the core bidirectional mechanism');
console.log('='.repeat(70));

// Clean up
workerPort.close();
mainPort.close();
