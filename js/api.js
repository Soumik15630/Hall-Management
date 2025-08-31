// js/api.js
// This file centralizes all API communication for the application.
// It includes an in-memory cache, granular cache invalidation, and retry logic
// to improve performance, data consistency, and network resilience.

window.ApiService = (function() {

    // In-memory cache to store responses from GET requests.
    const cache = new Map();

    // Defines which cache keys should be cleared when a write operation occurs on a given endpoint prefix.
    const cacheInvalidationMap = {
        'api/hall/': ['api/hall/all-hall'],
        'api/employee/': ['api/employee/all-employees'],
        'api/booking/': [
            'api/booking/my-requests',
            'api/booking/approvals?filter=internal',
            'api/booking/approvals?filter=forward'
            // Note: Specific hall booking caches are handled separately.
        ]
    };

    /**
     * Intelligently clears relevant parts of the cache after a data modification.
     * @param {string} modifiedEndpoint - The endpoint that was written to (e.g., PUT 'api/hall/123').
     */
    function invalidateCache(modifiedEndpoint) {
        console.log(`ApiService Cache: Invalidating cache due to modification on: ${modifiedEndpoint}`);
        let invalidated = false;

        // Invalidate list-based caches (e.g., 'api/hall/all-hall')
        for (const prefix in cacheInvalidationMap) {
            if (modifiedEndpoint.startsWith(prefix)) {
                cacheInvalidationMap[prefix].forEach(keyToClear => {
                    if (cache.has(keyToClear)) {
                        cache.delete(keyToClear);
                        console.log(`ApiService Cache: Cleared '${keyToClear}'`);
                        invalidated = true;
                    }
                });
            }
        }

        // Special handling for bookings: also clear individual hall availability caches
        if (modifiedEndpoint.startsWith('api/booking/')) {
            for (const key of cache.keys()) {
                if (key.startsWith('api/booking/hall/')) {
                    cache.delete(key);
                    console.log(`ApiService Cache: Cleared specific hall booking cache '${key}'`);
                    invalidated = true;
                }
            }
        }

        // As a fallback, if no specific rule was found, clear the entire cache to ensure data consistency.
        if (!invalidated) {
            console.warn("ApiService Cache: No specific invalidation rule found. Clearing entire cache as a fallback.");
            cache.clear();
        }
    }


    /**
     * Master fetch function with authentication, caching, retry logic, and 401 error handling.
     * @param {string} endpoint - The specific API endpoint.
     * @param {object} options - Standard fetch options.
     * @returns {Promise<any>} - The parsed JSON response from the API.
     */
    async function fetchWithAuth(endpoint, options = {}) {
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const isReadOperation = !options.method || options.method.toUpperCase() === 'GET';

        if (isReadOperation && cache.has(endpoint)) {
            console.log(`ApiService Cache: Returning cached response for: ${endpoint}`);
            return Promise.resolve(JSON.parse(JSON.stringify(cache.get(endpoint))));
        }

        const authHeaders = getAuthHeaders();
        if (!authHeaders) {
            logout();
            return Promise.reject(new Error("User not authenticated."));
        }

        options.headers = new Headers(authHeaders);
        if (options.body && !options.headers.has('Content-Type')) {
            options.headers.set('Content-Type', 'application/json');
        }

        // Retry logic: Attempt the fetch call up to 3 times with exponential backoff.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(fullUrl, options);

                // For server errors (5xx), we throw to trigger a retry.
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status}`);
                }

                if (response.status === 401) {
                    console.error("Unauthorized (401) detected by ApiService. Logging out.");
                    logout();
                    throw new Error('Unauthorized'); // Do not retry on auth failure
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`API Error Response on ${endpoint}:`, errorText);
                    // Do not retry on client errors (4xx), throw immediately.
                    throw new Error(`API Error: ${response.status} - ${errorText}`);
                }

                // If the request was successful, handle cache and response.
                if (!isReadOperation) {
                    invalidateCache(endpoint);
                }
                if (response.status === 204) {
                    return null;
                }
                const result = await response.json();
                const dataToReturn = result.data || result;
                if (isReadOperation) {
                    console.log(`ApiService Cache: Caching response for: ${endpoint}`);
                    cache.set(endpoint, JSON.parse(JSON.stringify(dataToReturn)));
                }

                return dataToReturn; // Success, exit the retry loop.

            } catch (error) {
                // If it's the last attempt, or not a retry-able error, throw.
                if (attempt === 2 || error.message.includes('Unauthorized') || error.message.startsWith('API Error')) {
                    console.error(`API call failed permanently for endpoint: ${endpoint}`, error);
                    throw error;
                }
                
                // Wait before retrying with exponential backoff (500ms, 1000ms).
                const delay = Math.pow(2, attempt) * 500;
                console.warn(`API call for ${endpoint} failed. Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    // --- Hall Management Functions ---
    const halls = {
        getAll: () => fetchWithAuth('api/hall/all-hall'),
        getById: (hallId) => fetchWithAuth(`api/hall/${hallId}`),
        update: (hallId, hallData) => fetchWithAuth(`api/hall/${hallId}`, {
            method: 'PUT',
            body: JSON.stringify(hallData)
        })
    };

    // --- School & Department Functions ---
    const organization = {
        getSchools: () => fetchWithAuth('api/school/all-schools'),
        getDepartments: () => fetchWithAuth('api/department/all-department')
    };

    // --- Employee Management Functions ---
    const employees = {
        getAll: () => fetchWithAuth('api/employee/all-employees'),
        update: (employeeId, employeeData) => fetchWithAuth(`api/employee/${employeeId}`, {
            method: 'PUT',
            body: JSON.stringify(employeeData)
        }),
        delete: (employeeId) => fetchWithAuth(`api/employee/${employeeId}`, {
            method: 'DELETE'
        })
    };

    // --- Booking Management Functions ---
    const bookings = {
        getMyBookings: () => fetchWithAuth('api/booking/my-requests'),
        getForHall: (hallId) => fetchWithAuth(`api/booking/hall/${hallId}`),
        getPendingForHall: (hallId) => fetchWithAuth(`api/booking/hall/pending/${hallId}`),
        getForApproval: () => fetchWithAuth('api/booking/approvals?filter=internal'),
        getForApprovalExternal: () => fetchWithAuth('api/booking/approvals?filter=external'),
        getForForwarding: () => fetchWithAuth('api/booking/approvals?filter=forward'),
        createRequest: (bookingData) => fetchWithAuth('api/booking/request', {
            method: 'POST',
            body: JSON.stringify(bookingData)
        }),
        cancel: (bookingId) => fetchWithAuth(`api/booking/${bookingId}`, {
            method: 'DELETE'
        }),
        updateStatus: (bookingId, action) => fetchWithAuth(`api/booking/${bookingId}/${action}`, {
            method: 'PUT'
        })
    };

    // Expose the public API functions for global use.
    return {
        halls,
        organization,
        employees,
        bookings,
        invalidateCache // Expose for manual cache clearing if ever needed for debugging
    };

})();

