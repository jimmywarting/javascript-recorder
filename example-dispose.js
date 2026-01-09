/**
 * Example demonstrating Symbol.dispose support with the `using` keyword
 * Note: The `using` keyword is a Stage 3 proposal and may not be available in all environments
 */

import { Recorder, createRecordedObject } from './recorder.js';

console.log('='.repeat(60));
console.log('Symbol.dispose Support Example');
console.log('='.repeat(60));

// Create a recorder
const recorder = new Recorder({ autoReplay: false });

console.log('\n--- Using the "using" keyword (if supported) ---\n');

// Check if Symbol.dispose is available
if (typeof Symbol.dispose !== 'undefined') {
  console.log('✓ Symbol.dispose is available');
  
  // Example with automatic cleanup using the `using` keyword
  try {
    // Note: The `using` keyword syntax may not be supported yet
    // This is the intended usage when it becomes available:
    // using recordedObj = createRecordedObject(recorder);
    
    // For now, we demonstrate manual usage:
    const handle = createRecordedObject(recorder);
    const recordedObj = handle.value;
    
    console.log('\n1. Created recorded object handle');
    console.log('   Ref count for "globalThis":', recorder.objectRefCounts.get('globalThis') || 0);
    
    // Use the recorded object
    recordedObj.someProperty.someMethod();
    
    console.log('\n2. Used recorded object');
    console.log('   Operations recorded:', recorder.getRecordings().length);
    
    // Manually dispose (simulating what `using` would do automatically)
    handle[Symbol.dispose]();
    
    console.log('\n3. Disposed of handle (ref count decremented)');
    console.log('   Ref count for "globalThis":', recorder.objectRefCounts.get('globalThis') || 0);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
} else {
  console.log('⚠ Symbol.dispose is not available in this environment');
  console.log('  This feature requires a runtime that supports the Explicit Resource Management proposal');
}

console.log('\n--- Manual reference counting ---\n');

// Demonstrate manual reference counting
console.log('1. Incrementing ref count for object "obj_1"');
recorder.incrementRefCount('obj_1');
console.log('   Ref count:', recorder.objectRefCounts.get('obj_1'));

console.log('\n2. Incrementing ref count again');
recorder.incrementRefCount('obj_1');
console.log('   Ref count:', recorder.objectRefCounts.get('obj_1'));

console.log('\n3. Decrementing ref count');
recorder.decrementRefCount('obj_1');
console.log('   Ref count:', recorder.objectRefCounts.get('obj_1'));

console.log('\n4. Decrementing ref count to zero');
recorder.decrementRefCount('obj_1');
console.log('   Ref count (should be cleaned up):', recorder.objectRefCounts.get('obj_1') || 'undefined');

console.log('\n--- Using Symbol.dispose on Recorder ---\n');

// Create a recorder to dispose
{
  const disposableRecorder = new Recorder({ autoReplay: false });
  disposableRecorder.record({ type: 'test' });
  
  console.log('1. Created recorder with recordings:', disposableRecorder.recordings.length);
  
  // Dispose of the recorder
  disposableRecorder[Symbol.dispose]();
  
  console.log('2. Disposed of recorder');
  console.log('   Ref counts cleared:', disposableRecorder.objectRefCounts.size === 0);
  console.log('   Registry cleared:', disposableRecorder.objectRegistry.size === 0);
}

console.log('\n' + '='.repeat(60));
console.log('Reference counting helps manage object lifetime across contexts');
console.log('Symbol.dispose enables automatic cleanup with the `using` keyword');
console.log('='.repeat(60));
