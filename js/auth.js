// js/auth.js

/**
 * Retrieves the authentication token and prepares the headers for API requests.
 * @returns {Headers | null} - A Headers object with the Authorization token, or null if no token is found.
 */
function getAuthHeaders() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        console.log("Auth token not found in sessionStorage.");
        return null;
    }
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', `Bearer ${token}`);
    return headers;
}

/**
 * Checks if a user is authenticated by simply checking for the token's existence.
 * If no token is found, it redirects the user to the login page.
 */
function checkAuth() {
    // Safety check to ensure the configuration file is loaded first.
    if (typeof AppConfig === 'undefined') {
        console.error('CRITICAL: AppConfig is not defined. Make sure config.js is loaded before auth.js in your HTML file.');
        return;
    }
    
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        console.log('No auth token found. Redirecting to login page.');
        // Use replace to prevent the back button from working after logout.
        if (!window.location.pathname.endsWith(AppConfig.links.login)) {
            logout(); // Call logout to ensure session is fully cleared before redirect
        }
    } else {
        console.log("Authentication check passed (token found).");
    }
}

/**
 * Logs the user out by removing the token and redirecting to the login page.
 */
function logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userRole');
    console.log('User logged out. Redirecting to login page.');
    
    // Construct a more reliable path to the login page.
    const loginPath = (typeof AppConfig !== 'undefined') 
        ? `/${AppConfig.links.login}`.replace(/([^:]\/)\/+/g, "$1") // Ensure single slash from root
        : '/public/login.html';
        
    window.location.replace(window.location.origin + loginPath);
}
