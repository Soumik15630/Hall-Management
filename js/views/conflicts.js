// Booking Conflicts View Module
window.ConflictsView = (function() {

    // --- API & DATA HANDLING ---
    /**
     * Helper function to make authenticated API calls.
     * @param {string} endpoint - The API endpoint to call.
     * @returns {Promise<any>} - The JSON response data.
     */
    async function fetchFromAPI(endpoint) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const response = await fetch(fullUrl, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        const text = await response.text();
        if (!text) return [];
        const result = JSON.parse(text);
        return result.data || result;
    }

    /**
     * Fetches pending bookings and identifies conflicts.
     * A conflict is defined as two or more bookings for the same hall at the exact same time.
     * @returns {Promise<Array>} A promise that resolves to an array of conflicting booking objects.
     */
    async function fetchBookingConflictsData() {
        const pendingBookings = await fetchFromAPI(AppConfig.endpoints.pendingApprovals);
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
                        <button data-action="approve" class="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="reject" class="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
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

        // Placeholder for future functionality to resolve conflicts
        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            alert('Conflict resolution is not yet connected to the backend.');
        });
    }

    /**
     * Initializes the Booking Conflicts view.
     */
    async function initialize() {
        try {
            const data = await fetchBookingConflictsData();
            renderBookingConflictsTable(data);
            setupEventHandlers();
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