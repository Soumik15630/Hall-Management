window.BrowseBookView = (function() {
    // --- START: Simple API Cache (REMOVED as ApiService handles this implicitly) ---

    let allHalls = []; // Flat array of all halls
    let schoolsData = {}; // For dropdown compatibility
    let schoolOptions = [];
    let departmentOptions = [];
    let abortController;

    const SESSION_STORAGE_KEY = 'browseBookState';

    const getDefaultState = () => ({
        hallType: 'Seminar', // Display format, maps to 'SEMINAR' in API
        viewMode: 'with-image',
        filters: {
            school: 'All',
            department: 'All',
            fromDate: '',
            toDate: '',
            capacity: null,
            features: [],
            timeSlots: []
        }
    });
    let state = getDefaultState();

    // Map display names to API types and vice versa
    const HALL_TYPE_MAPPING = {
        'Seminar': 'SEMINAR',
        'Auditorium': 'AUDITORIUM',
        'Lecture Hall': 'LECTURE',
        'Conference Hall': 'CONFERENCE',
        'Other': 'OTHER'
    };

    const API_TO_DISPLAY_MAPPING = {
        'SEMINAR': 'Seminar',
        'AUDITORIUM': 'Auditorium',
        'LECTURE': 'Lecture Hall',
        'CONFERENCE': 'Conference Hall',
        'OTHER': 'Other'
    };

    // --- API & DATA HANDLING (Updated to use ApiService) ---

    // The local fetchFromAPI, fetchRawSchools, and fetchRawDepartments functions have been REMOVED.

    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt =>
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    async function getSchoolsDataForFilters() {
        if (Object.keys(schoolsData).length > 0) return schoolsData;

        try {
            // UPDATED: Now uses the centralized ApiService
            const [schools, departments] = await Promise.all([
                ApiService.organization.getSchools(),
                ApiService.organization.getDepartments()
            ]);

            // Build schoolOptions and departmentOptions for new system
            schoolOptions = schools.map(s => ({ value: s.school_name, label: s.school_name, id: s.unique_id }));
            departmentOptions = departments.map(d => ({
                value: d.department_name,
                label: d.department_name,
                id: d.unique_id,
                schoolId: d.school_id
            }));

            // Build schoolsData for dropdown compatibility
            const schoolsMap = {};
            schools.forEach(school => {
                schoolsMap[school.school_name] = [];
            });
            departments.forEach(dept => {
                const school = schools.find(s => s.unique_id === dept.school_id);
                if (school && schoolsMap[school.school_name]) {
                    schoolsMap[school.school_name].push(dept.department_name);
                }
            });
            schoolsData = schoolsMap;
        } catch (error) {
            console.error("Error fetching data for filters:", error);
            schoolsData = {};
        }
        return schoolsData;
    }

    async function fetchBookingHalls() {
        console.log("Attempting to fetch booking halls...");
        try {
            // UPDATED: Now uses the centralized ApiService
            const [rawHalls, schools, departments] = await Promise.all([
                ApiService.halls.getAll(),
                ApiService.organization.getSchools(),
                ApiService.organization.getDepartments()
            ]);

            console.log("API Response (rawHalls):", rawHalls);

            const hallsArray = Array.isArray(rawHalls) ? rawHalls :
                               (rawHalls && Array.isArray(rawHalls.data)) ? rawHalls.data :
                               (rawHalls && Array.isArray(rawHalls.halls)) ? rawHalls.halls :
                               null;

            console.log("Extracted hallsArray for processing:", hallsArray);

            if (!hallsArray) {
                console.warn("Could not find a valid array of halls in the API response. Returning empty array.");
                allHalls = [];
                return [];
            }

            const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
            const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

            const processedHalls = hallsArray.map((hall, index) => {
                const dept = hall.department_id ? departmentMap.get(hall.department_id) : null;
                const school = hall.school_id ? schoolMap.get(hall.school_id) : null;
                const incharge = dept
                    ? { name: dept.incharge_name || 'N/A', designation: 'HOD', email: dept.incharge_email || 'N/A', intercom: dept.incharge_contact_number || 'N/A' }
                    : (school ? { name: school.incharge_name || 'N/A', designation: 'Dean', email: school.incharge_email || 'N/A', intercom: school.incharge_contact_number || 'N/A' }
                    : { name: 'N/A', designation: 'N/A', email: 'N/A', intercom: 'N/A' });

                return {
                    id: hall.unique_id || hall.id,
                    unique_id: hall.unique_id || hall.id,
                    name: hall.name || `Hall ${index + 1}`,
                    type: hall.type || 'OTHER', // Keep API format
                    displayType: API_TO_DISPLAY_MAPPING[hall.type] || 'Other', // For display
                    location: `${school ? school.school_name : 'N/A'}${dept ? ' - ' + dept.department_name : ''}`,
                    capacity: hall.capacity || 0,
                    school: school ? school.school_name : 'N/A',
                    department: dept ? dept.department_name : 'N/A',
                    school_id: hall.school_id,
                    department_id: hall.department_id,
                    features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase) : [],
                    floor: formatTitleCase(hall.floor),
                    zone: formatTitleCase(hall.zone),
                    availability: hall.availability !== false,
                    image_url: hall.image_url || `https://placehold.co/600x400/0f172a/93c5fd?text=${encodeURIComponent(hall.name)}`,
                    incharge: incharge,
                    ...hall
                };
            });
            
            // MODIFIED: Filter out unavailable halls immediately after processing
            allHalls = processedHalls.filter(hall => hall.availability === true);

            window.allHallsCache = allHalls;
            console.log("Final processed and available halls:", allHalls);
            return allHalls;

        } catch (error) {
            console.error("Error in fetchBookingHalls function:", error);
            allHalls = []; // Ensure allHalls is empty on error
            return [];
        }
    }

    // --- FILTERING & RENDERING (Unchanged) ---

    function getFilteredHalls() {
        if (!allHalls || !allHalls.length) return [];

        return allHalls.filter(hall => {
            // The check for availability is no longer needed here as `allHalls` is pre-filtered.
            const apiType = HALL_TYPE_MAPPING[state.hallType];
            if (apiType && hall.type !== apiType) return false;

            if (state.filters.school && state.filters.school !== 'All' && hall.school !== state.filters.school) {
                return false;
            }

            if (state.filters.department && state.filters.department !== 'All' && hall.department !== state.filters.department) {
                return false;
            }

            if (state.filters.capacity) {
                const capacity = hall.capacity;
                if (state.filters.capacity === 'less-50' && capacity >= 50) return false;
                if (state.filters.capacity === '50-100' && (capacity < 50 || capacity > 100)) return false;
                if (state.filters.capacity === 'more-100' && capacity <= 100) return false;
            }

            if (state.filters.features.length > 0) {
                const hallFeaturesLower = hall.features.map(f => f.toLowerCase());
                const allFeaturesMatch = state.filters.features.every(selectedFeature =>
                    hallFeaturesLower.includes(selectedFeature.toLowerCase())
                );
                if (!allFeaturesMatch) {
                    return false;
                }
            }

            return true;
        });
    }

    function renderFilteredResults(halls) {
        const titleElement = document.getElementById('hall-listing-title');
        const cardsContainer = document.getElementById('hall-cards-container');
        const tableContainer = document.getElementById('hall-table-container');

        if (titleElement) {
            titleElement.textContent = `${state.hallType} (${halls.length})`;
        }

        const mainContainer = cardsContainer || tableContainer;
        if (!mainContainer) {
             console.error("CRITICAL: Could not find main content containers ('hall-cards-container' or 'hall-table-container').");
             const fallbackContainer = document.querySelector('#browse-book-view .container, #browse-book-view > div, .hall-container');
             if(fallbackContainer) fallbackContainer.innerHTML = `<div class="text-center text-slate-400 p-8">Error: Could not find the main content area to display halls.</div>`;
            return;
        }

        const renderCards = state.viewMode === 'with-image' || state.viewMode === 'no-image';

        if (cardsContainer) cardsContainer.classList.toggle('hidden', !renderCards);
        if (tableContainer) tableContainer.classList.toggle('hidden', renderCards);

        if (halls.length === 0) {
            const emptyHtml = `<div class="col-span-full text-center py-10 text-slate-400">
                <p>No ${state.hallType.toLowerCase()} halls match the selected criteria.</p>
                <p class="text-sm mt-2">Try adjusting your filters or select a different hall type.</p>
            </div>`;
            if (renderCards && cardsContainer) cardsContainer.innerHTML = emptyHtml;
            else if (!renderCards && tableContainer) tableContainer.innerHTML = emptyHtml;
            return;
        }

        if (renderCards && cardsContainer) {
            const cardsHtml = halls.map(hall => {
                const imageUrl = hall.image_url;
                const hallId = hall.unique_id || hall.id;

                return `
                <div data-hall-id="${hallId}" class="hall-card bg-slate-900/70 rounded-lg border border-slate-700 flex flex-col overflow-hidden group">
                    ${state.viewMode === 'with-image' ? `
                    <div class="overflow-hidden bg-white p-4">
                        <img src="${imageUrl}" alt="${hall.name}"
                             class="w-full h-40 object-contain transition-transform duration-300 ease-in-out group-hover:scale-105"
                             onerror="this.src='https://placehold.co/600x400/0f172a/93c5fd?text=${encodeURIComponent(hall.name)}'">
                    </div>` : ''}
                    <div class="p-4 flex flex-col flex-grow justify-between">
                        <div>
                            <h4 class="font-bold text-blue-400">${hall.name}</h4>
                            <p class="text-sm text-slate-300 mt-1">${hall.location}</p>
                            <p class="text-sm text-slate-400 mt-2">Capacity: ${hall.capacity}</p>
                            ${hall.features.length > 0 ? `<p class="text-xs text-slate-500 mt-1">Features: ${hall.features.join(', ')}</p>` : ''}
                        </div>
                        <div class="flex gap-2 mt-4">
                            <button data-action="view-details" data-hall-id="${hallId}" class="flex-1 px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-lg">View</button>
                            <button data-action="book-now" data-hall-id="${hallId}" class="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Book</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
            cardsContainer.innerHTML = cardsHtml;
        } else if (!renderCards && tableContainer) {
            const tableHtml = `<div class="overflow-auto"><table class="min-w-full divide-y divide-slate-700">
                <thead class="bg-slate-900/50"><tr>
                    <th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Hall</th><th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Location</th>
                    <th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Capacity</th><th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Features</th>
                    <th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Actions</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-800 bg-slate-900/30">${halls.map(hall => {
                    const hallId = hall.unique_id || hall.id;
                    return `
                    <tr data-hall-id="${hallId}" class="hover:bg-slate-800/50">
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-blue-400">${hall.name}</div></td><td class="px-3 py-4 text-sm text-slate-300">${hall.location}</td>
                        <td class="px-3 py-4 text-sm text-slate-300">${hall.capacity}</td><td class="px-3 py-4 text-sm text-slate-400">${hall.features.join(', ') || 'None'}</td>
                        <td class="px-3 py-4 text-sm"><div class="flex gap-2">
                            <button data-action="view-details" data-hall-id="${hallId}" class="px-3 py-1 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-md">View</button>
                            <button data-action="book-now" data-hall-id="${hallId}" class="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md">Book</button>
                        </div></td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>`;
            tableContainer.innerHTML = tableHtml;
        }
    }

    async function applyFiltersAndRender() {
        const filteredHalls = getFilteredHalls();
        renderFilteredResults(filteredHalls);
    }

    function saveStateToSession() {
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    function loadStateFromSession() {
        try {
            const savedState = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                state = { ...getDefaultState(), ...parsed, filters: { ...getDefaultState().filters, ...parsed.filters } };
            }
        } catch (e) { state = getDefaultState(); }
    }

    function handleFilterChange() {
        const schoolFilter = document.getElementById('school-filter');
        const deptFilter = document.getElementById('dept-filter');
        const viewModeSelect = document.getElementById('view-mode-select');
        const fromDateInput = document.getElementById('from-date');
        const toDateInput = document.getElementById('to-date');

        if (schoolFilter) state.filters.school = schoolFilter.value || 'All';
        if (deptFilter) state.filters.department = deptFilter.value || 'All';
        if (viewModeSelect) state.viewMode = viewModeSelect.value;
        if (fromDateInput) state.filters.fromDate = fromDateInput.value;
        if (toDateInput) state.filters.toDate = toDateInput.value;

        const capacityChecked = document.querySelector('input[name="capacity"]:checked');
        state.filters.capacity = capacityChecked ? capacityChecked.value : null;
        state.filters.features = [...document.querySelectorAll('input[data-feature]:checked')].map(cb => cb.dataset.feature);
        state.filters.timeSlots = [...document.querySelectorAll('button.selected')].map(btn => btn.dataset.time).filter(Boolean);

        applyFiltersAndRender();
        saveStateToSession();
    }

    function setupFilterEventListeners() {
        const schoolInput = document.getElementById('school-filter-input');
        const schoolOptions = document.getElementById('school-filter-options');
        const schoolHidden = document.getElementById('school-filter');
        const deptInput = document.getElementById('dept-filter-input');
        const deptOptions = document.getElementById('dept-filter-options');
        const deptHidden = document.getElementById('dept-filter');

        if (!schoolInput || !schoolOptions || !schoolHidden || !deptInput || !deptOptions || !deptHidden) return;

        const populateSchoolOptions = (term = '') => {
            const filtered = Object.keys(schoolsData).filter(s => s.toLowerCase().includes(term.toLowerCase()));
            schoolOptions.innerHTML = '<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="All">All Schools</div>' + filtered.map(s => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${s}">${s}</div>`).join('');
        };
        const populateDeptOptions = (school = 'All', term = '') => {
            const depts = (school === 'All') ? [...new Set(Object.values(schoolsData).flat())] : (schoolsData[school] || []);
            const filtered = depts.filter(d => d.toLowerCase().includes(term.toLowerCase()));
            deptOptions.innerHTML = '<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="All">All Departments</div>' + filtered.map(d => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${d}">${d}</div>`).join('');
        };

        schoolInput.addEventListener('focus', async () => { await getSchoolsDataForFilters(); populateSchoolOptions(schoolInput.value); schoolOptions.classList.remove('hidden'); });
        deptInput.addEventListener('focus', async () => { await getSchoolsDataForFilters(); populateDeptOptions(schoolHidden.value, deptInput.value); deptOptions.classList.remove('hidden'); });

        schoolInput.addEventListener('input', () => populateSchoolOptions(schoolInput.value));
        schoolOptions.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                schoolHidden.value = value; schoolInput.value = value === 'All' ? '' : value;
                deptHidden.value = 'All'; deptInput.value = '';
                populateDeptOptions(value, ''); handleFilterChange(); schoolOptions.classList.add('hidden');
            }
        });
        deptInput.addEventListener('input', () => populateDeptOptions(schoolHidden.value, deptInput.value));
        deptOptions.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                deptHidden.value = value; deptInput.value = value === 'All' ? '' : value;
                handleFilterChange(); deptOptions.classList.add('hidden');
            }
        });

        schoolInput.addEventListener('blur', () => setTimeout(() => schoolOptions.classList.add('hidden'), 150));
        deptInput.addEventListener('blur', () => setTimeout(() => deptOptions.classList.add('hidden'), 150));
    }

    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const container = document.getElementById('browse-book-view');
        if(!container) return;

        setupFilterEventListeners();

        container.addEventListener('click', e => {
            const target = e.target;
            const button = target.closest('[data-action]');

            if (target.matches('.hall-type-btn')) {
                const newHallType = target.dataset.hallType;
                container.querySelectorAll('.hall-type-btn').forEach(btn => {
                    btn.classList.remove('bg-blue-600', 'text-white');
                    btn.classList.add('bg-slate-700', 'text-slate-300');
                });
                target.classList.add('bg-blue-600', 'text-white');
                target.classList.remove('bg-slate-700', 'text-slate-300');
                state.hallType = newHallType;
                applyFiltersAndRender();
                saveStateToSession();
            } else if (target.matches('#clear-capacity')) {
                e.preventDefault();
                document.querySelectorAll('input[name="capacity"]:checked').forEach(radio => radio.checked = false);
                handleFilterChange();
            } else if (target.matches('#clear-features')) {
                e.preventDefault();
                document.querySelectorAll('input[data-feature]:checked').forEach(cb => cb.checked = false);
                handleFilterChange();
            } else if (target.matches('button') && target.dataset.time) {
                target.classList.toggle('selected');
                target.classList.toggle('bg-blue-600'); target.classList.toggle('text-white');
                target.classList.toggle('bg-slate-700'); target.classList.toggle('text-slate-300');
                handleFilterChange();
            } else if (target.matches('#clear-timeslots')) {
                 e.preventDefault();
                container.querySelectorAll('button.selected[data-time]').forEach(btn => {
                    btn.classList.remove('selected', 'bg-blue-600', 'text-white');
                    btn.classList.add('bg-slate-700', 'text-slate-300');
                });
                handleFilterChange();
            } else if (button) {
                const hallId = button.dataset.hallId;
                if (!hallId) {
                    console.error('No hall ID found in button dataset');
                    return;
                }

                let hallData = allHalls.find(h => String(h.id) === String(hallId) || String(h.unique_id) === String(hallId));

                if (!hallData) {
                    console.error('Hall data not found for ID:', hallId);
                    if (window.showModal) {
                        showModal('Error: Hall data not found. Please try refreshing.');
                    } else {
                        alert('Error: Hall data not found. Please try refreshing.');
                    }
                    return;
                }

                if (button.dataset.action === 'view-details') {
                    sessionStorage.setItem('hallDetailsData', JSON.stringify(hallData));
                    window.location.hash = `#hall-booking-details-view?id=${hallId}`;
                } else if (button.dataset.action === 'book-now') {
                    sessionStorage.setItem('finalBookingHall', JSON.stringify(hallData));
                    window.location.hash = `#final-booking-form-view?id=${hallId}`;
                }
            }
        }, { signal });

        container.addEventListener('change', e => {
            if(e.target.matches('input[name="capacity"], input[data-feature], #view-mode-select, #from-date, #to-date')) {
                handleFilterChange();
            }
        }, { signal });
    }

    function initializeFormElements() {
        const schoolFilter = document.getElementById('school-filter');
        const deptFilter = document.getElementById('dept-filter');
        const viewModeSelect = document.getElementById('view-mode-select');

        if (schoolFilter) schoolFilter.value = state.filters.school || 'All';
        if (deptFilter) deptFilter.value = state.filters.department || 'All';
        if (viewModeSelect) viewModeSelect.value = state.viewMode || 'with-image';
    }

    function initializeTimeSlotButtons() {
        document.querySelectorAll('button').forEach(btn => {
            const text = btn.textContent.trim();
            if (text.match(/^\d{2}:\d{2}(am|pm)$/)) {
                btn.dataset.time = text;
                const isSelected = state.filters.timeSlots.includes(text);
                btn.classList.toggle('selected', isSelected);
                btn.classList.toggle('bg-blue-600', isSelected); btn.classList.toggle('text-white', isSelected);
                btn.classList.toggle('bg-slate-700', !isSelected); btn.classList.toggle('text-slate-300', !isSelected);
            }
        });
    }

    function cleanup() {
        if (abortController) abortController.abort();
    }

    async function initialize() {
        console.log("Initializing BrowseBookView...");
        loadStateFromSession();

        const mainContainer = document.getElementById('hall-cards-container') || document.getElementById('hall-table-container') || document.querySelector('#browse-book-view');
        if (mainContainer) {
            mainContainer.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400">Loading halls...</div>`;
        }

        try {
            await fetchBookingHalls();
            await getSchoolsDataForFilters();

            const currentTypeBtn = document.querySelector(`.hall-type-btn[data-hall-type="${state.hallType}"]`);
            if (currentTypeBtn) {
                document.querySelectorAll('.hall-type-btn').forEach(btn => {
                    btn.classList.remove('bg-blue-600', 'text-white');
                    btn.classList.add('bg-slate-700', 'text-slate-300');
                });
                currentTypeBtn.classList.add('bg-blue-600', 'text-white');
                currentTypeBtn.classList.remove('bg-slate-700', 'text-slate-300');
            }

            initializeFormElements();
            await applyFiltersAndRender();
            initializeTimeSlotButtons();
            setupEventHandlers();

            console.log("BrowseBookView initialized successfully.");

        } catch (error) {
            console.error("Initialization failed:", error);
            const errorHtml = `<div class="col-span-full text-center py-10 text-red-400">
                <h3 class="text-lg font-bold mb-2">Error loading halls</h3>
                <p>Details: ${error.message}</p>
                <p class="text-sm mt-2">Check the browser console for more information.</p>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Reload Page</button>
            </div>`;
            if (mainContainer) mainContainer.innerHTML = errorHtml;
        }
    }

    return {
        initialize,
        cleanup,
        getState: () => state,
        getAllHalls: () => allHalls,
        getFilteredHalls
    };
})();
