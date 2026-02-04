(function() {
    // Basic setup...
    if(!window.IGT_PROP_ID) return console.error("IGT Property ID Missing");

    // Load styles and HTML (Same as previous versions but updated logic)
    // ... [Insert previous widget HTML generation here] ...
    // We will replace 'YOUR_LIVE_URL' after step 2 is done
// HARDCODE YOUR NEW RENDER URL HERE
const SERVER_URL = "https://igt-cortex-api.onrender.com"; 

// ... inside the socket load function ...
window.socket = io(SERVER_URL);
        
        // ... UI updates ...
    }
})();
