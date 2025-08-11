// Booking Conflicts View Module
window.ConflictsView = (function() {

    // --- API & DATA HANDLING ---
    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @param {string} [method='GET'] - The HTTP method to use.
     * @param {object|null} [body=null] - The request body for PUT/POST requests.
     * @returns {Promise<any>} - The JSON response data.
     */
    async function apiCall(endpoint, method = 'GET', body = null) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }

        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const options = {
            method,
            headers,
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${method} ${endpoint}: ${response.status} - ${errorText}`);
        }
        
        const text = await response.text();
        if (!text) return null; // Return null for empty responses (e.g., on successful PUT/DELETE)
        
        const result = JSON.parse(text);
        return result.data || result;
    }


    /**
     * Fetches pending bookings and identifies conflicts.
     * A conflict is defined as two or more bookings for the same hall at the exact same time.
     * @returns {Promise<Array>} A promise that resolves to an array of conflicting booking objects.
     */
    async function fetchBookingConflictsData() {
        const pendingBookings = await apiCall(AppConfig.endpoints.pendingApprovals);
        if (!pendingBookings || pendingBookings.length === 0) {
            return [];
        }

        const slots = new Map();
        const conflictingBookings = new Set();

        for (const booking of pendingBookings) {
            // Create a unique key for each time slot (hall + start time)
            const slotKey = `${booking.hall_id}-${new Date(booking.start_date).toISOString()}`;

            if (slots.has(slotKey)) {
                // If the key already exists, we've found a conflict.
                // Add both the previous booking and the current one to our conflict set.
                conflictingBookings.add(slots.get(slotKey));
                conflictingBookings.add(booking);
            } else {
                // If no conflict, just map the slot for future checks.
                slots.set(slotKey, booking);
            }
        }

        return Array.from(conflictingBookings);
    }

    /**
     * Handles the approval or rejection of a booking.
     * @param {string} bookingId - The unique ID of the booking.
     * @param {string} action - The action to perform ('approve' or 'reject').
     */
    async function handleBookingAction(bookingId, action) {
        // Disable buttons on the row to prevent double-clicks
        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if(row) {
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
            row.style.opacity = '0.5';
        }

        try {
            // Construct the endpoint from the base path and action
            const endpoint = `/api/booking/${bookingId}/${action}`;
            const result = await apiCall(endpoint, 'PUT');

            console.log(`Booking ${bookingId} ${action}d successfully.`, result);
            
            // On success, simply re-initialize the view to refresh the list
            await initialize();

        } catch (error) {
            console.error(`Failed to ${action} booking ${bookingId}:`, error);
            alert(`Error: Could not ${action} the booking. ${error.message}`);
            // Re-enable buttons on failure
            if(row) {
                row.querySelectorAll('button').forEach(btn => btn.disabled = false);
                row.style.opacity = '1';
            }
        }
    }


    // --- RENDERING ---
    /**
     * Renders the table of conflicting bookings.
     * @param {Array} data - An array of booking objects that are in conflict.
     */
    function renderBookingConflictsTable(data) {
        const tableBody = document.getElementById('booking-conflicts-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No booking conflicts found.</td></tr>`;
            return;
        }
        
        const tableHtml = data.map(booking => `
            <tr class="bg-red-900/20" data-booking-id="${booking.unique_id}">
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="text-slate-300">${new Date(booking.created_at).toLocaleDateString()}</div>
                    <div class="text-blue-400">${booking.unique_id}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.hall_name}</div>
                    <div class="text-slate-400">${booking.hall_id}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.purpose}</div>
                    <div class="text-slate-400">${booking.class_code || ''}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${new Date(booking.start_date).toLocaleString()} - ${new Date(booking.end_date).toLocaleTimeString()}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${booking.user_name}</div>
                    <div class="text-slate-400">${booking.user_department}</div>
                    <div class="text-slate-400">${booking.user_phone || ''}</div>
                    <div class="text-slate-400">${booking.user_email || ''}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-semibold text-yellow-400">${booking.status}</div>
                    <div class="text-red-400 font-semibold mt-1">Conflict Exists</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="flex flex-col gap-2">
                        <button data-action="approve" class="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed">Approve</button>
                        <button data-action="reject" class="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');

        tableBody.innerHTML = tableHtml;
    }

    // --- EVENT HANDLING ---
    /**
     * Sets up event listeners for the view.
     */
    function setupEventHandlers() {
        const tableBody = document.getElementById('booking-conflicts-body');
        if (!tableBody) return;

        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button || button.disabled) return;

            const action = button.dataset.action;
            const row = e.target.closest('tr[data-booking-id]');
            const bookingId = row ? row.dataset.bookingId : null;

            if (bookingId && (action === 'approve' || action === 'reject')) {
                 if (confirm(`Are you sure you want to ${action} booking ${bookingId}? This may resolve the conflict.`)) {
                    handleBookingAction(bookingId, action);
                }
            }
        });
    }

    /**
     * Initializes the Booking Conflicts view.
     */
    async function initialize() {
        // A flag to ensure event handlers are only set up once.
        if (!window.ConflictsView.isInitialized) {
             setupEventHandlers();
             window.ConflictsView.isInitialized = true;
        }

        try {
            const data = await fetchBookingConflictsData();
            renderBookingConflictsTable(data);
        } catch (error) {
            console.error('Error loading booking conflicts:', error);
            const tableBody = document.getElementById('booking-conflicts-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load conflict data. ${error.message}</td></tr>`;
        }
    }

    return {
        initialize
    };
})();