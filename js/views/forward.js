// Forward Bookings View Module
window.ForwardView = (function() {
    let abortController;

    // --- API & DATA HANDLING ---
    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @param {object} options - Fetch options (method, body, etc.).
     * @returns {Promise<any>} - The JSON response data.
     */
    async function fetchFromAPI(endpoint, options = {}) {
        // This function assumes getAuthHeaders() and AppConfig are defined globally
        // and that logout() is available to handle authentication failures.
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        // Ensure Content-Type is set for POST/PUT requests with a body
        if (options.body) {
            headers['Content-Type'] = 'application/json';
        }

        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options,
            headers
        };
        const response = await fetch(fullUrl, config);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        const text = await response.text();
        if (!text) return null;
        const result = JSON.parse(text);
        // This handles responses that wrap data in a 'data' property
        // and also responses that do not (like the reject/approve endpoints).
        return result.data || result;
    }

    /**
     * Fetches bookings that are pending and need to be forwarded.
     */
    async function fetchForwardBookingsData() {
        return await fetchFromAPI(AppConfig.endpoints.pendingApprovals);
    }

    /**
     * Updates the status of a booking to 'REJECTED'.
     * @param {string} bookingId - The ID of the booking to reject.
     */
    async function rejectBooking(bookingId) {
        const endpoint = `${AppConfig.endpoints.booking}/${bookingId}/reject`;
        // We expect a JSON response with a message, so we use fetchFromAPI
        return await fetchFromAPI(endpoint, {
            method: 'PUT'
        });
    }


    // --- RENDERING ---
    /**
     * Renders the table for bookings that can be forwarded.
     * @param {Array} data - An array of booking objects.
     */
    function renderForwardBookingsTable(data) {
        const tableBody = document.getElementById('forward-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No pending requests to forward.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => `
            <tr class="hover:bg-slate-800/50 transition-colors">
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${new Date(booking.created_at).toLocaleDateString()}</td>
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
                    <div class="font-medium text-white">${booking.user_name}</div>
                    <div class="text-slate-400">${booking.user_department}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold text-yellow-400">${booking.status}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="flex gap-2">
                        <button data-booking-id="${booking.unique_id}" data-action="forward" class="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition">Forward</button>
                        <button data-booking-id="${booking.unique_id}" data-action="reject" class="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');

        tableBody.innerHTML = tableHtml;
    }

    // --- EVENT HANDLING ---
    /**
     * Handles actions like forwarding or rejecting a booking.
     * @param {string} bookingId - The ID of the booking.
     * @param {string} action - The action to perform ('forward' or 'reject').
     */
    async function handleBookingAction(bookingId, action) {
        try {
            let response;
            if (action === 'forward') {
                // Use the fetchFromAPI helper for a POST request to the 'forward' endpoint
                response = await fetchFromAPI(AppConfig.endpoints.forward, {
                    method: 'POST',
                    body: JSON.stringify({
                        unique_id: bookingId
                    })
                });
                alert(response.message || `Booking ${bookingId} has been forwarded successfully!`);

            } else if (action === 'reject') {
                // Call the rejectBooking function to handle the API call
                response = await rejectBooking(bookingId);
                alert(response.message || `Booking ${bookingId} has been rejected successfully.`);
            }

            // Refresh the list to show the updated data
            await initialize();

        } catch (error) {
            console.error(`Failed to ${action} booking ${bookingId}:`, error);
            alert(`Error: Could not complete the '${action}' action. ${error.message}`);
        }
    }

    /**
     * Sets up event listeners for the view.
     */
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const {
            signal
        } = abortController;

        const tableBody = document.getElementById('forward-bookings-body');
        if (!tableBody) return;

        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const bookingId = button.dataset.bookingId;
            const action = button.dataset.action;

            if (confirm(`Are you sure you want to ${action} this booking?`)) {
                handleBookingAction(bookingId, action);
            }
        }, {
            signal
        });
    }

    /**
     * Initializes the Forward Bookings view.
     */
    async function initialize() {
        try {
            const data = await fetchForwardBookingsData();
            renderForwardBookingsTable(data);
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading forward bookings view:', error);
            const tableBody = document.getElementById('forward-bookings-body');
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load data. ${error.message}</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
    }

    // Public API
    return {
        initialize,
        cleanup
    };
})();
