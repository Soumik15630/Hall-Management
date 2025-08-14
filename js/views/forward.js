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
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        if (options.body) {
            headers['Content-Type'] = 'application/json';
        }

        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        const text = await response.text();
        if (!text) return null;
        const result = JSON.parse(text);
        return result.data || result;
    }

    /**
     * Fetches bookings that are pending and need to be forwarded.
     * This endpoint should return bookings with status PENDING_HOD_APPROVAL
     * where the user's department is different from the hall's department.
     */
    async function fetchForwardBookingsData() {
        // Assuming 'api/booking/pending-for-forwarding' is the correct endpoint for this view.
        return await fetchFromAPI('api/booking/pending-approval');
    }

    /**
     * Updates the status of a booking to 'REJECTED'.
     * @param {string} bookingId - The ID of the booking to reject.
     */
    async function rejectBooking(bookingId) {
        const endpoint = `api/booking/${bookingId}/reject`;
        return await fetchFromAPI(endpoint, { method: 'PUT' });
    }

    /**
     * Forwards a booking to the next approval level (the hall's HOD).
     * @param {string} bookingId - The ID of the booking to forward.
     */
    async function forwardBooking(bookingId) {
        // Corrected endpoint and method as per the API documentation.
        const endpoint = `api/booking/${bookingId}/forward`;
        return await fetchFromAPI(endpoint, {
            method: 'PUT'
        });
    }


    // --- RENDERING ---

    /**
     * Formats the date and time details for a booking based on its type.
     * @param {object} booking - The booking object.
     * @returns {string} - The HTML formatted date and time string.
     */
    function formatBookingDateTime(booking) {
        const formatTime = (timeStr) => {
            if (!timeStr) return '';
            const [hour, minute] = timeStr.split(':');
            const date = new Date(1970, 0, 1, hour, minute);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        };
        
        const startTime = formatTime(booking.start_time);
        const endTime = formatTime(booking.end_time);

        if (booking.booking_type === 'SEMESTER') {
            const startDate = new Date(booking.start_date).toLocaleDateString();
            const endDate = new Date(booking.end_date).toLocaleDateString();
            const days = booking.days_of_week.map(day => day.charAt(0) + day.slice(1).toLowerCase()).join(', ');
            
            return `<div class="font-semibold">Semester: ${startDate} to ${endDate}</div>
                    <div class="text-slate-300">Every ${days}</div>
                    <div class="text-slate-300">${startTime} - ${endTime}</div>`;
        } else { // Handle single-day or other booking types
            const date = new Date(booking.start_date).toLocaleDateString();
            return `<div class="font-semibold">${date}</div>
                    <div class="text-slate-300">${startTime} - ${endTime}</div>`;
        }
    }

    /**
     * Renders the table for bookings that can be forwarded.
     * @param {Array} data - An array of booking objects.
     */
    function renderForwardBookingsTable(data) {
        const tableBody = document.getElementById('forward-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">✅ No pending requests to forward.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => `
            <tr class="hover:bg-slate-800/50 transition-colors">
                <td class="px-3 py-4 text-sm text-slate-300 align-top">${new Date(booking.created_at).toLocaleDateString()}</td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-white">${booking.hall?.name || 'N/A'}</div>
                    <div class="text-slate-400 text-xs mt-1 break-all">${booking.hall_id}</div>
                </td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-white">${booking.purpose}</div>
                    <div class="text-slate-400">${booking.class_code || ''}</div>
                </td>
                <td class="px-3 py-4 text-sm text-slate-300 align-top">${formatBookingDateTime(booking)}</td>
                <td class="px-3 py-4 text-sm align-top">
                    <div class="font-medium text-white">${booking.user?.employee?.employee_name || 'N/A'}</div>
                </td>
                <td class="px-3 py-4 text-sm font-semibold text-yellow-400 align-top">${booking.status}</td>
                <td class="px-3 py-4 text-sm text-center align-top">
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
        const row = document.querySelector(`button[data-booking-id="${bookingId}"]`).closest('tr');
        if (row) {
            row.style.opacity = '0.5';
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }

        try {
            let response;
            if (action === 'forward') {
                response = await forwardBooking(bookingId);
                alert(response.message || `Booking has been forwarded successfully!`);
            } else if (action === 'reject') {
                response = await rejectBooking(bookingId);
                alert(response.message || `Booking has been rejected successfully.`);
            }
            await initialize(); // Refresh the list
        } catch (error) {
            console.error(`Failed to ${action} booking ${bookingId}:`, error);
            alert(`Error: Could not complete the '${action}' action. ${error.message}`);
            if (row) { // Restore row on error
                row.style.opacity = '1';
                row.querySelectorAll('button').forEach(btn => btn.disabled = false);
            }
        }
    }

    /**
     * Sets up event listeners for the view.
     */
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const tableBody = document.getElementById('forward-bookings-body');
        if (!tableBody) return;

        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button || button.disabled) return;

            const bookingId = button.dataset.bookingId;
            const action = button.dataset.action;

            if (confirm(`Are you sure you want to ${action} this booking?`)) {
                handleBookingAction(bookingId, action);
            }
        }, { signal });
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
