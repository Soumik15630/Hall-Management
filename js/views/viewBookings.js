// View Bookings View Module
window.ViewBookingsView = (function() {
    let abortController;
    let allBookings = []; // To store the master list of bookings
    let schools = []; // To cache school data
    let departments = []; // To cache department data
    let currentFilters = {
        status: '',
        hall: '',
        user: '',
        purpose: '',
        dateStart: '',
        dateEnd: '',
        timeStart: '',
        timeEnd: '',
        days: [],
        school: '',
        department: ''
    };

    // --- HELPER FUNCTIONS ---
    function formatStatus(status) {
        if (!status) return { text: 'Unknown', className: 'text-yellow-400' };
        const text = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        let className = 'text-yellow-400';
        if (status.includes('REJECTED')) className = 'text-red-400';
        else if (status.includes('APPROVED')) className = 'text-green-400';
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
        if (response.status === 204) return isJson ? [] : null;

        if (isJson) {
            const text = await response.text();
            if (!text) return [];
            try {
                const result = JSON.parse(text);
                return result.data || result;
            } catch (error) {
                console.error("Failed to parse JSON response:", text);
                throw new Error("Invalid JSON response from server.");
            }
        }
        return response;
    }

    async function fetchViewBookingsData() {
        return await fetchFromAPI(AppConfig.endpoints.myBookings);
    }
    
    async function fetchSchools() {
        if (schools.length === 0) {
           schools = await fetchFromAPI(AppConfig.endpoints.allSchools);
        }
        return schools;
    }

    async function fetchDepartments() {
        if (departments.length === 0) {
            departments = await fetchFromAPI(AppConfig.endpoints.allDepartments);
        }
        return departments;
    }

    async function cancelBooking(bookingId) {
        return await fetchFromAPI(`${AppConfig.endpoints.booking}/${bookingId}`, { method: 'DELETE' }, false);
    }

    // --- FILTERING LOGIC ---
    function applyFiltersAndRender() {
        let filteredBookings = [...allBookings];

        // Apply all filters
        if (currentFilters.status) filteredBookings = filteredBookings.filter(b => b.status === currentFilters.status);
        if (currentFilters.hall) filteredBookings = filteredBookings.filter(b => (b.hall && b.hall.name.toLowerCase().includes(currentFilters.hall.toLowerCase())) || b.hall_id.toLowerCase().includes(currentFilters.hall.toLowerCase()));
        if (currentFilters.user) filteredBookings = filteredBookings.filter(b => (b.user && b.user.name.toLowerCase().includes(currentFilters.user.toLowerCase())) || (b.user_id && b.user_id.toLowerCase().includes(currentFilters.user.toLowerCase())));
        if (currentFilters.purpose) filteredBookings = filteredBookings.filter(b => (b.purpose && b.purpose.toLowerCase().includes(currentFilters.purpose.toLowerCase())) || (b.class_code && b.class_code.toLowerCase().includes(currentFilters.purpose.toLowerCase())));
        if (currentFilters.school) filteredBookings = filteredBookings.filter(b => b.school_id === currentFilters.school);
        if (currentFilters.department) filteredBookings = filteredBookings.filter(b => b.department_id === currentFilters.department);
        
        // Date Range
        if (currentFilters.dateStart || currentFilters.dateEnd) {
             filteredBookings = filteredBookings.filter(booking => {
                const bookingStart = new Date(booking.start_date);
                const bookingEnd = new Date(booking.end_date);
                const filterStart = currentFilters.dateStart ? new Date(currentFilters.dateStart) : null;
                const filterEnd = currentFilters.dateEnd ? new Date(currentFilters.dateEnd) : null;
                bookingStart.setHours(0,0,0,0);
                bookingEnd.setHours(0,0,0,0);
                if(filterStart) filterStart.setHours(0,0,0,0);
                if(filterEnd) filterEnd.setHours(0,0,0,0);
                const startsBeforeEnd = filterEnd ? bookingStart <= filterEnd : true;
                const endsAfterStart = filterStart ? bookingEnd >= filterStart : true;
                return startsBeforeEnd && endsAfterStart;
            });
        }
        
        // Time Range
        if (currentFilters.timeStart || currentFilters.timeEnd) {
            filteredBookings = filteredBookings.filter(booking => {
                const bookingStartTime = booking.start_time;
                const bookingEndTime = booking.end_time;
                const filterStartTime = currentFilters.timeStart || '00:00';
                const filterEndTime = currentFilters.timeEnd || '23:59';
                return bookingStartTime <= filterEndTime && bookingEndTime >= filterStartTime;
            });
        }

        // Days of the Week
        if (currentFilters.days.length > 0) {
            filteredBookings = filteredBookings.filter(booking => 
                currentFilters.days.some(day => booking.days_of_week.includes(day))
            );
        }

        renderViewBookingsTable(filteredBookings);
    }

    // --- RENDERING ---
    function renderViewBookingsTable(data) {
        const tableBody = document.getElementById('view-bookings-body');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No bookings found for the selected filters.</td></tr>`;
            return;
        }

        const tableHtml = data.map(booking => {
            const { text: statusText, className: statusClass } = formatStatus(booking.status);
            const hallName = booking.hall ? booking.hall.name : 'N/A';
            const dateRange = `${formatDate(booking.start_date)} to ${formatDate(booking.end_date)}`;
            const timeRange = `${booking.start_time} - ${booking.end_time}`;
            const days = booking.days_of_week.map(day => day.substring(0, 3).toUpperCase()).join(', ');
            const userName = booking.user ? booking.user.name : 'N/A';
            const departmentName = (booking.department && booking.department.department_name) || 'N/A';
            const schoolName = (booking.school && booking.school.school_name) || 'N/A';

            return `
                 <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="px-3 py-4 text-sm">${formatDate(booking.created_at)}<div class="text-blue-400 text-xs mt-1">${booking.unique_id}</div></td>
                    <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${hallName}</div><div class="text-slate-400">${booking.hall_id}</div></td>
                    <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${booking.purpose}</div><div class="text-slate-400">${booking.class_code || 'N/A'}</div></td>
                    <td class="px-3 py-4 text-sm"><div>${dateRange}</div><div class="text-slate-400">${timeRange}</div><div class="text-slate-500 text-xs mt-1">${days}</div></td>
                    <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${userName}</div><div class="text-slate-400">${booking.user_id}</div></td>
                    <td class="px-3 py-4 text-sm"><div class="font-medium text-white">${departmentName}</div><div class="text-slate-400">${schoolName}</div></td>
                    <td class="whitespace-nowrap px-3 py-4 text-sm font-semibold ${statusClass}">${statusText}</td>
                    <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button data-booking-id="${booking.unique_id}" class="cancel-booking-btn text-red-400 hover:text-red-300 disabled:opacity-50">Cancel</button>
                    </td>
                </tr>
            `;
        }).join('');
        tableBody.innerHTML = tableHtml;
    }
    
    function populateFilterDropdowns() {
        const schoolFilter = document.getElementById('filter-school');
        const departmentFilter = document.getElementById('filter-department');
        
        if (schoolFilter) {
            fetchSchools().then(data => {
                schoolFilter.innerHTML = '<option value="">All Schools</option>' + data.map(s => `<option value="${s.id}">${s.school_name}</option>`).join('');
            });
        }
        if (departmentFilter) {
            fetchDepartments().then(data => {
                departmentFilter.innerHTML = '<option value="">All Departments</option>' + data.map(d => `<option value="${d.id}">${d.department_name}</option>`).join('');
            });
        }
    }

    function clearAllFilters() {
        currentFilters = { status: '', hall: '', user: '', purpose: '', dateStart: '', dateEnd: '', timeStart: '', timeEnd: '', days: [], school: '', department: '' };
        document.getElementById('filter-form').reset();
        document.querySelectorAll('.filter-day-checkbox').forEach(cb => cb.checked = false);
        applyFiltersAndRender();
    }
    
    // --- EVENT HANDLING ---
    function setupEventHandlers() {
        document.getElementById('filter-form').addEventListener('input', (e) => {
            const target = e.target;
            if (target.name) {
                if (target.type === 'checkbox') {
                    currentFilters.days = Array.from(document.querySelectorAll('.filter-day-checkbox:checked')).map(cb => cb.value);
                } else {
                    currentFilters[target.name] = target.value;
                }
                applyFiltersAndRender();
            }
        });

        document.getElementById('clear-filters-btn').addEventListener('click', clearAllFilters);
        
        document.getElementById('view-bookings-body').addEventListener('click', async (e) => {
            if (e.target.classList.contains('cancel-booking-btn')) {
                const bookingId = e.target.dataset.bookingId;
                if (confirm(`Are you sure you want to cancel booking ${bookingId}?`)) {
                    try {
                        e.target.disabled = true;
                        e.target.textContent = 'Cancelling...';
                        await cancelBooking(bookingId);
                        alert('Booking cancelled successfully.');
                        await initialize();
                    } catch (error) {
                        console.error(`Failed to cancel booking ${bookingId}:`, error);
                        alert('An error occurred while cancelling the booking.');
                        e.target.disabled = false;
                        e.target.textContent = 'Cancel';
                    }
                }
            }
        });
        
        // Lazy load filter dropdowns
        let filtersLoaded = false;
        document.getElementById('advanced-filters-toggle').addEventListener('click', () => {
            document.getElementById('advanced-filters').classList.toggle('hidden');
            if (!filtersLoaded) {
                populateFilterDropdowns();
                filtersLoaded = true;
            }
        });
    }

    // --- INITIALIZATION ---
    async function initialize() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const tableBody = document.getElementById('view-bookings-body');
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10"><div class="spinner"></div></td></tr>`;

        try {
            allBookings = await fetchViewBookingsData() || [];
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error initializing ViewBookingsView:', error);
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-red-400">Failed to load bookings. Please try again.</td></tr>`;
        }
    }

    function cleanup() {
        if (abortController) abortController.abort();
        clearAllFilters();
        allBookings = [];
        schools = [];
        departments = [];
    }

    return { initialize, cleanup };
})();
