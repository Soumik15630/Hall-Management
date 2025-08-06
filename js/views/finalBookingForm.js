// final/js/views/finalBookingForm.js

window.FinalBookingFormView = (function() {
    
    // --- STATE MANAGEMENT ---
    let state = {
        hall: null,
        availabilityData: [],
        selectedSlots: [], // Single source of truth: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
        currentDate: new Date(),
        bookingType: 'INDIVIDUAL',
        purpose: '',
        classCode: '',
        selectedDays: [], // For semester booking
        
        // Drag-to-select state
        isDragging: false,
        dragSelectionMode: 'add',
        dragDate: null,
    };
    let abortController;
    const timeSlots = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];


    // --- RENDERING ---
    // This function now renders the entire combined view: calendar + form
    function render() {
        const container = document.getElementById('final-booking-form-content'); 
        if (!container) {
            console.error('Final booking form container not found.');
            return;
        }

        // Main HTML structure, combining calendar and form
        container.innerHTML = `
            <div id="final-booking-form-container" class="container mx-auto max-w-7xl">
                <div class="space-y-8">
                    
                    <section id="calendar-section" class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                        <!-- Calendar will be rendered here by renderCalendar() -->
                    </section>

                    <form id="bookingForm" class="space-y-8">
                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Booking Details</h3>
                            
                            <div class="mb-6">
                                <label class="block text-slate-300 text-sm font-medium mb-2">BOOKING TYPE</label>
                                <div class="grid grid-cols-2 gap-4">
                                    <button type="button" id="booking-type-individual" class="booking-type-btn w-full py-3 px-4 text-center rounded-md text-sm font-semibold transition-all duration-200 bg-slate-700 text-slate-300 hover:bg-slate-600">Individual</button>
                                    <button type="button" id="booking-type-semester" class="booking-type-btn w-full py-3 px-4 text-center rounded-md text-sm font-semibold transition-all duration-200 bg-slate-700 text-slate-300 hover:bg-slate-600">Semester</button>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label for="start_date" class="block text-slate-300 text-sm font-medium mb-2">FROM DATE</label>
                                    <input type="date" id="start_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-white" required>
                                </div>
                                <div>
                                    <label for="end_date" class="block text-slate-300 text-sm font-medium mb-2">TO DATE</label>
                                    <input type="date" id="end_date" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-white" required>
                                </div>
                            </div>

                            <div class="mb-6">
                                <label class="block text-slate-300 text-sm font-medium mb-2">CHOOSE SLOT(S)</label>
                                <div class="border border-slate-700 rounded-lg p-4">
                                    <div id="time-slot-buttons" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                        ${timeSlots.map(time => `<button type="button" data-time="${time}" class="time-slot-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">${formatTimeForDisplay(time)}</button>`).join('')}
                                    </div>
                                </div>
                            </div>


                            <div id="semester-days-container" class="mb-6 hidden">
                                <label class="block text-slate-300 text-sm font-medium mb-2">SELECT DAYS OF THE WEEK</label>
                                 <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                                    <button type="button" data-day="SUNDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Sun</button>
                                    <button type="button" data-day="MONDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Mon</button>
                                    <button type="button" data-day="TUESDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Tue</button>
                                    <button type="button" data-day="WEDNESDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Wed</button>
                                    <button type="button" data-day="THURSDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Thu</button>
                                    <button type="button" data-day="FRIDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Fri</button>
                                    <button type="button" data-day="SATURDAY" class="day-btn border border-slate-600 bg-slate-800 p-2 rounded text-slate-300 hover:bg-slate-700">Sat</button>
                                 </div>
                            </div>
                        </section>

                        <section class="bg-slate-900/70 p-4 sm:p-6 rounded-lg shadow-md border border-slate-700">
                            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Purpose of Booking</h3>
                            <div>
                                <label for="purpose" class="block text-slate-300 text-sm font-medium mb-2">PURPOSE / EVENT NAME</label>
                                <textarea id="purpose" placeholder="e.g., Department Seminar, Guest Lecture on AI" rows="3" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-white" required></textarea>
                            </div>
                            <div class="mt-6">
                                <label for="class_code" class="block text-slate-300 text-sm font-medium mb-2">CLASS CODE (OPTIONAL)</label>
                                <input type="text" id="class_code" placeholder="e.g., CS-501" class="block w-full p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-white">
                            </div>
                        </section>

                        <div class="flex justify-end space-x-4 pt-6">
                            <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors duration-300">SUBMIT REQUEST</button>
                            <button type="button" id="reset-btn" class="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-md shadow-lg transition-colors duration-300">CLEAR</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        updateUI();
        setupEventHandlers();
    }

    // New function to render the calendar, adapted from book.html
    function renderCalendar() {
        const monthName = state.currentDate.toLocaleString('default', { month: 'long' });
        const year = state.currentDate.getFullYear();
        
        const daysInMonth = new Date(year, state.currentDate.getMonth() + 1, 0).getDate();
        let dayHeaders = '';
        let slotRows = '';

        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(year, state.currentDate.getMonth(), i);
            const dayName = dateObj.toLocaleString('default', { weekday: 'short' });
            const isSunday = dayName === 'Sun' ? 'date-header-day' : '';
            dayHeaders += `
                <div class="text-center">
                    <div class="text-sm font-semibold text-slate-300 ${isSunday}">${i}</div>
                    <div class="text-xs text-slate-400 ${isSunday}">${dayName}</div>
                </div>`;
        }
        
        timeSlots.forEach(time => {
            let dayCells = '';
            for (let i = 1; i <= daysInMonth; i++) {
                const dateString = `${year}-${String(state.currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const classes = getSlotClasses(dateString, time);
                dayCells += `<button type="button" class="slot ${classes}" data-date="${dateString}" data-time="${time}"></button>`;
            }
            slotRows += `<div class="calendar-body">${dayCells}</div>`;
        });

        return `
            <h3 class="text-xl font-semibold text-white mb-4 border-b border-slate-700 pb-2">Hall Availability</h3>
            <div class="flex justify-between items-center mb-4">
                <button id="prev-month-btn" class="p-2 rounded-full hover:bg-slate-700 transition text-slate-300"><i class="fas fa-chevron-left"></i></button>
                <h4 class="text-lg font-bold text-white">${monthName} ${year}</h4>
                <button id="next-month-btn" class="p-2 rounded-full hover:bg-slate-700 transition text-slate-300"><i class="fas fa-chevron-right"></i></button>
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
            <div class="flex justify-center items-center flex-wrap gap-x-4 gap-y-2 mt-4 text-sm text-slate-300">
                <div class="flex items-center"><span class="h-4 w-4 rounded-sm mr-2 slot-available"></span> Available</div>
                <div class="flex items-center"><span class="h-4 w-4 rounded-sm mr-2 slot-pending"></span> Pending</div>
                <div class="flex items-center"><span class="h-4 w-4 rounded-sm mr-2 slot-booked"></span> Booked</div>
                <div class="flex items-center"><span class="h-4 w-4 rounded-sm mr-2 slot-past"></span> Past</div>
                <div class="flex items-center"><span class="h-4 w-4 rounded-sm mr-2 slot-selected"></span> Selected</div>
            </div>
        `;
    }
    
    // This function updates the dynamic parts of the UI based on the current state
    function updateUI() {
        const calendarContainer = document.getElementById('calendar-section');
        if (calendarContainer) {
            calendarContainer.innerHTML = renderCalendar();
        }
        syncFormWithState(); // Call the dedicated form sync function
    }

    // NEW: Lightweight function to sync only form elements without re-rendering the calendar
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
        
        document.getElementById('booking-type-individual')?.classList.toggle('active', state.bookingType === 'INDIVIDUAL');
        document.getElementById('booking-type-semester')?.classList.toggle('active', state.bookingType === 'SEMESTER');
        document.getElementById('semester-days-container')?.classList.toggle('hidden', state.bookingType !== 'SEMESTER');

        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.classList.toggle('active', state.selectedDays.includes(btn.dataset.day));
        });

        // Sync time slot buttons with selected slots
        const selectedDate = startDateInput ? startDateInput.value : new Date().toISOString().split('T')[0];
        const selectedTimesForDate = state.selectedSlots
            .filter(s => s.date === selectedDate)
            .map(s => s.time);
        document.querySelectorAll('.time-slot-btn').forEach(btn => {
            btn.classList.toggle('active', selectedTimesForDate.includes(btn.dataset.time));
        });


        const purposeTextarea = document.getElementById('purpose');
        if(purposeTextarea) purposeTextarea.value = state.purpose;
        
        const classCodeInput = document.getElementById('class_code');
        if(classCodeInput) classCodeInput.value = state.classCode;
    }


    // --- LOGIC & HELPERS (Incorporated from book.html) ---
    function getSlotClasses(dateString, time) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const slotDate = new Date(dateString + "T00:00:00");

        if (state.selectedSlots.some(s => s.date === dateString && s.time === time)) {
            return 'slot-selected';
        }
        if (slotDate < today) return 'slot-past';
        
        // This part needs to be adapted if availability data format differs
        const booking = state.availabilityData.find(b => {
             const bookingDate = new Date(b.start_date).toISOString().split('T')[0];
             const bookingTime = new Date(b.start_date).toTimeString().substring(0,5);
             return bookingDate === dateString && bookingTime === time;
        });

        if (booking) {
            return booking.status === 'APPROVED' ? 'slot-booked' : 'slot-pending';
        }
        return 'slot-available';
    }

    function formatTimeForDisplay(time) {
        const [hour, minute] = time.split(':');
        const h = parseInt(hour);
        const suffix = h >= 12 ? 'pm' : 'am';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${String(displayHour).padStart(2, '0')}:${minute}${suffix}`;
    }

    function resetForm() {
        const hall = state.hall;
        const availabilityData = state.availabilityData;
        state = {
            hall: hall,
            availabilityData: availabilityData,
            selectedSlots: [],
            currentDate: new Date(),
            bookingType: 'INDIVIDUAL',
            purpose: '',
            classCode: '',
            selectedDays: [],
            isDragging: false,
            dragSelectionMode: 'add',
            dragDate: null,
        };
        render(); // Re-render the entire view with the cleared state
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        const container = document.getElementById('final-booking-form-container');
        if (!container) return;

        container.addEventListener('click', handleContainerClick, { signal });
        container.addEventListener('change', handleContainerChange, { signal });
        container.addEventListener('input', handleContainerInput, { signal });
        
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

        if (target.id === 'prev-month-btn') {
            state.currentDate.setMonth(state.currentDate.getMonth() - 1);
            updateUI();
        } else if (target.id === 'next-month-btn') {
            state.currentDate.setMonth(state.currentDate.getMonth() + 1);
            updateUI();
        } else if (target.id === 'booking-type-individual') {
            state.bookingType = 'INDIVIDUAL';
            updateUI();
        } else if (target.id === 'booking-type-semester') {
            state.bookingType = 'SEMESTER';
            updateUI();
        } else if (target.matches('.day-btn')) {
            const day = target.dataset.day;
            const index = state.selectedDays.indexOf(day);
            if (index > -1) {
                state.selectedDays.splice(index, 1);
            } else {
                state.selectedDays.push(day);
            }
            target.classList.toggle('active');
        } else if (target.matches('.time-slot-btn')) {
            const time = target.dataset.time;
            const date = document.getElementById('start_date').value;

            state.selectedSlots = state.selectedSlots.filter(s => s.date === date);

            const index = state.selectedSlots.findIndex(s => s.time === time);

            if (index > -1) {
                state.selectedSlots.splice(index, 1);
            } else {
                state.selectedSlots.push({ date, time });
            }

            const slotsForDate = state.selectedSlots.filter(s => s.date === date);
            if (slotsForDate.length > 1) {
                const timeIndices = slotsForDate.map(s => timeSlots.indexOf(s.time)).sort((a,b) => a - b);
                const min = timeIndices[0];
                const max = timeIndices[timeIndices.length - 1];
                
                const newSlotsForDate = [];
                for (let i = min; i <= max; i++) {
                    const intermediateTime = timeSlots[i];
                    newSlotsForDate.push({ date: date, time: intermediateTime });
                }
                state.selectedSlots = state.selectedSlots.filter(s => s.date !== date).concat(newSlotsForDate);
            }
            
            updateUI();
        } else if (target.id === 'reset-btn') {
            resetForm();
        } else if (target.closest('form')?.id === 'bookingForm' && target.type === 'submit') {
            e.preventDefault();
            submitBooking();
        }
    }

    function handleContainerChange(e) {
        const target = e.target;
        if (target.id === 'start_date') {
            const newDate = target.value;
            const selectedTimes = state.selectedSlots.map(s => s.time);
            state.selectedSlots = selectedTimes.map(time => ({ date: newDate, time }));
            document.getElementById('end_date').value = newDate;
            updateUI();
        }
    }

    function handleContainerInput(e) {
        const target = e.target;
        if (target.id === 'purpose') state.purpose = target.value;
        else if (target.id === 'class_code') state.classCode = target.value;
    }

    function handleDragStart(e) {
        const slotEl = e.target.closest('.slot');
        if (!slotEl) return;
        e.preventDefault();

        state.isDragging = true;
        const classes = slotEl.className;
        if (classes.includes('slot-booked') || classes.includes('slot-pending') || classes.includes('slot-past')) {
            state.isDragging = false;
            return;
        }
        
        const date = slotEl.dataset.date;
        if (state.dragDate !== date) {
            state.selectedSlots = [];
            state.dragDate = date;
        }

        state.dragSelectionMode = classes.includes('slot-selected') ? 'remove' : 'add';
        
        applyDragSelection(slotEl);
        syncFormWithState(); // Real-time update
    }

    function handleDragOver(e) {
        if (!state.isDragging) return;
        const slotEl = e.target.closest('.slot');
        if (slotEl && slotEl.dataset.date === state.dragDate) {
            applyDragSelection(slotEl);
            syncFormWithState(); // Real-time update
        }
    }

    function handleDragStop() {
        if (state.isDragging) {
            state.isDragging = false;
            
            const slotsForDate = state.selectedSlots.filter(s => s.date === state.dragDate);
            if (slotsForDate.length > 1) {
                const timeIndices = slotsForDate.map(s => timeSlots.indexOf(s.time)).sort((a,b) => a - b);
                const min = timeIndices[0];
                const max = timeIndices[timeIndices.length - 1];
                for (let i = min + 1; i < max; i++) {
                    const time = timeSlots[i];
                    if (!slotsForDate.some(s => s.time === time)) {
                        state.selectedSlots.push({ date: state.dragDate, time });
                    }
                }
            }

            updateUI(); 
        }
    }

    function applyDragSelection(slotEl) {
        const date = slotEl.dataset.date;
        const time = slotEl.dataset.time;

        if (date !== state.dragDate) return;

        const index = state.selectedSlots.findIndex(s => s.date === date && s.time === time);

        if (state.dragSelectionMode === 'add' && index === -1) {
            state.selectedSlots.push({ date, time });
        } else if (state.dragSelectionMode === 'remove' && index > -1) {
            state.selectedSlots.splice(index, 1);
        }
        
        slotEl.className = 'slot ' + getSlotClasses(date, time);
    }

    async function submitBooking() {
        if (!state.hall) {
            alert('Hall details are not loaded. Cannot submit booking.');
            return;
        }
        if (state.selectedSlots.length === 0) {
            alert('Please select at least one time slot from the calendar.');
            return;
        }
        if (!state.purpose.trim()) {
            alert('Please provide a purpose for the booking.');
            return;
        }

        const bookingRequests = state.selectedSlots.map(slot => {
            const startDate = new Date(`${slot.date}T${slot.time}:00`);
            const endDate = new Date(startDate.getTime() + 59 * 60 * 1000); 

            return {
                hall_id: state.hall.id,
                purpose: state.purpose.trim(),
                class_code: state.classCode.trim() || undefined,
                booking_type: state.bookingType,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                start_time: slot.time,
                end_time: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
            };
        });

        console.log('Submitting Payloads:', bookingRequests);
        
        try {
            await AppData.addMultipleIndividualBookings(bookingRequests);
            alert(`Successfully submitted ${bookingRequests.length} booking request(s)!`);
            resetForm();
        } catch (error) {
            console.error("Booking failed:", error);
            alert(`Booking failed: ${error.message}`);
        }
    }

    // --- INITIALIZATION ---
    async function initialize(hallIdFromUrl) {
        let hallData = null;
        let hallId = hallIdFromUrl;

        const hallFromSession = sessionStorage.getItem('finalBookingHall');
        if (hallFromSession) {
            hallData = JSON.parse(hallFromSession);
            hallId = hallData.id; 
        }

        if (!hallData && hallId) {
            const allHalls = await AppData.fetchBookingHalls();
            const flattenedHalls = Object.values(allHalls).flatMap(group => Array.isArray(group) ? group : Object.values(group).flat(Infinity));
            hallData = flattenedHalls.find(h => h.id === hallId);
        }

        state.hall = hallData;

        if (state.hall) {
            try {
                state.availabilityData = await AppData.fetchHallAvailability(hallId);
                render();
            } catch(error) {
                console.error("Failed to fetch availability:", error);
                const container = document.getElementById('final-booking-form-content');
                if(container) container.innerHTML = `<div class="text-center py-10"><h2 class="text-xl font-bold text-red-400">Could not load hall availability.</h2></div>`;
            }
        } else {
            const container = document.getElementById('final-booking-form-content');
            if(container) container.innerHTML = `<div class="text-center py-10"><h2 class="text-xl font-bold text-red-400">Hall Not Found</h2><p class="text-slate-400">Please go back and select a hall.</p></div>`;
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
