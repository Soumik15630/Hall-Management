// HallBooking/js/views/hallBookingDetails.js

window.HallBookingDetailsView = (function() {
    let state = {
        currentHall: null,
        currentHallId: null,
        currentDate: new Date(),
        availabilityData: [],
        selectedSlots: [], 
        isDragging: false,
        dragSelectionMode: 'add',
        dragDate: null,
    };
    let abortController;
    
    const STORAGE_KEY_PREFIX = 'hallBookingDetails_';
    const FINAL_BOOKING_SLOTS = 'finalBookingSlots';
    const FINAL_BOOKING_AVAILABILITY = 'finalBookingAvailability';
    const FINAL_BOOKING_HALL = 'finalBookingHall';

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

    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    async function fetchRawSchools() {
        return await fetchFromAPI(AppConfig.endpoints.allschool);
    }

    async function fetchRawDepartments() {
        return await fetchFromAPI(AppConfig.endpoints.alldept);
    }

    async function fetchBookingHalls() {
        const [rawHalls, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allHall),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        
        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        const allHalls = rawHalls.map(hall => {
             const dept = departmentMap.get(hall.department_id);
             const school = schoolMap.get(hall.school_id);
             const incharge = dept 
                ? { name: dept.incharge_name, designation: 'HOD', email: dept.incharge_email, intercom: dept.incharge_contact_number }
                : (school ? { name: school.incharge_name, designation: 'Dean', email: school.incharge_email, intercom: school.incharge_contact_number } : {});

            return {
                id: hall.unique_id,
                name: hall.name,
                location: `${school ? school.school_name : 'N/A'}${dept ? ' - ' + dept.department_name : ''}`,
                capacity: hall.capacity,
                floor: formatTitleCase(hall.floor),
                zone: formatTitleCase(hall.zone),
                features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase) : [],
                incharge: incharge,
                ...hall
            };
        });

        // Grouping is not strictly needed here but kept for consistency if format changes
        const groupedHalls = { 'Seminar': [], 'Auditorium': [], 'Lecture Hall': [], 'Conference Hall': [] };
        allHalls.forEach(hall => {
            const typeKey = formatTitleCase(hall.type).replace(' Hall', '');
            if (groupedHalls.hasOwnProperty(typeKey)) {
                groupedHalls[typeKey].push(hall);
            } else {
                 if(!groupedHalls['Other']) groupedHalls['Other'] = [];
                 groupedHalls['Other'].push(hall);
            }
        });
        return allHalls; // Return flattened array for easier searching
    }
    
    // Placeholder function as in the original data.js
    async function fetchHallAvailability(hallId) {
        // In a real app, this would make an API call like:
        // return await fetchFromAPI(`${AppConfig.endpoints.availability}/${hallId}`);
        return Promise.resolve([]);
    }

    // --- STATE PERSISTENCE ---
    function saveStateToSession() {
        if (!state.currentHallId) return;
        const key = STORAGE_KEY_PREFIX + state.currentHallId;
        sessionStorage.setItem(key, JSON.stringify({
            selectedSlots: state.selectedSlots,
            currentDate: state.currentDate.toISOString()
        }));
    }

    function loadStateFromSession() {
        if (!state.currentHallId) return;
        const savedState = sessionStorage.getItem(STORAGE_KEY_PREFIX + state.currentHallId);
        if (savedState) {
            const parsed = JSON.parse(savedState);
            state.selectedSlots = parsed.selectedSlots || [];
            state.currentDate = new Date(parsed.currentDate);
        }
    }

    // --- RENDERING ---
    function renderHallDetails(hall) {
        const detailsContainer = document.getElementById('booking-hall-details');
        const featuresContainer = document.getElementById('booking-hall-features');
        const inchargeContainer = document.getElementById('booking-hall-incharge');
        if (!detailsContainer || !featuresContainer || !inchargeContainer || !hall) return;

        detailsContainer.innerHTML = `
            <h3 class="text-lg font-bold text-blue-300 mb-2">Hall Details</h3>
            <p class="font-semibold text-white">${hall.name || 'N/A'}</p>
            <p class="text-sm text-slate-300">${hall.location || 'N/A'}</p>
            <p class="text-sm text-slate-400 mt-2">Capacity: ${hall.capacity || 'N/A'}</p>
            <p class="text-sm text-slate-400">Floor: ${hall.floor || 'N/A'}</p>
            <p class="text-sm text-slate-400">Zone: ${hall.zone || 'N/A'}</p>
        `;
        const featuresList = hall.features.length > 0
            ? hall.features.map(f => `<li class="flex items-center text-slate-300"><i data-lucide="check" class="w-4 h-4 mr-2 text-green-400"></i>${f}</li>`).join('')
            : '<li class="text-slate-400">No features listed.</li>';
        featuresContainer.innerHTML = `<h3 class="text-lg font-bold text-green-300 mb-2">Features</h3><ul class="space-y-1">${featuresList}</ul>`;
        
        const { incharge = {} } = hall;
        inchargeContainer.innerHTML = `
            <h3 class="text-lg font-bold text-yellow-300 mb-2">In-Charge Details</h3>
            <p class="text-sm text-slate-300"><span class="font-semibold text-white">Name:</span> ${incharge.name || 'N/A'}</p>
            <p class="text-sm text-slate-300"><span class="font-semibold text-white">Designation:</span> ${incharge.designation || 'N/A'}</p>
            <p class="text-sm text-slate-300"><span class="font-semibold text-white">Email:</span> ${incharge.email || 'N/A'}</p>
            <p class="text-sm text-slate-300"><span class="font-semibold text-white">Intercom:</span> ${incharge.intercom || 'N/A'}</p>
        `;
        if (window.lucide) lucide.createIcons();
    }

    function getSlotStatus(year, month, day, time) {
        const time24 = time.replace(' AM', '').replace(' PM', ''); // Simplified conversion
        if (state.selectedSlots.some(s => s.year === year && s.month === month && s.day === day && s.time === time)) return 'Selected';
        const booking = state.availabilityData.find(b => b.hallId === state.currentHallId && b.year === year && b.month === month && b.day === day && b.time === time24);
        return booking ? booking.status : 'Available';
    }

    function renderBookingGrid() {
        const gridContainer = document.getElementById('booking-calendar-grid');
        const monthYearTitle = document.getElementById('current-month-year');
        if (!gridContainer || !monthYearTitle) return;

        const year = state.currentDate.getFullYear();
        const month = state.currentDate.getMonth();
        monthYearTitle.textContent = state.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const times = ['09:30 AM', '10:30 AM', '11:30 AM', '12:30 PM', '01:30 PM', '02:30 PM', '03:30 PM', '04:30 PM'];
        
        let gridHtml = '<table class="min-w-full text-center text-xs"><thead><tr><th class="p-1"></th>';
        for (let day = 1; day <= daysInMonth; day++) {
            const dayName = new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'short' });
            gridHtml += `<th class="p-1 text-slate-300">${day}<br>${dayName}</th>`;
        }
        gridHtml += '</tr></thead><tbody>';

        const today = new Date(); today.setHours(0, 0, 0, 0);
        times.forEach(time => {
            gridHtml += `<tr><td class="p-1 text-slate-300 font-semibold align-middle">${time}</td>`;
            for (let day = 1; day <= daysInMonth; day++) {
                const slotDate = new Date(year, month, day);
                let status = (slotDate < today) ? 'Past' : getSlotStatus(year, month, day, time);
                let cellClass = '';
                switch (status) {
                    case 'Past': cellClass = 'bg-gray-700/50 cursor-not-allowed'; break;
                    case 'Booked': cellClass = 'bg-red-600/80 cursor-not-allowed'; break;
                    case 'Pending': cellClass = 'bg-yellow-500/80 cursor-not-allowed'; break;
                    case 'Selected': cellClass = 'bg-cyan-500/80 cursor-pointer'; break;
                    default: cellClass = 'bg-green-500/80 cursor-pointer'; break;
                }
                gridHtml += `<td class="p-0"><div class="w-full h-6 border border-slate-700 ${cellClass}" data-year="${year}" data-month="${month}" data-day="${day}" data-time="${time}"></div></td>`;
            }
            gridHtml += '</tr>';
        });
        gridHtml += '</tbody></table>';
        gridContainer.innerHTML = gridHtml;
        updateBookingButtonState();
    }

    function updateBookingButtonState() {
        const bookBtn = document.getElementById('confirm-booking-btn');
        if (!bookBtn) return;
        const count = state.selectedSlots.length;
        bookBtn.textContent = count > 0 ? `Book (${count} Slot${count > 1 ? 's' : ''})` : 'Book';
        bookBtn.disabled = false;
    }

    // --- EVENT HANDLING ---
    function toggleSlot(slot) {
        const status = getSlotStatus(slot.year, slot.month, slot.day, slot.time);
        if (['Booked', 'Pending', 'Past'].includes(status)) return;
        
        const index = state.selectedSlots.findIndex(s => s.year === slot.year && s.month === slot.month && s.day === slot.day && s.time === slot.time);
        if (state.dragSelectionMode === 'add' && index === -1) {
            state.selectedSlots.push(slot);
        } else if (state.dragSelectionMode === 'remove' && index > -1) {
            state.selectedSlots.splice(index, 1);
        }
    }

    function handleDragStart(e) {
        const cell = e.target.closest('[data-time]');
        if (!cell) return;
        e.preventDefault();
        state.isDragging = true;
        const slot = { year: +cell.dataset.year, month: +cell.dataset.month, day: +cell.dataset.day, time: cell.dataset.time };
        const status = getSlotStatus(slot.year, slot.month, slot.day, slot.time);
        if (['Booked', 'Pending', 'Past'].includes(status)) { state.isDragging = false; return; }
        state.dragSelectionMode = (status === 'Selected') ? 'remove' : 'add';
        toggleSlot(slot);
        renderBookingGrid();
    }

    function handleDragOver(e) {
        if (!state.isDragging) return;
        const cell = e.target.closest('[data-time]');
        if (cell) {
            const slot = { year: +cell.dataset.year, month: +cell.dataset.month, day: +cell.dataset.day, time: cell.dataset.time };
            toggleSlot(slot);
            renderBookingGrid();
        }
    }

    function handleDragStop() {
        if (state.isDragging) {
            state.isDragging = false;
            saveStateToSession();
        }
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;

        document.getElementById('prev-month-btn')?.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() - 1); renderBookingGrid(); }, { signal });
        document.getElementById('next-month-btn')?.addEventListener('click', () => { state.currentDate.setMonth(state.currentDate.getMonth() + 1); renderBookingGrid(); }, { signal });
        
        const gridContainer = document.getElementById('booking-calendar-grid');
        if (gridContainer) {
            gridContainer.addEventListener('mousedown', handleDragStart, { signal });
            gridContainer.addEventListener('mouseenter', handleDragOver, { signal, capture: true });
        }
        window.addEventListener('mouseup', handleDragStop, { signal });
        
        document.getElementById('confirm-booking-btn')?.addEventListener('click', () => {
            sessionStorage.setItem(FINAL_BOOKING_HALL, JSON.stringify(state.currentHall));
            sessionStorage.setItem(FINAL_BOOKING_SLOTS, JSON.stringify(state.selectedSlots));
            sessionStorage.setItem(FINAL_BOOKING_AVAILABILITY, JSON.stringify(state.availabilityData.filter(d => d.hallId === state.currentHallId)));
            sessionStorage.removeItem(STORAGE_KEY_PREFIX + state.currentHallId);
            window.location.hash = `#final-booking-form-view?id=${state.currentHallId}`;
        }, { signal });
    }

    function cleanup() {
        if (abortController) abortController.abort();
        window.removeEventListener('mouseup', handleDragStop);
    }

    async function initialize(hallId) {
        state = { currentHallId: hallId, currentDate: new Date(), availabilityData: [], selectedSlots: [], isDragging: false, dragSelectionMode: 'add' };
        loadStateFromSession();
        try {
            const [allHalls, availability] = await Promise.all([fetchBookingHalls(), fetchHallAvailability(hallId)]);
            state.availabilityData = availability;
            const hall = allHalls.find(h => h.id === hallId);
            if (hall) {
                state.currentHall = hall;
                renderHallDetails(hall);
                renderBookingGrid();
                setupEventHandlers();
            } else {
                document.getElementById('hall-booking-details-view').innerHTML = `<p class="text-center text-red-400 py-20">Error: Hall not found.</p>`;
            }
        } catch (error) {
            console.error('Error initializing view:', error);
            document.getElementById('hall-booking-details-view').innerHTML = `<p class="text-center text-red-400 py-20">Failed to load details.</p>`;
        }
    }

    return { initialize, cleanup };
})();