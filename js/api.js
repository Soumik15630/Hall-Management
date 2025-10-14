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
        'api/school/': ['api/school/all-schools'],
        'api/department/': ['api/department/all-department'],
        'api/booking/': [
            'api/booking/my-requests',
            'api/booking/approvals?filter=all',
            'api/booking/approvals?filter=internal',
            'api/booking/approvals?filter=forward',
            'api/booking/approvals?filter=external',
            'api/booking/conflicts'
        ]
    };

    /**
     * Intelliogently clears relevant parts of the cache after a data modification.
     * @param {string} modifiedEndpoint - The endpoint that was written to (e.g., PUT 'api/hall/123').
     */
    function invalidateCache(modifiedEndpoint) {
        console.log(`ApiService Cache: Invalidating cache due to modification on: ${modifiedEndpoint}`);
        let invalidated = false;

        // Invalidate list-based caches
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

        // Special handling for bookings: also clear individual hall/user conflict caches
        if (modifiedEndpoint.startsWith('api/booking/')) {
            for (const key of cache.keys()) {
                if (key.startsWith('api/booking/hall/') || key.startsWith('api/booking/conflicts/')) {
                    cache.delete(key);
                    console.log(`ApiService Cache: Cleared specific booking-related cache '${key}'`);
                    invalidated = true;
                }
            }
        }

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
        // Allow login to proceed without auth headers
        if (!authHeaders && endpoint !== 'api/auth/login') {
            logout();
            return Promise.reject(new Error("User not authenticated."));
        }

        options.headers = new Headers(authHeaders || {});
        if (options.body && !options.headers.has('Content-Type')) {
            options.headers.set('Content-Type', 'application/json');
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(fullUrl, options);

                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status}`);
                }

                if (response.status === 401 && endpoint !== 'api/auth/login') {
                    console.error("Unauthorized (401) detected by ApiService. Logging out.");
                    logout();
                    throw new Error('Unauthorized');
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`API Error Response on ${endpoint}:`, errorText);
                    throw new Error(`API Error: ${response.status} - ${errorText}`);
                }

                if (!isReadOperation) {
                    invalidateCache(endpoint);
                }

                if (response.status === 204) { // No Content
                    return null;
                }

                const result = await response.json();
                const dataToReturn = result.data || result;

                if (isReadOperation) {
                    console.log(`ApiService Cache: Caching response for: ${endpoint}`);
                    cache.set(endpoint, JSON.parse(JSON.stringify(dataToReturn)));
                }

                return dataToReturn;

            } catch (error) {
                if (attempt === 2 || error.message.includes('Unauthorized') || error.message.startsWith('API Error')) {
                    console.error(`API call failed permanently for endpoint: ${endpoint}`, error);
                    throw error;
                }
                
                const delay = Math.pow(2, attempt) * 500;
                console.warn(`API call for ${endpoint} failed. Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    // --- Authentication Functions ---
    const auth = {
        login: (credentials) => fetchWithAuth('api/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        })
    };

    // --- Hall Management Functions ---
    const halls = {
        getAll: (filter = 'all') => fetchWithAuth(`api/hall/all-hall?filter=${filter}`),
        getArchived:(filter = 'archived')=> fetchWithAuth(`api/hall/all-hall?filter=${filter}`),
        getById: (hallId) => fetchWithAuth(`api/hall/${hallId}`),
        create: (hallData) => fetchWithAuth('api/hall/create', { method: 'POST', body: JSON.stringify(hallData) }),
        update: (hallId, hallData) => fetchWithAuth(`api/hall/${hallId}`, { method: 'PATCH', body: JSON.stringify(hallData) }),
        delete: (hallId) => fetchWithAuth(`api/hall/${hallId}`, { method: 'DELETE' })
    };

    // --- School & Department Functions (Old Structure) ---
    const organization = {
        getSchools: () => fetchWithAuth('api/school/all-schools'),
        getDepartments: () => fetchWithAuth('api/department/all-department')
    };

    // --- Employee Management Functions ---
    const employees = {
        getAll: () => fetchWithAuth('api/employee/all-employees'),
        getById: (employeeId) => fetchWithAuth(`api/employee/${employeeId}`),
        create: (employeeData) => fetchWithAuth('api/employee/create', { method: 'POST', body: JSON.stringify(employeeData) }),
        update: (employeeId, employeeData) => fetchWithAuth(`api/employee/${employeeId}`, { method: 'PATCH', body: JSON.stringify(employeeData) }),
        delete: (employeeId) => fetchWithAuth(`api/employee/${employeeId}`, { method: 'DELETE' })
    };

    // --- Booking Management Functions ---
    const bookings = {
        // GET
        getMyBookings: () => fetchWithAuth('api/booking/my-requests'),
        getApprovals: (filter = 'all') => fetchWithAuth(`api/booking/approvals?filter=${filter}`),
        getForApproval: () => fetchWithAuth('api/booking/approvals?filter=internal'),
        getForApprovalExternal: () => fetchWithAuth('api/booking/approvals?filter=external'),
        getForForwarding: () => fetchWithAuth('api/booking/approvals?filter=forward'),
        getForHall: (hallId) => fetchWithAuth(`api/booking/hall/${hallId}`),
        getPendingForHall: (hallId) => fetchWithAuth(`api/booking/hall/pending/${hallId}`),
        getConflicts: () => fetchWithAuth('api/booking/conflicts'),
        getConflictsForHall: (hallId) => fetchWithAuth(`api/booking/conflicts/hall/${hallId}`),
        getConflictsForUser: (userId) => fetchWithAuth(`api/booking/conflicts/user/${userId}`),
        
        // POST
        createRequest: (bookingData) => fetchWithAuth('api/booking/request', { method: 'POST', body: JSON.stringify(bookingData) }),
        
        // PUT
        approve: (bookingId) => fetchWithAuth(`api/booking/${bookingId}/approve`, { method: 'PUT' }),
        forward: (bookingId) => fetchWithAuth(`api/booking/${bookingId}/forward`, { method: 'PUT' }),
        reject: (bookingId) => fetchWithAuth(`api/booking/${bookingId}/reject`, { method: 'PUT' }),
        modify: (bookingId, bookingData) => fetchWithAuth(`api/booking/${bookingId}/modify`, { method: 'PUT', body: JSON.stringify(bookingData) }),

        // DELETE
        delete: (bookingId) => fetchWithAuth(`api/booking/${bookingId}`, { method: 'DELETE' })
    };

    // Expose the public API functions for global use.
    return {
        auth,
        halls,
        organization,
        employees,
        bookings,
        invalidateCache
    };

})();
