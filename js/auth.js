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
 * A wrapper for the native fetch API that automatically adds authorization headers
 * and handles 401 Unauthorized responses by redirecting to the login page.
 *
 * HOW TO USE:
 * Replace your existing `fetch(url, options)` calls with `fetchWithAuth(url, options)`.
 * It works as a drop-in replacement.
 *
 * Example:
 * fetchWithAuth('/api/data')
 * .then(response => response.json())
 * .then(data => console.log(data))
 * .catch(error => console.error('Fetch failed:', error));
 *
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options for the fetch request (optional).
 * @returns {Promise<Response>} - A promise that resolves with the fetch Response.
 */
async function fetchWithAuth(url, options = {}) {
    const authHeaders = getAuthHeaders();

    if (!authHeaders) {
        // If there's no token, we can't make an authenticated request.
        // Redirect to login immediately.
        logout();
        // Return a rejected promise to prevent the calling code from proceeding.
        return Promise.reject(new Error('No authentication token found.'));
    }

    // Merge auth headers with any custom headers from the options object.
    // The spread syntax for options.headers ensures custom headers can override defaults.
    const combinedHeaders = new Headers(authHeaders);
    if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
            combinedHeaders.set(key, value);
        }
    }
    options.headers = combinedHeaders;


    try {
        const response = await fetch(url, options);

        // Check for 401 Unauthorized status
        if (response.status === 401) {
            console.error('Unauthorized (401) response from server. Logging out.');
            logout(); // This will handle the redirect.
            // Throw an error to stop the promise chain in the original calling code.
            throw new Error('Unauthorized: Server responded with 401.');
        }

        return response;
    } catch (error) {
        console.error('Fetch API request failed:', error);
        // Re-throw the error so it can be caught by the caller's .catch() block
        throw error;
    }
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
        : 'index.html';

    window.location.replace(window.location.origin + loginPath);
}
