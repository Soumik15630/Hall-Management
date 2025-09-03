// HallBooking/js/views/semesterBooking.js

// Semester Booking View Module
window.SemesterBookingView = (function() {
    // --- CONSTANTS (Unchanged) ---
    const PERIOD_TIMES = {
        1: '09:30-10:30', 2: '10:30-11:30', 3: '11:30-12:30', 4: '12:30-01:30',
        5: '01:30-02:30', 6: '02:30-03:30', 7: '03:30-04:30', 8: '04:30-05:30'
    };
    const PERIOD_TIMES_24H = {
        1: { start: '09:30', end: '10:30' }, 2: { start: '10:30', end: '11:30' },
        3: { start: '11:30', end: '12:30' }, 4: { start: '12:30', end: '13:30' },
        5: { start: '13:30', end: '14:30' }, 6: { start: '14:30', end: '15:30' },
        7: { start: '15:30', end: '16:30' }, 8: { start: '16:30', end: '17:30' }
    };
    const SESSION_STORAGE_KEY = 'semesterBookingState';

    // --- STATE MANAGEMENT (Unchanged) ---
    let state = {
        semesterHallsData: {},
        employeeData: [], // Will be loaded lazily
        selectedHallId: null,
        hallStates: {}, // Stores state for each hall: { hallId: { selectedSlots, formDetails } }
    };
    let abortController;

    // --- API & DATA HANDLING (Updated to use ApiService) ---
    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    function mapHallType(apiType) {
        if (!apiType) return 'N/A';
        const type = apiType.toUpperCase();
        switch (type) {
            case 'SEMINAR': return 'Seminar';
            case 'LECTURE': return 'Lecture Hall';
            case 'CONFERENCE': return 'Conference Hall';
            case 'AUDITORIUM': return 'Auditorium';
            default: return formatTitleCase(apiType);
        }
    }

    async function fetchHallsForView() {
        const [rawHalls, schools, departments] = await Promise.all([
            ApiService.halls.getAll(),
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);

        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

        const availableHalls = rawHalls.filter(hall => hall.availability !== false);

        return availableHalls.map(hall => ({
            ...hall,
            id: hall.unique_id,
            name: hall.name,
            hallCode: hall.unique_id,
            type: mapHallType(hall.type),
            capacity: hall.capacity,
            school: schoolMap.get(hall.school_id) || 'N/A',
            department: departmentMap.get(hall.department_id) || 'N/A',
        }));
    }

    async function fetchSemesterHalls() {
        const allHalls = await fetchHallsForView();
        const groupedHalls = { 'Seminar': [], 'Auditorium': [], 'Lecture Hall': [], 'Conference Hall': [], 'Other': [] };
        
        allHalls.forEach(hall => {
            if (groupedHalls.hasOwnProperty(hall.type)) {
                groupedHalls[hall.type].push(hall);
            } else {
                groupedHalls['Other'].push(hall);
            }
        });
        return groupedHalls;
    }

    function processBookingsIntoTimetable(bookings) {
        const timetable = {};
        const dayMap = { 0: 'SUNDAY', 1: 'MONDAY', 2: 'TUESDAY', 3: 'WEDNESDAY', 4: 'THURSDAY', 5: 'FRIDAY', 6: 'SATURDAY' };

        const periodTimeObjects = {
            1: { start: 9.5, end: 10.5 }, 2: { start: 10.5, end: 11.5 },
            3: { start: 11.5, end: 12.5 }, 4: { start: 12.5, end: 13.5 },
            5: { start: 13.5, end: 14.5 }, 6: { start: 14.5, end: 15.5 },
            7: { start: 15.5, end: 16.5 }, 8: { start: 16.5, end: 17.5 },
        };

        bookings.forEach(booking => {
            if (!booking.start_time || !booking.end_time) {
                console.warn("Skipping booking with invalid time:", booking);
                return;
            }
            const startDate = new Date(booking.start_time);
            let endDate = new Date(booking.end_time);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.warn("Skipping booking with invalid date:", booking);
                return;
            }

            if (endDate < startDate) {
                endDate.setUTCHours(endDate.getUTCHours() + 12);
            }

            const classCode = booking.bookingRequest?.class_code || 'Booked';
            const dayOfWeek = dayMap[startDate.getUTCDay()];
            if (!dayOfWeek || dayOfWeek === 'SATURDAY' || dayOfWeek === 'SUNDAY') return;

            if (!timetable[dayOfWeek]) {
                timetable[dayOfWeek] = {};
            }

            const bookingStartHour = startDate.getUTCHours() + startDate.getUTCMinutes() / 60;
            const bookingEndHour = endDate.getUTCHours() + endDate.getUTCMinutes() / 60;

            for (const [period, times] of Object.entries(periodTimeObjects)) {
                if (times.start < bookingEndHour && times.end > bookingStartHour) {
                     timetable[dayOfWeek][period] = classCode;
                }
            }
        });

        return timetable;
    }

    async function fetchAndApplyTimetable(hallId) {
        const hall = findHallById(hallId);
        if (!hall) return;

        try {
            const bookings = await ApiService.bookings.getForHall(hallId);
            hall.timetable = bookings ? processBookingsIntoTimetable(bookings) : {};
        } catch (error) {
            console.error(`Failed to fetch timetable for hall ${hallId}:`, error);
            hall.timetable = { error: "Failed to load schedule" };
        }
    }

    async function fetchEmployeeData() {
        if (state.employeeData && state.employeeData.length > 0) {
            return state.employeeData;
        }
        try {
            const [rawEmployees, schools, departments] = await Promise.all([
                ApiService.employees.getAll(),
                ApiService.organization.getSchools(),
                ApiService.organization.getDepartments()
            ]);

            const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
            const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

            state.employeeData = rawEmployees.map(emp => ({
                id: emp.unique_id, name: emp.employee_name, email: emp.employee_email,
                phone: emp.employee_mobile, designation: emp.designation,
                department: departmentMap.get(emp.department_id) || 'N/A',
                school: schoolMap.get(emp.school_id) || 'N/A'
            }));
            return state.employeeData;
        } catch (error) {
            console.error("Failed to fetch employee data:", error);
            return [];
        }
    }

    async function addSemesterBooking(bookingDetails) {
        return await ApiService.bookings.createRequest(bookingDetails);
    }

    // --- All other functions (state management, rendering, event handlers, etc.) remain unchanged ---
    function saveStateToSession() {
        if (!state.selectedHallId) return;
        try {
            const currentHallState = state.hallStates[state.selectedHallId] || { selectedSlots: [], formDetails: {} };
            currentHallState.formDetails = {
                startDate: document.getElementById('start-date')?.value,
                endDate: document.getElementById('end-date')?.value,
                purpose: document.getElementById('booking-purpose')?.value,
                title: document.getElementById('course-title')?.value,
                faculty: document.getElementById('faculty-select')?.value,
            };
            state.hallStates[state.selectedHallId] = currentHallState;
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                selectedHallId: state.selectedHallId,
                hallStates: state.hallStates
            }));
        } catch (e) {
            console.error("Failed to save state to session storage:", e);
        }
    }

    function loadStateFromSession() {
        try {
            const savedState = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                state.selectedHallId = parsedState.selectedHallId;
                state.hallStates = parsedState.hallStates || {};
            }
        } catch (e) {
            console.error("Failed to load state from session storage:", e);
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            state.selectedHallId = null;
            state.hallStates = {};
        }
    }

    function clearCurrentHallState() {
        const hallId = state.selectedHallId;
        if (hallId && state.hallStates[hallId]) {
            state.hallStates[hallId] = { selectedSlots: [], formDetails: {} };
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
        renderBookingPanel();
    }

    function renderSemesterHalls(data) {
        const container = document.getElementById('semester-halls-container');
        if (!container) return;
        container.innerHTML = Object.entries(data).map(([groupName, halls]) => {
            if (halls.length === 0) return '';
            return `
            <div>
                <h2 class="text-xl font-bold text-blue-400 mb-3">${groupName}</h2>
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    ${halls.map(hall => `
                        <div data-hall-id="${hall.id}" class="semester-hall-card ${hall.id === state.selectedHallId ? 'active' : ''} bg-slate-900/50 p-3 rounded-lg border border-slate-700 hover:border-blue-500 transition flex flex-col justify-between">
                            <div class="cursor-pointer">
                                <p class="font-semibold text-white">${hall.name}</p>
                                <p class="text-sm text-slate-400">Capacity: ${hall.capacity}</p>
                            </div>
                            <div class="mt-3 text-right">
                                <button data-action="view-semester-hall-details" data-hall-id="${hall.id}" class="px-3 py-1 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-md transition">View Details</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `}).join('');
    }

    function renderBookingPanel() {
        const container = document.getElementById('booking-panel-container');
        if (!container) return;
        const selectedHall = findHallById(state.selectedHallId);
        const currentHallState = state.hallStates[state.selectedHallId] || { selectedSlots: [], formDetails: {} };
        if (!selectedHall) {
            container.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-center text-slate-400">Please click a hall's title from the left to begin booking.</p></div>`;
            return;
        }
        container.innerHTML = `
            <h2 class="text-2xl font-bold text-white mb-4">Book a Slot in: <span class="text-blue-400">${selectedHall.name}</span></h2>
            <div class="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-2">
                <div class="flex flex-col lg:col-span-7">
                    <h3 class="text-lg font-semibold text-slate-300 mb-2">1. Select Available Slots</h3>
                    <div id="interactive-timetable" class="overflow-x-auto">${renderInteractiveTimetable(selectedHall, currentHallState.selectedSlots)}</div>
                    <div class="mt-4">
                        <h4 class="font-semibold text-slate-300 mb-2">Selected Slots:</h4>
                        <div id="selected-slots-summary" class="flex flex-wrap gap-2">${renderSelectedSlotsSummary(currentHallState.selectedSlots)}</div>
                    </div>
                </div>
                <div id="booking-form-section" class="lg:col-span-5">${renderBookingForm()}</div>
            </div>
        `;
        setupBookingPanelHandlers();
    }

    function renderInteractiveTimetable(hall, selectedSlots) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const dayMap = { 'Mon': 'MONDAY', 'Tue': 'TUESDAY', 'Wed': 'WEDNESDAY', 'Thu': 'THURSDAY', 'Fri': 'FRIDAY' };
        const periods = Object.keys(PERIOD_TIMES).map(Number);

        if (hall.timetable?.error) {
            return `<div class="p-4 text-center text-red-400">${hall.timetable.error}</div>`;
        }

        let tableHTML = `<table class="w-full text-center"><thead><tr><th class="p-2 border border-slate-700 align-bottom">Day</th>`;
        periods.forEach(p => {
            tableHTML += `<th class="p-2 border border-slate-700 timetable-header-cell"><div>${p}</div><div class="text-xs font-normal text-slate-400">${PERIOD_TIMES[p]}</div></th>`;
        });
        tableHTML += `</tr></thead><tbody>`;

        days.forEach(day => {
            tableHTML += `<tr><td class="p-2 border border-slate-700 font-semibold">${day}</td>`;
            const backendDayKey = dayMap[day];

            periods.forEach(period => {
                const courseCode = hall.timetable?.[backendDayKey]?.[period];
                const isBooked = !!courseCode;
                const isSelected = selectedSlots && selectedSlots.some(s => s.day === day && s.period === period);

                let cellClass, cellContent = '', cellTitle = '';

                if (isBooked) {
                    cellClass = 'booked';
                    cellContent = courseCode;
                    cellTitle = `Booked: ${courseCode}`;
                } else if (isSelected) {
                    cellClass = 'selected';
                    cellTitle = 'Click to de-select';
                } else {
                    cellClass = 'available';
                    cellTitle = 'Click to select';
                }

                tableHTML += `<td class="p-1 border border-slate-700 timetable-slot ${cellClass}" data-day="${day}" data-period="${period}" title="${cellTitle}">${cellContent}</td>`;
            });
            tableHTML += `</tr>`;
        });
        tableHTML += `</tbody></table>`;
        return tableHTML;
    }

    function renderSelectedSlotsSummary(selectedSlots) {
        if (!selectedSlots || selectedSlots.length === 0) return '<p class="text-slate-500 text-sm p-2">No slots selected.</p>';
        return selectedSlots.map(s => `
            <div class="selected-slot-pill bg-sky-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-2">
                <span>${s.day}, P${s.period} (${PERIOD_TIMES[s.period]})</span>
                <button data-day="${s.day}" data-period="${s.period}" class="remove-slot-btn text-sky-200 hover:text-white"><i data-lucide="x" class="w-4 h-4 pointer-events-none"></i></button>
            </div>
        `).join('');
    }

    function renderBookingForm() {
        const inputClasses = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white";
        return `
            <div class="space-y-4">
                <div><h3 class="text-lg font-semibold text-slate-300 mb-2">2. Enter Booking Details</h3></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label for="start-date" class="block text-sm font-medium text-slate-300 mb-1">Start Date</label><input type="date" id="start-date" class="${inputClasses}"></div>
                    <div><label for="end-date" class="block text-sm font-medium text-slate-300 mb-1">End Date</label><input type="date" id="end-date" class="${inputClasses}"></div>
                </div>
                <div><label for="booking-purpose" class="block text-sm font-medium text-slate-300 mb-1">Booking Purpose</label><select id="booking-purpose" class="${inputClasses}"><option>Class</option><option>Seminar</option><option>Workshop</option><option>Meeting</option></select></div>
                <div><label for="course-title" class="block text-sm font-medium text-slate-300 mb-1">Course / Event Title</label><input type="text" id="course-title" class="${inputClasses}" placeholder="e.g., Advanced Algorithms"></div>
                <div>
                    <label for="faculty-select-input" class="block text-sm font-medium text-slate-300 mb-1">Faculty / Organizer</label>
                    <div class="relative">
                        <input type="text" id="faculty-select-input" class="${inputClasses}" placeholder="Search for a faculty member...">
                        <div id="faculty-select-options" class="absolute z-10 w-full bg-slate-800 border border-slate-600 rounded-lg mt-1 hidden max-h-60 overflow-y-auto"></div>
                    </div>
                    <input type="hidden" id="faculty-select">
                </div>
                <div><label class="block text-sm font-medium text-slate-300 mb-1">Faculty Department</label><input type="text" id="faculty-dept" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-400" readonly></div>
                <div><label class="block text-sm font-medium text-slate-300 mb-1">Faculty Email</label><input type="text" id="faculty-email" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-400" readonly></div>
                <div class="flex gap-4 pt-4">
                     <button id="clear-selection-btn" class="flex-1 px-4 py-2 text-sm font-semibold text-white bg-slate-600 hover:bg-slate-700 rounded-lg">Clear</button>
                     <button id="submit-booking-btn" class="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Submit</button>
                </div>
            </div>
        `;
    }

    function populateFacultyDropdown(searchTerm = '') {
        const optionsContainer = document.getElementById('faculty-select-options');
        if (!optionsContainer) return;
        const filteredEmployees = state.employeeData.filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filteredEmployees.length === 0) {
            optionsContainer.innerHTML = `<div class="p-2 text-slate-400">No results found</div>`;
            return;
        }
        optionsContainer.innerHTML = filteredEmployees.map(emp => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${emp.email}" data-name="${emp.name}">${emp.name}</div>`).join('');
    }

    async function handleHallClick(e) {
        const card = e.target.closest('.semester-hall-card');
        if (!card) return;

        const detailsButton = e.target.closest('button[data-action="view-semester-hall-details"]');
        const hallId = card.dataset.hallId;

        if (detailsButton && hallId) {
            e.stopPropagation();
            const hallData = findHallById(hallId);
            if (hallData) {
                sessionStorage.setItem('hallDetailsData', JSON.stringify(hallData));
                window.location.hash = `#hall-booking-details-view?id=${hallId}`;
            }
        } else if (hallId) {
            state.selectedHallId = hallId;
            document.querySelectorAll('.semester-hall-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            const container = document.getElementById('booking-panel-container');
            if (container) {
                container.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-center text-slate-400">Loading hall schedule...</p></div>`;
            }

            await fetchAndApplyTimetable(hallId);

            renderBookingPanel();
            saveStateToSession();
        }
    }

    function toggleSlotSelection(day, period) {
        const hallId = state.selectedHallId;
        if (!hallId) return;
        if (!state.hallStates[hallId]) state.hallStates[hallId] = { selectedSlots: [], formDetails: {} };

        if (!Array.isArray(state.hallStates[hallId].selectedSlots)) {
            state.hallStates[hallId].selectedSlots = [];
        }

        const slots = state.hallStates[hallId].selectedSlots;
        const index = slots.findIndex(s => s.day === day && s.period == period);
        if (index > -1) {
            slots.splice(index, 1);
        } else {
            slots.push({ day, period: parseInt(period, 10) });
        }
        saveStateToSession();
        renderBookingPanel();
    }

    async function handleSubmit() {
        const hallId = state.selectedHallId;
        if (!hallId) { showToast('Please select a hall.', 'warning'); return; }

        const currentHallState = state.hallStates[hallId];
        if (!currentHallState || !currentHallState.selectedSlots || currentHallState.selectedSlots.length === 0) {
            showToast('Please select at least one time slot.', 'warning'); return;
        }

        const formDetails = {
            startDate: document.getElementById('start-date')?.value,
            endDate: document.getElementById('end-date')?.value,
            purpose: document.getElementById('booking-purpose')?.value,
            title: document.getElementById('course-title')?.value,
            faculty: document.getElementById('faculty-select')?.value,
        };

        if (!formDetails.startDate || !formDetails.endDate || !formDetails.purpose || !formDetails.title) {
            showToast('Please fill out all booking detail fields.', 'warning'); return;
        }
        if (new Date(formDetails.startDate) > new Date(formDetails.endDate)) {
            showToast('Start date cannot be after the end date.', 'warning'); return;
        }

        const dayMap = { 'Mon': 'MONDAY', 'Tue': 'TUESDAY', 'Wed': 'WEDNESDAY', 'Thu': 'THURSDAY', 'Fri': 'FRIDAY' };
        const selectedDays = [...new Set(currentHallState.selectedSlots.map(s => s.day))];
        const days_of_week = selectedDays.map(day => dayMap[day]);

        const allPeriods = currentHallState.selectedSlots.map(s => s.period);
        const minPeriod = Math.min(...allPeriods);
        const maxPeriod = Math.max(...allPeriods);

        const start_time = PERIOD_TIMES_24H[minPeriod].start;
        const end_time = PERIOD_TIMES_24H[maxPeriod].end;

        const payload = {
            hall_id: hallId,
            purpose: formDetails.purpose,
            booking_type: 'SEMESTER',
            start_date: new Date(formDetails.startDate).toISOString(),
            end_date: new Date(formDetails.endDate).toISOString(),
            start_time: start_time,
            end_time: end_time,
            days_of_week: days_of_week,
            class_code: formDetails.title,
        };

        if (formDetails.faculty) {
            const facultyMember = state.employeeData.find(e => e.email === formDetails.faculty);
            if (facultyMember) {
                payload.booking_requested_employee_id = facultyMember.id;
            }
        }

        const submitBtn = document.getElementById('submit-booking-btn');
        try {
            if(submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }
            const result = await addSemesterBooking(payload);
            showToast(result.message || 'Semester booking request submitted successfully!', 'success');
            clearCurrentHallState();
        } catch (error) {
            console.error('Booking submission error:', error);
            let alertMessage = `Failed to submit booking request.`;

            if (error.message && error.message.includes('409')) {
                try {
                    const jsonStartIndex = error.message.indexOf('{');
                    if (jsonStartIndex !== -1) {
                        const jsonString = error.message.substring(jsonStartIndex);
                        const errorDetails = JSON.parse(jsonString);
                        alertMessage = `Booking Conflict: ${errorDetails.message || 'The hall is already booked for the selected time.'}`;
                    } else {
                         alertMessage = 'Booking Conflict: The hall is already booked for the selected time.';
                    }
                } catch (parseError) {
                    console.error("Could not parse conflict error JSON:", parseError);
                    alertMessage = 'Booking Conflict: The hall is already booked for the selected time.';
                }
            } else if (error.message) {
                alertMessage += `\nDetails: ${error.message}`;
            }

            showToast(alertMessage, 'error');
        } finally {
            if(submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const panel = document.getElementById('semester-halls-panel');
        if (panel) {
            panel.addEventListener('click', handleHallClick, { signal: abortController.signal });
        }
    }

    function setupBookingPanelHandlers() {
        lucide.createIcons();
        const panel = document.getElementById('booking-panel-container');
        if(!panel) return;

        panel.querySelector('#interactive-timetable')?.addEventListener('click', e => {
            const slot = e.target.closest('.timetable-slot.available, .timetable-slot.selected');
            if (slot) toggleSlotSelection(slot.dataset.day, slot.dataset.period);
        });
        panel.querySelector('#selected-slots-summary')?.addEventListener('click', e => {
            const btn = e.target.closest('.remove-slot-btn');
            if (btn) toggleSlotSelection(btn.dataset.day, btn.dataset.period);
        });
        panel.querySelector('#clear-selection-btn')?.addEventListener('click', clearCurrentHallState);
        panel.querySelector('#submit-booking-btn')?.addEventListener('click', handleSubmit);

        const facultyInput = document.getElementById('faculty-select-input');
        const facultyOptions = document.getElementById('faculty-select-options');
        const facultyHidden = document.getElementById('faculty-select');
        if (facultyInput && facultyOptions && facultyHidden) {
            facultyInput.addEventListener('focus', async () => {
                await fetchEmployeeData();
                populateFacultyDropdown(facultyInput.value);
                facultyOptions.classList.remove('hidden');
            });
            facultyInput.addEventListener('blur', () => setTimeout(() => facultyOptions.classList.add('hidden'), 150));
            facultyInput.addEventListener('input', () => populateFacultyDropdown(facultyInput.value));
            facultyOptions.addEventListener('mousedown', e => {
                if (e.target.dataset.value) {
                    facultyHidden.value = e.target.dataset.value;
                    facultyInput.value = e.target.dataset.name;
                    facultyOptions.classList.add('hidden');
                    handleFacultyChange(facultyHidden.value);
                }
            });
        }

        const details = state.hallStates[state.selectedHallId]?.formDetails || {};
        const startDateEl = document.getElementById('start-date');
        if(startDateEl) startDateEl.value = details.startDate || new Date().toISOString().slice(0,10);
        const endDateEl = document.getElementById('end-date');
        if(endDateEl) endDateEl.value = details.endDate || '';
        const purposeEl = document.getElementById('booking-purpose');
        if(purposeEl) purposeEl.value = details.purpose || 'Class';
        const titleEl = document.getElementById('course-title');
        if(titleEl) titleEl.value = details.title || '';

        if (details.faculty) {
             handleFacultyChange(details.faculty);
             const facultyMember = state.employeeData.find(e => e.email === details.faculty);
             if (facultyMember) {
                 const facultyInputEl = document.getElementById('faculty-select-input');
                 if(facultyInputEl) facultyInputEl.value = facultyMember.name;
                 const facultySelectEl = document.getElementById('faculty-select');
                 if(facultySelectEl) facultySelectEl.value = facultyMember.email;
             }
        }
        panel.querySelectorAll('input, select').forEach(el => el.addEventListener('change', saveStateToSession));
    }

    function handleFacultyChange(selectedEmail) {
        const deptInput = document.getElementById('faculty-dept');
        const emailInput = document.getElementById('faculty-email');
        if (selectedEmail) {
            const faculty = state.employeeData.find(emp => emp.email === selectedEmail);
            if(faculty && deptInput && emailInput) {
                deptInput.value = faculty.department;
                emailInput.value = faculty.email;
            }
        } else if(deptInput && emailInput) {
            deptInput.value = '';
            emailInput.value = '';
        }
        saveStateToSession();
    }

    function findHallById(id) {
        if (!id || !state.semesterHallsData) return null;
        return Object.values(state.semesterHallsData).flat().find(h => h.id === id);
    }

    function cleanup() {
        if (abortController) abortController.abort();
    }

    async function initialize() {
        try {
            loadStateFromSession();
            if (state.selectedHallId && state.hallStates[state.selectedHallId]?.formDetails?.faculty) {
                 await fetchEmployeeData();
            }
            state.semesterHallsData = await fetchSemesterHalls();
            renderSemesterHalls(state.semesterHallsData);
            renderBookingPanel();
            setupEventHandlers();

            if (state.selectedHallId) {
                const card = document.querySelector(`.semester-hall-card[data-hall-id="${state.selectedHallId}"]`);
                if (card) {
                    await handleHallClick({ target: card });
                }
            }
        } catch (error) {
            console.error('Error loading semester booking view:', error);
            const container = document.getElementById('semester-halls-container');
            if(container) container.innerHTML = `<div class="text-center py-10 text-red-400">Failed to load hall data. Please try refreshing the page.</div>`;
            const bookingPanel = document.getElementById('booking-panel-container');
            if(bookingPanel) bookingPanel.innerHTML = '';
        }
    }

    return { initialize, cleanup };
})();
