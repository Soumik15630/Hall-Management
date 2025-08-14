// View Bookings View Module
window.ViewBookingsView = (function() {
    let abortController;

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };

        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) {
            className = 'text-red-400';
        } else if (status.includes('APPROVED')) {
            className = 'text-green-400';
        }
        return { text, className };
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) {
            logout();
            throw new Error("User not authenticated");
        }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        if (isJson) {
            const text = await response.text();
            if (!text) return null;
            const result = JSON.parse(text);
            return result.data || result;
        }
        return response;
    }

    async function fetchViewBookingsData() {
        return await fetchFromAPI(AppConfig.endpoints.myBookings);
    }

    async function cancelBooking(bookingId) {
        // Calls DELETE api/booking/{id}
        return await fetchFromAPI(`${AppConfig.endpoints.booking}/${bookingId}`, { method: 'DELETE' }, false);
    }


    // --- RENDERING ---
    function renderViewBookingsTable(data) {
        const tableBody = document.getElementById('view-bookings-body');
        if (!tableBody) {
            console.error("Table body 'view-bookings-body' not found.");
            return;
        }

        // MODIFIED: Add 'Action' header to the table if it's missing
        const table = tableBody.closest('table');
        if (table) {
            const headerRow = table.querySelector('thead tr');
            // Check if the header row exists and has exactly 6 columns, implying 'Action' is missing.
            if (headerRow && headerRow.children.length === 6) {
                const th = document.createElement('th');
                th.scope = 'col';
                th.className = 'relative py-3.5 pl-3 pr-4 sm:pr-6 text-left text-sm font-semibold text-white';
                th.textContent = 'Action';
                headerRow.appendChild(th);
            }
        }


        if (!data || data.length === 0) {
            // MODIFIED: Updated colspan to account for the new 'Action' column
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No bookings found.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const { text: statusText, className: statusClass } = formatStatus(booking.status);

            const hallName = booking.hall ? booking.hall.name : 'Hall name not available';
            const dateRange = `${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}`;
            const timeRange = `${booking.start_time} - ${booking.end_time}`;
            const days = booking.days_of_week.map(day => day.substring(0, 3).toUpperCase()).join(', ');
            const userName = booking.user ? booking.user.name : 'User name not available';

            return `
                 <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="px-3 py-4 text-sm" style="white-space: normal; word-break: break-word; max-width: 150px;">
                        <div class="text-slate-300">${formatDate(booking.created_at)}</div>
                        <div class="text-blue-400 text-xs mt-1">${booking.unique_id}</div>
                    </td>
                    <td class="px-3 py-4 text-sm" style="white-space: normal; word-break: break-word; max-width: 200px;">
                        <div class="font-medium text-white">${hallName}</div>
                        <div class="text-slate-400">${booking.hall_id}</div>
                    </td>
                    <td class="px-3 py-4 text-sm" style="white-space: normal; word-break: break-word; max-width: 200px;">
                        <div class="font-medium text-white">${booking.purpose}</div>
                        <div class="text-slate-400">${booking.class_code || 'N/A'}</div>
                    </td>
                    <td class="px-3 py-4 text-sm text-slate-300" style="white-space: normal; word-break: break-word; max-width: 200px;">
                        <div>${dateRange}</div>
                        <div class="text-slate-400">${timeRange}</div>
                        <div class="text-slate-500 text-xs mt-1">${days}</div>
                    </td>
                    <td class="px-3 py-4 text-sm" style="white-space: normal; word-break: break-word; max-width: 150px;">
                        <div class="font-medium text-white">${userName}</div>
                        <div class="text-slate-400 text-xs mt-1">${booking.user_id}</div>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusClass}">${statusText}</td>
                    <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button data-booking-id="${booking.unique_id}" class="cancel-booking-btn text-red-400 hover:text-red-300 disabled:opacity-50">Cancel</button>
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.innerHTML = tableHtml;
    }

    // --- EVENT HANDLING ---
    function setupEventHandlers() {
        const tableBody = document.getElementById('view-bookings-body');
        if (!tableBody) return;

        // Use event delegation for cancel buttons
        tableBody.addEventListener('click', async (e) => {
            if (e.target.classList.contains('cancel-booking-btn')) {
                const button = e.target;
                const bookingId = button.dataset.bookingId;

                if (confirm(`Are you sure you want to cancel booking ${bookingId}?`)) {
                    try {
                        button.disabled = true;
                        button.textContent = 'Cancelling...';
                        await cancelBooking(bookingId);
                        alert('Booking cancelled successfully.');
                        await initialize(); // Refresh the view
                    } catch (error) {
                        console.error(`Failed to cancel booking ${bookingId}:`, error);
                        alert('An error occurred while cancelling the booking.');
                        button.disabled = false;
                        button.textContent = 'Cancel';
                    }
                }
            }
        });
    }

    // --- INITIALIZATION ---
    async function initialize() {
        if (abortController) abortController.abort();
        abortController = new AbortController();

        const tableBody = document.getElementById('view-bookings-body');
        if (tableBody) {
            // MODIFIED: Updated colspan to account for the new 'Action' column
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10"><div class="spinner"></div></td></tr>`;
        }

        try {
            const data = await fetchViewBookingsData();
            renderViewBookingsTable(data);
            setupEventHandlers(); // Set up listeners after rendering
        } catch (error) {
            console.error('Error loading bookings for viewing:', error);
            if(tableBody) {
                 // MODIFIED: Updated colspan to account for the new 'Action' column
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load bookings. Please try again.</td></tr>`;
            }
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
