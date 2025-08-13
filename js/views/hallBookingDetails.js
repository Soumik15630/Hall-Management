window.HallBookingDetailsView = (function() {

    // --- STATE MANAGEMENT ---
    let state = {
        hall: null,
        availabilityData: [],
        selectedSlots: [], // Format: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
        currentDate: new Date(),
        isDragging: false,
        dragSelectionMode: 'add',
        dragDate: null,
    };
    let abortController;
    let tooltipTimeout;
    const timeSlots = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // --- UTILITY FUNCTIONS FOR IST TIME HANDLING ---
    function getTodayISTString() {
        const now = new Date();
        const year = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' });
        const month = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit' });
        const day = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' });
        return `${year}-${month}-${day}`;
    }

    function getCurrentISTTimeString() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
        return timeString.substring(0, 5);
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
        const text = await response.text();
        if (!text) return null;
        try {
            const parsed = JSON.parse(text);
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
                return false;
            }
        });
    }

    function isSlotAvailable(dateString, time) {
        if (isSlotInPast(dateString, time)) return false;
        return getBookingsForSlot(dateString, time).length === 0;
    }
    
    // --- SELECTION LOGIC ---
    function validateSingleDayBooking(newSlot) {
        if (state.selectedSlots.length === 0) return true;
        const existingDate = state.selectedSlots[0].date;
        return newSlot.date === existingDate;
    }

    function autoFillContiguousSlots(targetSlot) {
        const currentSelectedForDate = state.selectedSlots.filter(slot => slot.date === targetSlot.date);
        if (currentSelectedForDate.length === 0) return;

        const timeIndices = currentSelectedForDate.map(slot => timeSlots.indexOf(slot.time)).sort((a, b) => a - b);
        const minIndex = Math.min(...timeIndices);
        const maxIndex = Math.max(...timeIndices);

        for (let i = minIndex; i <= maxIndex; i++) {
            const timeSlot = timeSlots[i];
            const slotExists = state.selectedSlots.some(slot => slot.date === targetSlot.date && slot.time === timeSlot);
            if (!slotExists && isSlotAvailable(targetSlot.date, timeSlot)) {
                state.selectedSlots.push({ date: targetSlot.date, time: timeSlot });
            }
        }
    }

    // --- TOOLTIP MANAGEMENT ---
    function createTooltip(content, targetElement) {
        removeTooltip();
        const tooltip = document.createElement('div');
        tooltip.id = 'booking-tooltip';
        tooltip.className = 'absolute z-50 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-sm max-w-xs w-max';
        tooltip.innerHTML = content;
        document.body.appendChild(tooltip);

        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let top = targetRect.bottom + window.scrollY + 5;
        let left = targetRect.left + window.scrollX + (targetRect.width / 2) - (tooltipRect.width / 2);

        if (left < 0) left = 5;
        if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 5;
        if (top + tooltipRect.height > window.innerHeight + window.scrollY) top = targetRect.top + window.scrollY - tooltipRect.height - 5;

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    function removeTooltip() {
        const existingTooltip = document.getElementById('booking-tooltip');
        if (existingTooltip) existingTooltip.remove();
    }

    // --- RENDERING LOGIC ---
    function render() {
        if (!state.hall) return;
        renderHallInfo();
        rerenderCalendar();
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
            <style>
                .slot { width: 100%; height: 2.5rem; border-radius: 0.25rem; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; }
                .slot:disabled { cursor: not-allowed; }
                .slot-available-weekday { background-color: rgba(22, 101, 52, 0.8); border-color: rgba(22, 101, 52, 1); }
                .slot-available-weekday:hover { background-color: rgba(21, 128, 61, 0.8); }
                .slot-available-weekend { background-color: rgba(74, 222, 128, 0.6); border-color: rgba(74, 222, 128, 0.8); }
                .slot-available-weekend:hover { background-color: rgba(74, 222, 128, 0.7); }
                .slot-booked { background-color: rgba(220, 38, 38, 0.8); border-color: rgba(220, 38, 38, 1); cursor: pointer !important; }
                .slot-pending { background-color: rgba(234, 179, 8, 0.8); border-color: rgba(234, 179, 8, 1); cursor: pointer !important; }
                .slot-past { background-color: rgba(71, 85, 105, 0.5); border-color: rgba(71, 85, 105, 0.7); opacity: 0.6; }
                .slot-selected { background-color: rgba(59, 130, 246, 1) !important; border-color: rgba(96, 165, 250, 1) !important; transform: scale(1.05); }
            </style>
            <table class="w-full border-collapse">
                <thead>
                    <tr class="sticky top-0 bg-slate-800/50 backdrop-blur-sm">
                        <th class="p-2 w-24"></th>
                        ${Array.from({ length: daysInMonth }, (_, i) => `
                            <th class="text-center p-2">
                                <div class="font-semibold">${i + 1}</div>
                                <div class="text-xs text-slate-400">${dayNames[new Date(year, month, i + 1).getDay()]}</div>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-700/50" id="calendar-body">
                    ${timeSlots.map(time => `
                        <tr class="divide-x divide-slate-700/50">
                            <td class="text-right text-sm text-slate-300 p-2 whitespace-nowrap">${new Date('1970-01-01T' + time).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', hour12: true})}</td>
                            ${Array.from({ length: daysInMonth }, (_, i) => {
                                const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                                const { classes, status, isClickable } = getSlotStatus(dateString, time);
                                return `
                                    <td class="p-1">
                                        <button class="slot ${classes}" 
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
            return { classes: 'slot-selected', status: 'selected', isClickable: true };
        }
        if (isSlotInPast(dateString, time)) {
            return { classes: 'slot-past', status: 'past', isClickable: false };
        }
        const bookings = getBookingsForSlot(dateString, time);
        if (bookings.length > 0) {
            if (bookings.some(b => b.status === 'APPROVED')) return { classes: 'slot-booked', status: 'booked', isClickable: true };
            if (bookings.some(b => b.status === 'PENDING')) return { classes: 'slot-pending', status: 'pending', isClickable: true };
            return { classes: 'slot-booked', status: 'booked', isClickable: true };
        }
        const dayOfWeek = new Date(dateString + 'T00:00:00').getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return { classes: 'slot-available-weekend', status: 'available-weekend', isClickable: true };
        }
        return { classes: 'slot-available-weekday', status: 'available', isClickable: true };
    }
    
    function updateCalendarUI() {
        document.querySelectorAll('#calendar-body .slot').forEach(slotEl => {
            const { date, time } = slotEl.dataset;
            const { classes, status, isClickable } = getSlotStatus(date, time);
            slotEl.className = `slot ${classes}`;
            slotEl.dataset.status = status;
            if (isClickable) {
                slotEl.removeAttribute('disabled');
            } else {
                slotEl.setAttribute('disabled', '');
            }
        });
    }

    function rerenderCalendar() {
        const calendarGridContainer = document.getElementById('booking-calendar-grid');
        if (calendarGridContainer) {
            calendarGridContainer.innerHTML = renderCalendarGrid();
            // No need to set up listeners here anymore, they are delegated from the parent.
        }
    }

    function showSlotTooltip(slotEl) {
        const { date, time, status } = slotEl.dataset;
        const bookings = getBookingsForSlot(date, time);
        if (bookings.length === 0) return;
        const booking = bookings[0];
        let content;
        if (status === 'booked') {
            content = `<div class="font-bold text-red-400 mb-2">Slot Booked</div>
                       <div class="space-y-1">
                           <div><span class="text-slate-400">By:</span> <span class="text-white">${booking.user.name}</span></div>
                           <div><span class="text-slate-400">Dept:</span> <span class="text-white">${booking.user.department}</span></div>
                           <div><span class="text-slate-400">Purpose:</span> <span class="text-white">${booking.purpose}</span></div>
                       </div>`;
        } else if (status === 'pending') {
            content = `<div class="font-bold text-yellow-400 mb-2">Pending Requests (${bookings.length})</div>
                       <ul class="space-y-2 list-disc list-inside">
                           ${bookings.map(b => `<li><span class="text-white">${b.user.name}</span> <span class="text-slate-400">(${b.user.department})</span></li>`).join('')}
                       </ul>
                       <div class="text-xs text-slate-500 mt-2">This slot can still be selected.</div>`;
        }
        if (content) createTooltip(content, slotEl);
    }

    function handleDragStart(e) {
        const slotEl = e.target.closest('button.slot');
        if (!slotEl || slotEl.disabled) return;
        e.preventDefault();

        const { date, time, status } = slotEl.dataset;
        if (status === 'booked' || status === 'pending') {
            showSlotTooltip(slotEl);
            return;
        }

        if (!validateSingleDayBooking({ date, time })) {
            const existingDate = state.selectedSlots[0].date;
            showNotification(`You can only book slots for one day. Please clear your selection for ${new Date(existingDate+'T00:00:00').toLocaleDateString()} to choose a different date.`);
            return;
        }

        state.isDragging = true;
        state.dragDate = date;
        const isSelected = slotEl.classList.contains('slot-selected');
        state.dragSelectionMode = isSelected ? 'remove' : 'add';

        const existingIndex = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        if (state.dragSelectionMode === 'add' && existingIndex === -1) {
            state.selectedSlots.push({ date, time });
        } else if (state.dragSelectionMode === 'remove' && existingIndex > -1) {
            state.selectedSlots.splice(existingIndex, 1);
        }
        updateCalendarUI();
    }

    function handleDragOver(e) {
        if (!state.isDragging) return;
        const slotEl = e.target.closest('button.slot');
        if (slotEl && !slotEl.disabled && slotEl.dataset.date === state.dragDate) {
            const { date, time } = slotEl.dataset;
            const isSelected = state.selectedSlots.some(s => s.date === date && s.time === time);
            if (state.dragSelectionMode === 'add' && !isSelected) {
                state.selectedSlots.push({ date, time });
                updateCalendarUI();
            } else if (state.dragSelectionMode === 'remove' && isSelected) {
                const index = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
                if (index > -1) {
                    state.selectedSlots.splice(index, 1);
                    updateCalendarUI();
                }
            }
        }
    }

    function handleDragStop() {
        if (!state.isDragging) return;
        state.isDragging = false;
        if (state.dragSelectionMode === 'add' && state.selectedSlots.length > 0) {
            const lastSelected = state.selectedSlots[state.selectedSlots.length - 1];
            autoFillContiguousSlots(lastSelected);
        }
        updateCalendarUI();
    }
    
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg animate-pulse';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }

    function handleBookHall() {
        if (state.selectedSlots.length === 0) {
            showNotification("Please select at least one time slot to book.");
            return;
        }
        sessionStorage.setItem('finalBookingSlots', JSON.stringify(state.selectedSlots));
        sessionStorage.setItem('finalBookingHall', JSON.stringify(state.hall));
        sessionStorage.setItem('finalBookingAvailability', JSON.stringify(state.availabilityData));
        window.location.hash = `#final-booking-form-view?id=${state.hall?.id || state.hall?.unique_id}`;
    }

    function cleanup() {
        if (abortController) {
            abortController.abort();
        }
        removeTooltip();
    }

    // --- CONSOLIDATED EVENT HANDLER SETUP ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const viewContainer = document.getElementById('hall-booking-details-view');
        if (!viewContainer) return;

        // Delegated click listener for all buttons
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
            }
        }, { signal });

        // Listeners for drag-to-select functionality
        viewContainer.addEventListener('mousedown', handleDragStart, { signal });
        document.addEventListener('mouseover', handleDragOver, { signal });
        document.addEventListener('mouseup', handleDragStop, { signal });

        // Delegated tooltip listeners
        viewContainer.addEventListener('mouseover', e => {
            const slot = e.target.closest('button.slot[data-status="booked"], button.slot[data-status="pending"]');
            if (slot) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = setTimeout(() => showSlotTooltip(slot), 200);
            }
        }, { signal });
        viewContainer.addEventListener('mouseout', e => {
            const slot = e.target.closest('button.slot[data-status="booked"], button.slot[data-status="pending"]');
            if (slot) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = setTimeout(removeTooltip, 300);
            }
        }, { signal });
        
        document.body.addEventListener('mouseover', e => { if (e.target.closest('#booking-tooltip')) clearTimeout(tooltipTimeout); }, { signal });
        document.body.addEventListener('mouseout', e => { if (e.target.closest('#booking-tooltip')) removeTooltip(); }, { signal });
    }

    async function initialize(hallId) {
        try {
            state.selectedSlots = [];
            sessionStorage.removeItem('finalBookingSlots');
            sessionStorage.removeItem('finalBookingHall');
            sessionStorage.removeItem('finalBookingAvailability');

            const [hallData, availabilityData] = await Promise.all([
                fetchFromAPI(`api/hall/${hallId}`),
                fetchFromAPI(`api/booking/hall/${hallId}`)
            ]);
            
            if (!hallData) throw new Error(`Hall data not found for ID: ${hallId}`);

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
            
            const processedAvailabilityData = (availabilityData || []).map(b => ({
                start_time: b.start_time,
                end_time: b.end_time,
                status: b.status || 'APPROVED',
                purpose: b.bookingRequest?.purpose || b.purpose || 'N/A',
                class_code: b.bookingRequest?.class_code || b.class_code || null,
                user: {
                    name: b.bookingRequest?.user?.name || b.user?.name || 'N/A',
                    department: b.bookingRequest?.user?.department || b.user?.department || 'N/A'
                }
            }));

            state = {
                ...state,
                hall: processedHallData,
                availabilityData: processedAvailabilityData,
                currentDate: new Date(),
            };
            
            render();
            setupEventHandlers();

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
