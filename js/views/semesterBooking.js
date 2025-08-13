// HallBooking/js/views/semesterBooking.js

// Semester Booking View Module
window.SemesterBookingView = (function() {
    // --- START: Simple API Cache ---
    window.apiCache = window.apiCache || {
        _data: {},
        _promises: {},
        fetch: async function(key, fetcherFn) {
            if (this._data[key]) return this._data[key];
            if (!this._promises[key]) {
                this._promises[key] = fetcherFn().then(data => {
                    this._data[key] = data;
                    delete this._promises[key];
                    return data;
                }).catch(err => {
                    delete this._promises[key];
                    throw err;
                });
            }
            return this._promises[key];
        }
    };
    // --- END: Simple API Cache ---

    // --- CONSTANTS ---
    const PERIOD_TIMES = {
        1: '09:30-10:30', 2: '10:30-11:30', 3: '11:30-12:30', 4: '12:30-01:30',
        5: '01:30-02:30', 6: '02:30-03:30', 7: '03:30-04:30', 8: '04:30-05:30'
    };
    const SESSION_STORAGE_KEY = 'semesterBookingState';

    // --- STATE MANAGEMENT ---
    let state = {
        semesterHallsData: {},
        employeeData: [], // Will be loaded lazily
        selectedHallId: null,
        hallStates: {}, // Stores state for each hall: { hallId: { selectedSlots, formDetails } }
    };
    let abortController;

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) { logout(); throw new Error("User not authenticated"); }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);
        if (!response.ok) { throw new Error(`API Error on ${endpoint}: ${response.status}`); }
        if (isJson) {
            const text = await response.text();
            if (!text) return null;
            const result = JSON.parse(text);
            return result.data || result;
        }
        return response;
    }
    
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

    // Use the cache for fetching raw data
    async function fetchRawSchools() {
        return await window.apiCache.fetch('schools', () => fetchFromAPI(AppConfig.endpoints.allschool));
    }
    async function fetchRawDepartments() {
        return await window.apiCache.fetch('departments', () => fetchFromAPI(AppConfig.endpoints.alldept));
    }
    async function fetchRawEmployees() {
        return await window.apiCache.fetch('employees', () => fetchFromAPI(AppConfig.endpoints.allemp));
    }

    async function fetchHallsForView() {
        // CORRECTED: Fetch all three endpoints to correctly map names from IDs.
        const [rawHalls, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allHall),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

        return rawHalls.map(hall => ({
            id: hall.unique_id,
            name: hall.name,
            hallCode: hall.unique_id,
            type: mapHallType(hall.type),
            capacity: hall.capacity,
            school: schoolMap.get(hall.school_id) || 'N/A',
            department: departmentMap.get(hall.department_id) || 'N/A',
            ...hall
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

    async function fetchEmployeeData() {
        if (state.employeeData && state.employeeData.length > 0) {
            return state.employeeData;
        }

        const [rawEmployees, schools, departments] = await Promise.all([
            fetchRawEmployees(),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));

        const employees = rawEmployees.map(emp => ({
            id: emp.unique_id,
            name: emp.employee_name,
            email: emp.employee_email,
            phone: emp.employee_mobile,
            designation: emp.designation,
            department: departmentMap.get(emp.department_id) || 'N/A',
            school: schoolMap.get(emp.school_id) || 'N/A'
        }));
        state.employeeData = employees;
        return employees;
    }

    async function addSemesterBooking(bookingDetails) {
        return await fetchFromAPI(AppConfig.endpoints.bookingRequest, { method: 'POST', body: JSON.stringify(bookingDetails) });
    }

    function saveStateToSession() {
        if (!state.selectedHallId) return;
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
    }

    function loadStateFromSession() {
        const savedState = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            state.selectedHallId = parsedState.selectedHallId;
            state.hallStates = parsedState.hallStates || {};
        }
    }
    
    function clearCurrentHallState() {
        const hallId = state.selectedHallId;
        if (hallId && state.hallStates[hallId]) {
            state.hallStates[hallId] = { selectedSlots: [], formDetails: {} };
        }
        renderBookingPanel();
        saveStateToSession();
    }

    function renderSemesterHalls(data) {
        const container = document.getElementById('semester-halls-container');
        if (!container) return;
        const hallsHtml = Object.entries(data).map(([groupName, halls]) => {
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
        container.innerHTML = hallsHtml;
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
        const periods = Object.keys(PERIOD_TIMES).map(Number);
        let tableHTML = `<table class="w-full text-center"><thead><tr><th class="p-2 border border-slate-700 align-bottom">Day</th>`;
        periods.forEach(p => {
            tableHTML += `<th class="p-2 border border-slate-700 timetable-header-cell"><div>${p}</div><div class="text-xs font-normal text-slate-400">${PERIOD_TIMES[p]}</div></th>`;
        });
        tableHTML += `</tr></thead><tbody>`;
        days.forEach(day => {
            tableHTML += `<tr><td class="p-2 border border-slate-700 font-semibold">${day}</td>`;
            periods.forEach(period => {
                const courseCode = hall.timetable?.[day]?.[period];
                const isBooked = !!courseCode;
                const isSelected = selectedSlots.some(s => s.day === day && s.period === period);
                let cellClass = isBooked ? 'booked' : (isSelected ? 'selected' : 'available');
                tableHTML += `<td class="p-1 border border-slate-700 timetable-slot ${cellClass}" data-day="${day}" data-period="${period}" title="${isBooked ? `Booked: ${courseCode}` : ''}">${isBooked ? courseCode : ''}</td>`;
            });
            tableHTML += `</tr>`;
        });
        tableHTML += `</tbody></table>`;
        return tableHTML;
    }

    function renderSelectedSlotsSummary(selectedSlots) {
        if (selectedSlots.length === 0) return '<p class="text-slate-500 text-sm p-2">No slots selected.</p>';
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

    /**
     * MODIFIED FUNCTION
     * The original code prevented this function from running if a button was clicked.
     * This change ensures that clicking anywhere on the card, including the "View Details" button,
     * correctly selects the hall and its ID. This prevents a "garbage value" or incorrect ID from being used.
     */
    function handleHallClick(e) {
        const card = e.target.closest('.semester-hall-card');
        // If the click is not on a card, do nothing.
        if (!card) return;

        // The original logic `if (!card || e.target.closest('button')) return;` was preventing
        // clicks on the "View Details" button from being processed. 
        // By removing that check, we ensure that clicking anywhere inside the card,
        // including the button, correctly selects the hall.
        
        const hallId = card.dataset.hallId;

        // This ensures we always have a valid hallId before proceeding.
        if (hallId) {
            state.selectedHallId = hallId;
            document.querySelectorAll('.semester-hall-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            renderBookingPanel();
            saveStateToSession();
        } else {
            // This case should not be reached if the HTML is rendered correctly,
            // but it's a good safeguard against passing a "garbage value".
            console.error("Clicked card does not have a hall-id.", card);
        }
    }

    function toggleSlotSelection(day, period) {
        const hallId = state.selectedHallId;
        if (!hallId) return;
        if (!state.hallStates[hallId]) state.hallStates[hallId] = { selectedSlots: [], formDetails: {} };
        const slots = state.hallStates[hallId].selectedSlots;
        const index = slots.findIndex(s => s.day === day && s.period === period);
        if (index > -1) slots.splice(index, 1);
        else slots.push({ day, period });
        saveStateToSession();
        renderBookingPanel();
    }
    
    function handleSubmit() {
        const hallId = state.selectedHallId;
        if (!hallId) { alert('Please select a hall.'); return; }
        const selectedHall = findHallById(hallId);
        const currentHallState = state.hallStates[hallId];
        const formDetails = currentHallState.formDetails;
        if (!selectedHall || currentHallState.selectedSlots.length === 0) { alert('Please select a hall and at least one time slot.'); return; }
        if (!formDetails.startDate || !formDetails.endDate || new Date(formDetails.startDate) > new Date(formDetails.endDate)) { alert('Please select a valid date range.'); return; }
        if (!formDetails.title || !formDetails.faculty) { alert('Please enter a Title and select a Faculty.'); return; }
        
        const bookingId = `BK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000)}`;
        const facultyMember = state.employeeData.find(e => e.email === formDetails.faculty);
        const bookingRecord = {
            bookedOn: new Date().toISOString().slice(0,10),
            bookingId: bookingId,
            hallName: selectedHall.name,
            hallCode: selectedHall.id,
            department: facultyMember.department,
            purpose: formDetails.purpose,
            course: formDetails.title,
            dateTime: `Semester: ${formDetails.startDate} to ${formDetails.endDate}`,
            status: 'Approved',
            isSemester: true,
            bookedBy: facultyMember.name,
            bookedByDept: facultyMember.department,
            phone: facultyMember.phone,
            email: facultyMember.email
        };
        const courseCode = formDetails.title.replace(/\s/g, '_').toUpperCase().substring(0, 8);
        addSemesterBooking({ hallId: hallId, slotsToBook: currentHallState.selectedSlots, courseCode: courseCode, bookingRecord: bookingRecord });
        alert(`Semester booking submitted successfully for ${formDetails.title}!\nID: ${bookingId}`);
        clearCurrentHallState();
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        document.getElementById('semester-halls-panel')?.addEventListener('click', handleHallClick, { signal: abortController.signal });
    }
    
    function setupBookingPanelHandlers() {
        lucide.createIcons();
        const panel = document.getElementById('booking-panel-container');
        if(!panel) return;
        panel.querySelector('#interactive-timetable')?.addEventListener('click', e => {
            const slot = e.target.closest('.timetable-slot.available, .timetable-slot.selected');
            if (slot) toggleSlotSelection(slot.dataset.day, parseInt(slot.dataset.period, 10));
        });
        panel.querySelector('#selected-slots-summary')?.addEventListener('click', e => {
            const btn = e.target.closest('.remove-slot-btn');
            if (btn) toggleSlotSelection(btn.dataset.day, parseInt(btn.dataset.period, 10));
        });
        panel.querySelector('#clear-selection-btn')?.addEventListener('click', clearCurrentHallState);
        panel.querySelector('#submit-booking-btn')?.addEventListener('click', handleSubmit);

        const facultyInput = document.getElementById('faculty-select-input');
        const facultyOptions = document.getElementById('faculty-select-options');
        const facultyHidden = document.getElementById('faculty-select');
        if (facultyInput) {
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
        document.getElementById('start-date').value = details.startDate || new Date().toISOString().slice(0,10);
        document.getElementById('end-date').value = details.endDate || '';
        document.getElementById('booking-purpose').value = details.purpose || 'Class';
        document.getElementById('course-title').value = details.title || '';
        if (details.faculty) {
            // This part for re-populating a saved state might need the employee data.
        }
        panel.querySelectorAll('input, select').forEach(el => el.addEventListener('change', saveStateToSession));
    }

    function handleFacultyChange(selectedEmail) {
        const deptInput = document.getElementById('faculty-dept');
        const emailInput = document.getElementById('faculty-email');
        if (selectedEmail) {
            const faculty = state.employeeData.find(emp => emp.email === selectedEmail);
            if(faculty) {
                deptInput.value = faculty.department;
                emailInput.value = faculty.email;
            }
        } else {
            deptInput.value = '';
            emailInput.value = '';
        }
        saveStateToSession();
    }

    function findHallById(id) {
        if (!id) return null;
        return Object.values(state.semesterHallsData).flat().find(h => h.id === id);
    }

    function cleanup() {
        if (abortController) abortController.abort();
    }

    async function initialize() {
        try {
            loadStateFromSession();
            state.semesterHallsData = await fetchSemesterHalls();
            renderSemesterHalls(state.semesterHallsData);
            renderBookingPanel();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading semester booking view:', error);
            const container = document.getElementById('semester-halls-container');
            if(container) container.innerHTML = `<div class="text-center py-10 text-red-400">Failed to load hall data.</div>`;
        }
    }

    return { initialize, cleanup };
})();
