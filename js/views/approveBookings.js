// Approve Bookings View Module
window.ApproveBookingsView = (function() {
    let abortController;
    
    function renderApproveBookingsTable(data) {
        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No pending requests.</td></tr>`;
            return;
        }
        
        const tableHtml = data.map(booking => `
            <tr class="hover:bg-slate-800/50 transition-colors" data-booking-id="${booking.bookingId}">
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${booking.bookedOn}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.hallName}</div>
                    <div class="text-slate-400">${booking.hallCode}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.purpose}</div>
                    <div class="text-slate-400">${booking.course}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${booking.dateTime.replace('\\n', '<br>')}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="font-medium text-white">${booking.bookedBy}</div>
                    <div class="text-slate-400">${booking.bookedByDept}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold text-yellow-400">${booking.status}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <div class="flex gap-2">
                        <button data-action="approve" class="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition">Approve</button>
                        <button data-action="reject" class="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');

        tableBody.innerHTML = tableHtml;
    }

    async function handleBookingAction(bookingId, action) {
        const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
        try {
            await AppData.updateBookingStatus(bookingId, status);
            alert(`Booking ${bookingId} has been ${status.toLowerCase()}.`);
            await initialize(); // Refresh the list
        } catch (error) {
            console.error(`Failed to ${action} booking:`, error);
            alert(`Error: Could not ${action} the booking. Please try again.`);
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const tableBody = document.getElementById('approve-bookings-body');
        if (!tableBody) return;

        tableBody.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const row = button.closest('tr');
            const bookingId = row.dataset.bookingId;
            const action = button.dataset.action;

            if (bookingId && (action === 'approve' || action === 'reject')) {
                if (confirm(`Are you sure you want to ${action} this booking?`)) {
                    handleBookingAction(bookingId, action);
                }
            }
        }, { signal });
    }

    async function initialize() {
        try {
            const data = await AppData.fetchApprovalData();
            renderApproveBookingsTable(data);
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading approval data:', error);
        }
    }
    
    function cleanup() {
        if (abortController) abortController.abort();
    }

    return {
        initialize,
        cleanup
    };
})();
