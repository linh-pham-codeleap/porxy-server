const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse raw body for all request types
app.use(express.raw({ 
    type: '*/*', 
    limit: '10mb' 
}));

// Main proxy handler
app.use('/request', (req, res, next) => {
    // Skip if this is exactly '/request' without additional path
    if (req.path === '/request') {
        return res.status(400).json({ error: 'Target URL is required. Usage: /request/{full-url-with-protocol}' });
    }
    next();
}, async (req, res) => {
    try {

        // Get the target URL from the path
        const targetPath = req.originalUrl.substring('/request/'.length);
        
        if (!targetPath) {
            return res.status(400).json({ error: 'Target URL is required. Usage: /request/{full-url-with-protocol}' });
        }
        
        // Require full URL with protocol
        if (!targetPath.startsWith('http://') && !targetPath.startsWith('https://')) {
            return res.status(400).json({ error: 'Target URL must include http:// or https:// protocol' });
        }
        
        const targetUrl = targetPath;

        // Prepare headers (exclude problematic ones)
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;
        delete headers['content-length'];

        // Prepare axios config
        const axiosConfig = {
            method: req.method.toLowerCase(),
            url: targetUrl,
            headers: headers,
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: () => true, // Don't throw on any status code
            responseType: 'text' // Get response as text for logging
        };
        
        // Add request body if it exists
        if (req.body && req.body.length > 0) {
            axiosConfig.data = req.body;
        }
        
        // Make the request using axios
        const response = await axios(axiosConfig);
        
        // Log response body
        const responseBody = response.data;

        // Send the response
        return res.status(response.status).send(responseBody);
        
    } catch (error) {
        console.error('Proxy error:', error.message);
        
        if (error.response) {
            // Request was made and server responded with error status
            console.log(`Error Response: ${error.response.status}`);
            console.log('Error Response Headers:', error.response.headers);
            console.log('Error Response Body:', error.response.data);
            
            res.status(error.response.status);
            res.send(error.response.data);
        } else if (error.request) {
            // Request was made but no response received
            console.error('No response received:', error.request);
            res.status(504).json({ error: 'Gateway timeout - no response from target server' });
        } else {
            // Something else happened
            res.status(500).json({ error: `Server error: ${error.message}` });
        }
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'HTTP Request Proxy Server is running',
        nodeVersion: process.version,
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.send(`
        <h1>HTTP Proxy</h1>
        <p>Usage: <code>/request/{full-url}</code></p>
        <p>Example: <code>/request/https://api.example.com/data</code></p>
        <p>Powered by Axios</p>
    `);
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`HTTP Request Proxy Server running on port ${PORT}`);
});

module.exports = app;