/**
 * Web Worker for testing JavaScript Recorder
 * This worker receives a MessagePort and uses it to send recorded operations
 * back to the main thread for replay.
 */

// Import the recorder module
import { Recorder, createRecordHandler } from './recorder.js';

console.log('[WORKER] Worker started');

self.onmessage = function(event) {
    console.log('[WORKER] Received message:', event.data);
    
    if (event.data.type === 'start' && event.data.port) {
        const port = event.data.port;
        
        console.log('[WORKER] Setting up recorder with port');
        
        // Create recorder that sends operations through the port
        const recorder = new Recorder({
            port: port,
            autoReplay: true
        });
        
        // Create proxy handler
        const handler = createRecordHandler(recorder);
        const proxiedWindow = new Proxy({}, handler);
        
        console.log('[WORKER] Recording operations...');
        
        // Record some operations
        // Note: These won't execute in the worker, they'll be recorded and sent to main thread
        const div = proxiedWindow.document.createElement('div');
        div.className = 'created-element';
        div.style.background = '#FFF3E0';
        div.style.border = '2px solid #FF9800';
        
        const heading = proxiedWindow.document.createElement('h3');
        heading.textContent = 'Created in Real Web Worker!';
        heading.style.color = '#E65100';
        div.appendChild(heading);
        
        const paragraph = proxiedWindow.document.createElement('p');
        paragraph.textContent = 'This element was recorded in a Web Worker and replayed on the main thread using MessagePort.';
        div.appendChild(paragraph);
        
        proxiedWindow.target.appendChild(div);
        
        console.log('[WORKER] Operations recorded and sent');
        
        // Notify main thread
        self.postMessage({ type: 'done', operationsCount: recorder.recordings.length });
    }
};

self.postMessage({ type: 'ready' });
