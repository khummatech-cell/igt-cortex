(function() {
    // Basic setup...
    if(!window.IGT_PROP_ID) return console.error("IGT Property ID Missing");

    // Load styles and HTML (Same as previous versions but updated logic)
    // ... [Insert previous widget HTML generation here] ...
    // We will replace 'YOUR_LIVE_URL' after step 2 is done
const API_URL = window.IGT_API_URL || "http://localhost:3000";

    // Key Change:
    window.startIGTChat = function() {
        const name = document.getElementById('igt-name').value;
        const email = document.getElementById('igt-email').value;
        
        // Connect with Property ID
        window.socket.emit('visitor_join', { 
            name, email, 
            propertyID: window.IGT_PROP_ID 
        });
        
        // ... UI updates ...
    }
})();