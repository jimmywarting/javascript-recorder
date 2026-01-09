/**
 * Example demonstrating the exact use case from the problem statement:
 * Recording RTCPeerConnection creation
 */

import { Recorder, createRecordHandler } from './recorder.js';

console.log('='.repeat(60));
console.log('RTCPeerConnection Recording Example');
console.log('='.repeat(60));

// Create a recorder instance
const recorder = new Recorder();

// Create a recording handler
const recordHandler = createRecordHandler(recorder);

// Wrap globalThis to record all operations
// This is the exact pattern from the problem statement
globalThis.globalThis = new Proxy(globalThis, recordHandler);

console.log('\n✓ globalThis wrapped with recording proxy');

// Simulate the RTCPeerConnection scenario
// Note: RTCPeerConnection might not be available in Node.js
// This example simulates the pattern

// Create a mock RTCPeerConnection for demonstration
class RTCPeerConnection {
  constructor(config) {
    this.config = config;
    console.log('RTCPeerConnection created with config:', config);
  }

  createOffer() {
    console.log('createOffer called');
    return Promise.resolve({ type: 'offer', sdp: 'mock_sdp' });
  }

  setLocalDescription(desc) {
    console.log('setLocalDescription called with:', desc);
    return Promise.resolve();
  }
}

// Add it to a container to demonstrate recording
const webrtcContainer = { RTCPeerConnection };
const proxiedWebRTC = new Proxy(webrtcContainer, recordHandler);

console.log('\n--- Recording operations ---\n');

// This is the pattern from the problem statement
const peer = new proxiedWebRTC.RTCPeerConnection({});

console.log('\n--- Recorded Operations ---\n');

// Show what was recorded
const recordings = recorder.getRecordings();
console.log(`Total operations recorded: ${recordings.length}\n`);

recordings.forEach((op, index) => {
  console.log(`Operation ${index + 1}:`);
  console.log(`  Type: ${op.type}`);
  if (op.property) console.log(`  Property: ${op.property}`);
  if (op.args) console.log(`  Args:`, op.args);
  if (op.constructorName) console.log(`  Constructor: ${op.constructorName}`);
  console.log();
});

console.log('='.repeat(60));
console.log('Recording complete!');
console.log('='.repeat(60));

console.log('\nYou can now replay these operations in another context.');
console.log('All JavaScript operations are captured and can be replayed.');
