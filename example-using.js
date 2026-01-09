/**
 * Example demonstrating the correct usage of `using` keyword with the recorder
 * This shows how to use disposable references while keeping the main proxy persistent
 */

import { Recorder, createRecordHandler } from './recorder.js';

console.log('='.repeat(60));
console.log('Using Keyword - Correct Usage Example');
console.log('='.repeat(60));

// Create a recorder
const recorder = new Recorder({ autoReplay: false });

console.log('\n--- Example from user comment ---\n');

// Create a persistent proxy for window (NOT disposable)
const handler = createRecordHandler(recorder);
const proxiedWindow = new Proxy({}, handler);

console.log('1. Created proxiedWindow (persistent, not disposable)');

// Use `using` for temporary variables that should be disposed
// Note: The `using` keyword syntax requires runtime support
if (typeof Symbol.dispose !== 'undefined') {
  console.log('\n2. Creating temporary ref with using keyword simulation:');
  console.log('   using ref = proxiedWindow.document.createElement("div")');
  
  // Simulate what `using` does:
  {
    const ref = proxiedWindow.document.createElement('div');
    
    // Check ref count before using
    const refId = recorder.recordings[recorder.recordings.length - 1].resultId;
    console.log(`   Ref ID: ${refId}`);
    console.log(`   Ref count before disposal: ${recorder.objectRefCounts.get(refId) || 0}`);
    
    // Use the ref
    proxiedWindow.document.body.append(ref);
    
    // When `using` is used, Symbol.dispose is accessed and called automatically
    // Let's simulate that:
    const disposeFunc = ref[Symbol.dispose];
    console.log(`   Symbol.dispose exists: ${typeof disposeFunc === 'function'}`);
    
    // Call dispose (this is what `using` does automatically)
    if (typeof disposeFunc === 'function') {
      disposeFunc.call(ref);
    }
    
    console.log(`   Ref count after disposal: ${recorder.objectRefCounts.get(refId) || 0}`);
  }
  
  console.log('\n3. After block exits, ref is disposed automatically with using keyword');
  console.log('   proxiedWindow remains available for continued use');
  
} else {
  console.log('\n⚠ Symbol.dispose not available in this environment');
}

console.log('\n--- Checking intermediate objects ---\n');

// What about proxiedWindow.document?
console.log('Question: What happens to proxiedWindow.document counter?');
console.log('Answer: Intermediate objects like .document are temporary proxies.');
console.log('        They are NOT automatically disposed because they are not used with `using`.');
console.log('        Only objects explicitly declared with `using` are disposed.');

// Find document's object ID
const documentOps = recorder.recordings.filter(op => op.property === 'document');
if (documentOps.length > 0) {
  const docId = documentOps[0].resultId;
  console.log(`\nDocument object ID: ${docId}`);
  console.log(`Document ref count: ${recorder.objectRefCounts.get(docId) || 0}`);
  console.log('(0 means it was never tracked with using keyword)');
}

console.log('\n--- Summary ---\n');
console.log('✓ proxiedWindow: Persistent proxy, NOT disposable');
console.log('✓ using ref: Temporary variable, automatically disposed when scope exits');
console.log('✓ .document, .body, etc.: Intermediate proxies, NOT automatically disposed');
console.log('✓ Only variables declared with `using` keyword are automatically disposed');

console.log('\n--- Practical Usage ---\n');
console.log('Correct usage:');
console.log('  const proxiedWindow = new Proxy({}, handler);  // persistent');
console.log('  using ref = proxiedWindow.document.createElement("div");  // disposable');
console.log('  proxiedWindow.document.body.append(ref);');
console.log('  // ref is automatically disposed here when scope exits');

console.log('\n' + '='.repeat(60));
console.log('The `using` keyword only affects variables explicitly declared with it.');
console.log('All other proxies remain available and are not automatically disposed.');
console.log('='.repeat(60));
