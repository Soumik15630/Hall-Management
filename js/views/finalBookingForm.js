// final/js/views/finalBookingForm.js

window.FinalBookingFormView = (function() {
    
    // --- STATE MANAGEMENT ---
    let state = {
        hall: null,
        availabilityData: [],
        selectedSlots: [], // Format: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
        currentDate: new Date(),
        bookingType: 'INDIVIDUAL',
        purpose: '',
        classCode: '',
        isDragging: false,
        dragSelectionMode: 'add',
        dragDate: null,
    };
    let abortController;
    const timeSlots = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];

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

    async function fetchAllHalls() {
        const rawHalls = await fetchFromAPI(AppConfig.endpoints.allHall);
        // A simplified mapping for this view's purpose
        return rawHalls.map(hall => ({ id: hall.unique_id, name: hall.name, ...hall }));
    }

    async function fetchHallAvailability(hallId) {
        // This assumes an endpoint exists to get availability for a specific hall
        // return await fetchFromAPI(`${AppConfig.endpoints.availability}/${hallId}`);
        // Using placeholder as the endpoint is not defined in the provided config
        return Promise.resolve([]);
    }

    async function addIndividualBooking(bookingDetails) {
        return await fetchFromAPI(AppConfig.endpoints.bookingRequest, { method: 'POST', body: JSON.stringify(bookingDetails) });
    }
    
    async function addMultipleIndividualBookings(bookingRequests) {
        const bookingPromises = bookingRequests.map(request => addIndividualBooking(request));
        return await Promise.all(bookingPromises);
    }

    // --- RENDERING ---
    function render() {
        const container = document.getElementById('final-booking-form-content'); 
        if (!container) return;

        container.innerHTML = `
            <div id="final-booking-form-container" class="container mx-auto max-w-7xl">
                <div class="space-y-8">
                    <section id="calendar-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700"></section>
                    <form id="bookingForm" class="space-y-8">
                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Booking Details</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label for="start_date" class="block text-slate-300 text-sm font-medium mb-2">FROM DATE</label>
                                    <input type="date" id="start_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white" required>
                                </div>
                                <div>
                                    <label for="end_date" class="block text-slate-300 text-sm font-medium mb-2">TO DATE</label>
                                    <input type="date" id="end_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white" required>
                                </div>
                            </div>
                        </section>
                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Purpose of Booking</h3>
                            <div>
                                <label for="purpose" class="block text-slate-300 text-sm font-medium mb-2">PURPOSE / EVENT NAME</label>
                                <textarea id="purpose" placeholder="e.g., Department Seminar, Guest Lecture on AI" rows="3" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white" required></textarea>
                            </div>
                            <div class="mt-6">
                                <label for="class_code" class="block text-slate-300 text-sm font-medium mb-2">CLASS CODE (OPTIONAL)</label>
                                <input type="text" id="class_code" placeholder="e.g., CS-501" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white">
                            </div>
                        </section>
                        <div class="flex justify-end space-x-4 pt-6">
                            <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-md shadow-lg">SUBMIT REQUEST</button>
                            <button type="button" id="reset-btn" class="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-md shadow-lg">CLEAR</button>
                        </div>
                    </form>
                </div>
            </div>`;
        
        updateUI();
        setupEventHandlers();
    }

    function renderCalendar() {
        const monthName = state.currentDate.toLocaleString('default', { month: 'long' });
        const year = state.currentDate.getFullYear();
        const daysInMonth = new Date(year, state.currentDate.getMonth() + 1, 0).getDate();
        
        let dayHeaders = Array.from({ length: daysInMonth }, (_, i) => {
            const dateObj = new Date(year, state.currentDate.getMonth(), i + 1);
            const dayName = dateObj.toLocaleString('default', { weekday: 'short' });
            return `<div class="text-center"><div class="text-sm font-semibold text-slate-300">${i + 1}</div><div class="text-xs text-slate-400">${dayName}</div></div>`;
        }).join('');

        let slotRows = timeSlots.map(time => {
            let dayCells = Array.from({ length: daysInMonth }, (_, i) => {
                const dateString = `${year}-${String(state.currentDate.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                const classes = getSlotClasses(dateString, time);
                return `<button type="button" class="slot ${classes}" data-date="${dateString}" data-time="${time}"></button>`;
            }).join('');
            return `<div class="calendar-body">${dayCells}</div>`;
        }).join('');

        return `
            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Hall Availability: ${state.hall?.name || ''}</h3>
            <div class="flex justify-between items-center mb-4">
                <button id="prev-month-btn" class="p-2 rounded-full hover:bg-slate-700"><i class="fas fa-chevron-left"></i></button>
                <h4 class="text-lg font-bold text-white">${monthName} ${year}</h4>
                <button id="next-month-btn" class="p-2 rounded-full hover:bg-slate-700"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="overflow-x-auto pb-4">
                <div class="calendar-grid min-w-[1200px]">
                    <div class="grid grid-rows-8 gap-1 pr-2">
                        ${timeSlots.map(time => `<div class="text-xs text-right text-slate-400 h-8 flex items-center justify-end">${formatTimeForDisplay(time)}</div>`).join('')}
                    </div>
                    <div class="grid grid-cols-1">
                        <div class="calendar-header">${dayHeaders}</div>
                        ${slotRows}
                    </div>
                </div>
            </div>
            <div class="flex justify-center flex-wrap gap-x-4 gap-y-2 mt-4 text-sm text-slate-300">
                <span class="flex items-center"><span class="h-4 w-4 mr-2 slot-available"></span>Available</span>
                <span class="flex items-center"><span class="h-4 w-4 mr-2 slot-pending"></span>Pending</span>
                <span class="flex items-center"><span class="h-4 w-4 mr-2 slot-booked"></span>Booked</span>
                <span class="flex items-center"><span class="h-4 w-4 mr-2 slot-past"></span>Past</span>
                <span class="flex items-center"><span class="h-4 w-4 mr-2 slot-selected"></span>Selected</span>
            </div>`;
    }
    
    function updateUI() {
        const calendarContainer = document.getElementById('calendar-section');
        if (calendarContainer) calendarContainer.innerHTML = renderCalendar();
        syncFormWithState();
    }

    function syncFormWithState() {
        const startDateInput = document.getElementById('start_date');
        const endDateInput = document.getElementById('end_date');
        if (state.selectedSlots.length > 0) {
            const dates = [...new Set(state.selectedSlots.map(s => s.date))].sort();
            if(startDateInput) startDateInput.value = dates[0];
            if(endDateInput) endDateInput.value = dates[dates.length - 1];
        } else {
            const today = new Date().toISOString().split('T')[0];
            if(startDateInput) startDateInput.value = today;
            if(endDateInput) endDateInput.value = today;
        }
        document.getElementById('purpose').value = state.purpose;
        document.getElementById('class_code').value = state.classCode;
    }

    // --- LOGIC & HELPERS ---
    function getSlotClasses(dateString, time) {
        const slotDate = new Date(dateString + "T00:00:00");
        const today = new Date(); today.setHours(0, 0, 0, 0);

        if (state.selectedSlots.some(s => s.date === dateString && s.time === time)) return 'slot-selected';
        if (slotDate < today) return 'slot-past';
        
        const booking = state.availabilityData.find(b => {
             const bookingDate = new Date(b.start_date).toISOString().split('T')[0];
             const bookingTime = new Date(b.start_date).toTimeString().substring(0,5);
             return bookingDate === dateString && bookingTime === time;
        });
        if (booking) return booking.status === 'APPROVED' ? 'slot-booked' : 'slot-pending';
        return 'slot-available';
    }

    function formatTimeForDisplay(time) {
        const [hour, minute] = time.split(':');
        return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    function resetForm() {
        const { hall, availabilityData } = state;
        state = { hall, availabilityData, selectedSlots: [], currentDate: new Date(), bookingType: 'INDIVIDUAL', purpose: '', classCode: '', isDragging: false, dragSelectionMode: 'add', dragDate: null };
        render();
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const container = document.getElementById('final-booking-form-container');
        if (!container) return;
        container.addEventListener('click', handleContainerClick, { signal });
        container.addEventListener('input', e => {
            if (e.target.id === 'purpose') state.purpose = e.target.value;
            if (e.target.id === 'class_code') state.classCode = e.target.value;
        }, { signal });
        const calendarSection = container.querySelector('#calendar-section');
        if (calendarSection) {
            calendarSection.addEventListener('mousedown', handleDragStart, { signal });
            calendarSection.addEventListener('mouseover', handleDragOver, { signal });
        }
        window.addEventListener('mouseup', handleDragStop, { signal });
    }

    function handleContainerClick(e) {
        const target = e.target.closest('button');
        if (!target) return;
        if (target.id === 'prev-month-btn') { state.currentDate.setMonth(state.currentDate.getMonth() - 1); updateUI(); } 
        else if (target.id === 'next-month-btn') { state.currentDate.setMonth(state.currentDate.getMonth() + 1); updateUI(); }
        else if (target.id === 'reset-btn') resetForm();
        else if (target.closest('form')?.id === 'bookingForm' && target.type === 'submit') { e.preventDefault(); submitBooking(); }
    }

    function handleDragStart(e) {
        const slotEl = e.target.closest('.slot');
        if (!slotEl || slotEl.className.includes('booked') || slotEl.className.includes('pending') || slotEl.className.includes('past')) {
            state.isDragging = false;
            return;
        }
        e.preventDefault();
        state.isDragging = true;
        state.dragDate = slotEl.dataset.date;
        state.dragSelectionMode = slotEl.className.includes('selected') ? 'remove' : 'add';
        applyDragSelection(slotEl);
    }

    function handleDragOver(e) {
        if (!state.isDragging) return;
        const slotEl = e.target.closest('.slot');
        if (slotEl && slotEl.dataset.date === state.dragDate) applyDragSelection(slotEl);
    }

    function handleDragStop() {
        if (state.isDragging) {
            state.isDragging = false;
            updateUI(); 
        }
    }

    function applyDragSelection(slotEl) {
        const { date, time } = slotEl.dataset;
        const index = state.selectedSlots.findIndex(s => s.date === date && s.time === time);
        if (state.dragSelectionMode === 'add' && index === -1) state.selectedSlots.push({ date, time });
        else if (state.dragSelectionMode === 'remove' && index > -1) state.selectedSlots.splice(index, 1);
        slotEl.className = 'slot ' + getSlotClasses(date, time);
        syncFormWithState();
    }

    async function submitBooking() {
        if (!state.hall || state.selectedSlots.length === 0 || !state.purpose.trim()) {
            alert('Please select at least one slot and provide a purpose.');
            return;
        }
        const bookingRequests = state.selectedSlots.map(slot => {
            const startDate = new Date(`${slot.date}T${slot.time}:00`);
            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Corrected to 60 minutes
            return {
                hall_id: state.hall.id,
                purpose: state.purpose.trim(),
                class_code: state.classCode.trim() || undefined,
                booking_type: state.bookingType,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
            };
        });
        try {
            await addMultipleIndividualBookings(bookingRequests);
            alert(`Successfully submitted ${bookingRequests.length} booking request(s)!`);
            resetForm();
        } catch (error) {
            alert(`Booking failed: ${error.message}`);
        }
    }

    // --- INITIALIZATION ---
    async function initialize(hallIdFromUrl) {
        let hallData = JSON.parse(sessionStorage.getItem('finalBookingHall'));
        let hallId = hallIdFromUrl || hallData?.id;
        if (!hallId) {
            document.getElementById('final-booking-form-content').innerHTML = `<div class="text-center py-10"><h2 class="text-xl font-bold text-red-400">Hall Not Found</h2><p class="text-slate-400">Please go back and select a hall.</p></div>`;
            return;
        }
        if (!hallData) {
            const allHalls = await fetchAllHalls();
            hallData = allHalls.find(h => h.id === hallId);
        }
        state.hall = hallData;
        if (state.hall) {
            try {
                state.availabilityData = await fetchHallAvailability(hallId);
                render();
            } catch(error) {
                document.getElementById('final-booking-form-content').innerHTML = `<div class="text-center py-10"><h2 class="text-xl font-bold text-red-400">Could not load hall availability.</h2></div>`;
            }
        }
    }
    
    function cleanup() {
        if (abortController) abortController.abort();
        window.removeEventListener('mouseup', handleDragStop);
        sessionStorage.removeItem('finalBookingHall');
        sessionStorage.removeItem('finalBookingSlots');
        sessionStorage.removeItem('finalBookingAvailability');
    }

    return { initialize, cleanup };
})();