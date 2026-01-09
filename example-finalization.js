/**
 * Example demonstrating FinalizationRegistry for automatic cleanup
 * Shows what happens when users don't manually dispose of objects
 */

import { Recorder, createRecordHandler } from './recorder.js';

console.log('='.repeat(60));
console.log('FinalizationRegistry - Automatic Cleanup Example');
console.log('='.repeat(60));

// Check if FinalizationRegistry is available
if (typeof FinalizationRegistry === 'undefined') {
  console.log('✗ FinalizationRegistry not available in this environment');
  process.exit(0);
}

console.log('✓ FinalizationRegistry is available\n');

// Create a recorder with finalization enabled
const recorder = new Recorder({ 
  autoReplay: false,
  useFinalization: true 
});

console.log('--- Scenario 1: Manual Disposal with `using` keyword ---\n');

{
  const handler = createRecordHandler(recorder);
  const proxiedWindow = new Proxy({}, handler);
  
  console.log('1. Creating ref with using (manual disposal)');
  const ref = proxiedWindow.document.createElement('div');
  const refId = recorder.recordings[recorder.recordings.length - 1].resultId;
  console.log(`   Ref ID: ${refId}`);
  console.log(`   Ref count: ${recorder.objectRefCounts.get(refId)}`);
  
  // Manually dispose
  if (typeof ref[Symbol.dispose] === 'function') {
    ref[Symbol.dispose]();
    console.log('2. Manually disposed via Symbol.dispose');
    console.log(`   Ref count after disposal: ${recorder.objectRefCounts.get(refId) || 0}`);
  }
}

console.log('\n--- Scenario 2: No Manual Disposal (relies on finalization) ---\n');

function createTemporaryObjects() {
  const handler = createRecordHandler(recorder);
  const proxiedWindow = new Proxy({}, handler);
  
  console.log('1. Creating objects without manual disposal');
  const div1 = proxiedWindow.document.createElement('div');
  const div2 = proxiedWindow.document.createElement('span');
  const div3 = proxiedWindow.document.createElement('p');
  
  // Get the last created object ID
  const lastOp = recorder.recordings[recorder.recordings.length - 1];
  const lastId = lastOp.resultId;
  
  console.log(`   Created 3 elements, last ID: ${lastId}`);
  console.log(`   Ref count for ${lastId}: ${recorder.objectRefCounts.get(lastId)}`);
  console.log('2. Exiting function without disposing...');
  
  // Objects go out of scope here, but not immediately garbage collected
  return lastId;
}

const lastId = createTemporaryObjects();

console.log('3. Objects are now out of scope');
console.log(`   Current ref count for ${lastId}: ${recorder.objectRefCounts.get(lastId)}`);
console.log('   Note: Objects not yet garbage collected');

console.log('\n--- Triggering Garbage Collection ---\n');

console.log('Attempting to trigger GC...');
console.log('Note: GC is non-deterministic and finalizers may not run immediately');

// Try to trigger garbage collection (this is a hint, not guaranteed)
if (global.gc) {
  console.log('Running global.gc()...');
  global.gc();
  
  // Wait a bit for finalization to potentially occur
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`Ref count after GC attempt: ${recorder.objectRefCounts.get(lastId) || 0}`);
  console.log('(If 0, finalization occurred; if >0, GC hasn\'t run yet)');
} else {
  console.log('⚠ global.gc() not available');
  console.log('  Run with: node --expose-gc example-finalization.js');
  console.log('  Without gc(), finalizers will run eventually but timing is unpredictable');
}

console.log('\n--- Summary ---\n');

console.log('✓ Symbol.dispose: Immediate, deterministic cleanup (when used with `using`)');
console.log('✓ FinalizationRegistry: Automatic, non-deterministic cleanup (fallback)');
console.log('✓ Best practice: Use `using` keyword for explicit disposal when possible');
console.log('✓ Finalization provides safety net if user forgets to dispose');

console.log('\n--- Reference Count Summary ---\n');
console.log('Total objects tracked:', recorder.objectRefCounts.size);
console.log('Reference counts:');
for (const [objId, count] of recorder.objectRefCounts.entries()) {
  console.log(`  ${objId}: ${count}`);
}

console.log('\n' + '='.repeat(60));
console.log('Finalization Registry provides automatic cleanup as a fallback');
console.log('but manual disposal with `using` keyword is more predictable.');
console.log('='.repeat(60));
