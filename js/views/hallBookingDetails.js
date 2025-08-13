window.HallBookingDetailsView = (function() {

    // --- STATE MANAGEMENT ---
    let state = {
        hall: null,
        availabilityData: [], // Will hold all bookings (approved, pending)
        selectedSlots: [], // Format: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
        currentDate: new Date(),
    };
    let abortController;
    let tooltipTimeout;
    const timeSlots = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // --- UTILITY FUNCTIONS FOR IST TIME HANDLING ---
    function getTodayISTString() {
        const now = new Date();
        // Use en-CA format (YYYY-MM-DD) for easy string comparison
        const year = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' });
        const month = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit' });
        const day = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' });
        return `${year}-${month}-${day}`;
    }

    function getCurrentISTTimeString() {
        const now = new Date();
        // Use en-GB format (HH:MM:SS)
        const timeString = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
        return timeString.substring(0, 5); // Returns time as 'HH:mm'
    }

    function isSlotInPast(dateString, time) {
        const todayISTString = getTodayISTString();
        if (dateString < todayISTString) return true;
        if (dateString === todayISTString) {
            const nowISTTime = getCurrentISTTimeString();
            return time < nowISTTime;
        }
        return false;
    }

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}) {
        const headers = getAuthHeaders(); // Assuming this function exists globally
        if (!headers) {
            logout(); // Assuming this function exists globally
            throw new Error("User not authenticated");
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
        try {
            const parsed = JSON.parse(text);
            // The API might return data directly or within a 'data' property
            return parsed.data || parsed;
        } catch (e) {
            console.error("Failed to parse API response:", text);
            return null;
        }
    }

    function getBookingsForSlot(dateString, time) {
        if (!state.availabilityData || state.availabilityData.length === 0) {
            return [];
        }
        
        const slotDateTime = new Date(`${dateString}T${time}:00.000Z`);

        return state.availabilityData.filter(b => {
            if (!b || !b.start_time || !b.end_time) return false;
            
            try {
                const bookingStartDateTime = new Date(b.start_time);
                const bookingEndDateTime = new Date(b.end_time);
                return slotDateTime >= bookingStartDateTime && slotDateTime < bookingEndDateTime;
            } catch (e) {
                console.error("Error parsing booking dates", e);
                return false;
            }
        });
    }
    
    function formatTimeForDisplay(time) {
        const [hour, minute] = time.split(':');
        const h = parseInt(hour);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${String(displayHour).padStart(2, '0')}:${minute} ${suffix}`;
    }

    // --- TOOLTIP MANAGEMENT ---
    function createTooltip(content, targetElement) {
        removeTooltip(); // Remove any existing tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'booking-tooltip';
        tooltip.className = 'absolute z-50 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-sm max-w-xs w-max';
        tooltip.innerHTML = content;
        document.body.appendChild(tooltip);

        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let top = targetRect.bottom + window.scrollY + 5;
        let left = targetRect.left + window.scrollX + (targetRect.width / 2) - (tooltipRect.width / 2);

        // Adjust if off-screen
        if (left < 0) left = 5;
        if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 5;
        if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
            top = targetRect.top + window.scrollY - tooltipRect.height - 5;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    function removeTooltip() {
        const existingTooltip = document.getElementById('booking-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
    }

    // --- RENDERING LOGIC ---
    function render() {
        if (!state.hall) return;
        renderHallInfo();
        rerenderCalendar();
        setupEventHandlers();
    }

    function renderHallInfo() {
        const { hall } = state;
        document.getElementById('booking-hall-details').innerHTML = `
            <h3 class="text-lg font-bold text-blue-300 mb-3">Hall Details</h3>
            <div class="space-y-2 text-sm">
                <div><span class="text-slate-400">Name:</span> <span class="text-white font-semibold">${hall.name || 'N/A'}</span></div>
                <div><span class="text-slate-400">Location:</span> <span class="text-white">${hall.location}</span></div>
                <div><span class="text-slate-400">Capacity:</span> <span class="text-white">${hall.capacity || 'N/A'} people</span></div>
                <div><span class="text-slate-400">Floor:</span> <span class="text-white">${hall.floor || 'N/A'}</span></div>
            </div>`;
        document.getElementById('booking-hall-features').innerHTML = `
            <h3 class="text-lg font-bold text-green-300 mb-3">Features</h3>
            ${hall.features && hall.features.length > 0 ?
                `<div class="flex flex-wrap gap-2">${hall.features.map(f => `<span class="px-2 py-1 bg-green-900/50 text-green-200 rounded-full text-xs">${f}</span>`).join('')}</div>` :
                '<p class="text-sm text-slate-400">No special features listed.</p>'}`;
        document.getElementById('booking-hall-incharge').innerHTML = `
            <h3 class="text-lg font-bold text-yellow-300 mb-3">Contact Information</h3>
            <div class="space-y-2 text-sm">
                <div><span class="text-slate-400">In-charge:</span> <span class="text-white">${hall.incharge.name}</span></div>
                <div><span class="text-slate-400">Designation:</span> <span class="text-white">${hall.incharge.designation}</span></div>
                <div><span class="text-slate-400">Email:</span> <span class="text-white">${hall.incharge.email}</span></div>
                <div><span class="text-slate-400">Intercom:</span> <span class="text-white">${hall.incharge.intercom}</span></div>
            </div>`;
    }

    function renderCalendarGrid() {
        const { currentDate } = state;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        document.getElementById('current-month-year').textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;

        return `
            <table class="w-full border-collapse">
                <thead>
                    <tr class="sticky top-0 bg-slate-800/50 backdrop-blur-sm">
                        <th class="p-2 w-24"></th> <!-- Time column -->
                        ${Array.from({ length: daysInMonth }, (_, i) => `
                            <th class="text-center p-2">
                                <div class="font-semibold">${i + 1}</div>
                                <div class="text-xs text-slate-400">${dayNames[new Date(year, month, i + 1).getDay()]}</div>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-700/50">
                    ${timeSlots.map(time => `
                        <tr class="divide-x divide-slate-700/50">
                            <td class="text-right text-sm text-slate-300 p-2 whitespace-nowrap">${formatTimeForDisplay(time)}</td>
                            ${Array.from({ length: daysInMonth }, (_, i) => {
                                const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                                const { classes, status, isClickable } = getSlotStatus(dateString, time);
                                return `
                                    <td class="p-1">
                                        <button class="w-full h-10 rounded transition-all duration-200 ${classes}" 
                                                data-date="${dateString}" 
                                                data-time="${time}"
                                                data-status="${status}"
                                                ${!isClickable ? 'disabled' : ''}>
                                        </button>
                                    </td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function getSlotStatus(dateString, time) {
        if (state.selectedSlots.some(s => s.date === dateString && s.time === time)) {
            return { classes: 'bg-cyan-500 ring-2 ring-cyan-200', status: 'selected', isClickable: true };
        }

        if (isSlotInPast(dateString, time)) {
            return { classes: 'bg-slate-700/50 cursor-not-allowed', status: 'past', isClickable: false };
        }

        const bookings = getBookingsForSlot(dateString, time);
        if (bookings.length > 0) {
            if (bookings.some(b => b.status === 'APPROVED')) {
                return { classes: 'bg-red-600/80 cursor-pointer', status: 'booked', isClickable: true };
            }
            if (bookings.some(b => b.status === 'PENDING')) {
                return { classes: 'bg-yellow-500/80 hover:bg-yellow-400/80 cursor-pointer', status: 'pending', isClickable: true };
            }
            // Fallback for bookings without a status field
            return { classes: 'bg-red-600/80 cursor-pointer', status: 'booked', isClickable: true };
        }
        
        const dateParts = dateString.split('-').map(Number);
        const dayOfWeek = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return { classes: 'bg-green-400/60 hover:bg-green-500/70', status: 'available-weekend', isClickable: true };
        }

        return { classes: 'bg-green-700/80 hover:bg-green-600/80', status: 'available', isClickable: true };
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        
        const viewContainer = document.getElementById('hall-booking-details-view');
        if (!viewContainer) return;

        viewContainer.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;

            if (button.id === 'prev-month-btn') {
                state.currentDate.setMonth(state.currentDate.getMonth() - 1);
                rerenderCalendar();
            } else if (button.id === 'next-month-btn') {
                state.currentDate.setMonth(state.currentDate.getMonth() + 1);
                rerenderCalendar();
            } else if (button.id === 'book-hall-btn') {
                handleBookHall();
            } else if (button.dataset.date && button.dataset.time) {
                handleSlotClick(button);
            }
        }, { signal });

        const grid = viewContainer.querySelector('#booking-calendar-grid');
        if (!grid) return;

        grid.addEventListener('mouseover', e => {
            const slot = e.target.closest('button[data-status="booked"], button[data-status="pending"]');
            if (slot) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = setTimeout(() => showSlotTooltip(slot), 200);
            }
        }, { signal });

        grid.addEventListener('mouseout', e => {
            const slot = e.target.closest('button[data-status="booked"], button[data-status="pending"]');
            if (slot) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = setTimeout(removeTooltip, 300);
            }
        }, { signal });
        
        document.body.addEventListener('mouseover', e => {
            if (e.target.closest('#booking-tooltip')) clearTimeout(tooltipTimeout);
        }, { signal });
        
        document.body.addEventListener('mouseout', e => {
             if (e.target.closest('#booking-tooltip')) removeTooltip();
        }, { signal });
    }

    function rerenderCalendar() {
        const calendarGrid = document.getElementById('booking-calendar-grid');
        if (calendarGrid) {
            calendarGrid.innerHTML = renderCalendarGrid();
        }
    }

    function showSlotTooltip(slotEl) {
        const { date, time, status } = slotEl.dataset;
        const bookings = getBookingsForSlot(date, time);
        if (bookings.length === 0) return;

        const booking = bookings[0];
        
        if (status === 'booked') {
            const content = `
                <div class="font-bold text-red-400 mb-2">Slot Booked</div>
                <div class="space-y-1">
                    <div><span class="text-slate-400">By:</span> <span class="text-white">${booking.user.name}</span></div>
                    <div><span class="text-slate-400">Dept:</span> <span class="text-white">${booking.user.department}</span></div>
                    <div><span class="text-slate-400">Purpose:</span> <span class="text-white">${booking.purpose}</span></div>
                </div>`;
            createTooltip(content, slotEl);
        } else if (status === 'pending') {
            const content = `
                <div class="font-bold text-yellow-400 mb-2">Pending Requests (${bookings.length})</div>
                <ul class="space-y-2 list-disc list-inside">
                    ${bookings.map(b => `<li><span class="text-white">${b.user.name}</span> <span class="text-slate-400">(${b.user.department})</span></li>`).join('')}
                </ul>
                <div class="text-xs text-slate-500 mt-2">This slot can still be selected.</div>`;
            createTooltip(content, slotEl);
        }
    }

    function handleSlotClick(slotEl) {
        const { status } = slotEl.dataset;

        if (status === 'booked' || status === 'pending') {
            showSlotTooltip(slotEl);
        }
        
        if (status === 'past' || status === 'booked') {
            return;
        }

        const { date, time } = slotEl.dataset;
        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        if (existingIndex > -1) {
            state.selectedSlots.splice(existingIndex, 1);
        } else {
             const existingDates = [...new Set(state.selectedSlots.map(slot => slot.date))];
             if(existingDates.length > 0 && !existingDates.includes(date)) {
                 showNotification("You can only pre-select slots for one day at a time. Please clear your selection to choose a different day.");
                 return;
             }
            state.selectedSlots.push({ date, time });
        }
        rerenderCalendar();
    }
    
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg animate-pulse';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    function handleBookHall() {
        if (state.selectedSlots.length === 0) {
            showNotification("Please select at least one time slot to book.");
            return;
        }
        sessionStorage.setItem('finalBookingSlots', JSON.stringify(state.selectedSlots));
        sessionStorage.setItem('finalBookingHall', JSON.stringify(state.hall));
        window.location.hash = `#final-booking-form-view?id=${state.hall?.id}`;
    }

    function cleanup() {
        if (abortController) abortController.abort();
        removeTooltip();
    }

    async function initialize(hallId) {
        try {
            state.selectedSlots = [];
            sessionStorage.removeItem('finalBookingSlots');
            sessionStorage.removeItem('finalBookingHall');

            const [hallData, availabilityData] = await Promise.all([
                fetchFromAPI(`api/hall/${hallId}`),
                fetchFromAPI(`api/booking/hall/${hallId}`)
            ]);
            
            if (!hallData) {
                throw new Error(`Hall data not found for ID: ${hallId}`);
            }

            const processedHallData = {
                ...hallData,
                location: `${hallData.school?.school_name || ''}${hallData.department?.department_name ? ' - ' + hallData.department.department_name : ''}`.trim() || 'N/A',
                incharge: {
                    name: hallData.department?.incharge_name || hallData.school?.incharge_name || 'N/A',
                    designation: hallData.department ? 'HOD' : (hallData.school ? 'Dean' : 'N/A'),
                    email: hallData.department?.incharge_email || hallData.school?.incharge_email || 'N/A',
                    intercom: hallData.department?.incharge_contact_number || hallData.school?.incharge_contact_number || 'N/A',
                }
            };
            
            // UPDATED: Process the availability data to create a consistent, safe structure.
            const processedAvailabilityData = (availabilityData || []).map(b => ({
                start_time: b.start_time,
                end_time: b.end_time,
                status: b.status || 'APPROVED', // Default to APPROVED if status is missing
                purpose: b.bookingRequest?.purpose || b.purpose || 'N/A',
                class_code: b.bookingRequest?.class_code || b.class_code || null,
                user: {
                    name: b.bookingRequest?.user?.name || b.user?.name || 'N/A',
                    department: b.bookingRequest?.user?.department || b.user?.department || 'N/A'
                }
            }));

            state = {
                hall: processedHallData,
                availabilityData: processedAvailabilityData, // Use the processed data
                selectedSlots: [],
                currentDate: new Date(),
            };
            render();
        } catch (error) {
            console.error('Error initializing hall booking details:', error);
            const viewContainer = document.getElementById('hall-booking-details-view');
            if (viewContainer) {
                viewContainer.innerHTML = `
                    <div class="text-center py-20">
                        <h2 class="text-xl font-bold text-red-400 mb-4">Error Loading Hall Details</h2>
                        <p class="text-slate-400 mb-4">${error.message}</p>
                        <button onclick="window.history.back()" class="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700">Go Back</button>
                    </div>`;
            }
        }
    }

    return { initialize, cleanup };
})();
