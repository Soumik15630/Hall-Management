window.BrowseBookView = (function() {
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

    let allBookingHalls = {};
    let schoolsData = {}; // This will be populated lazily for filters
    let abortController;

    const SESSION_STORAGE_KEY = 'browseBookState';

    const getDefaultState = () => ({
        hallType: 'Seminar',
        viewMode: 'with-image',
        filters: { school: 'All', department: 'All', fromDate: '', toDate: '', capacity: null, features: [], timeSlots: [] }
    });
    let state = getDefaultState();

    // --- API & DATA HANDLING ---
    async function fetchFromAPI(endpoint, options = {}, isJson = true) {
        const headers = getAuthHeaders();
        if (!headers) { logout(); throw new Error("User not authenticated"); }
        const fullUrl = AppConfig.apiBaseUrl + endpoint;
        const config = { ...options, headers };
        const response = await fetch(fullUrl, config);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error on ${endpoint}: ${response.status} - ${errorText}`);
        }
        if (isJson) {
            const text = await response.text();
            return text ? (JSON.parse(text).data || JSON.parse(text)) : null;
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
        if (type === 'SEMINAR') return 'Seminar';
        if (type === 'LECTURE') return 'Lecture Hall';
        if (type === 'CONFERENCE') return 'Conference Hall';
        if (type === 'AUDITORIUM') return 'Auditorium';
        return formatTitleCase(apiType);
    }

    // Use the cache for fetching schools and departments
    async function fetchRawSchools() {
        return await window.apiCache.fetch('schools', () => fetchFromAPI(AppConfig.endpoints.allschool));
    }
    async function fetchRawDepartments() {
        return await window.apiCache.fetch('departments', () => fetchFromAPI(AppConfig.endpoints.alldept));
    }

    async function getSchoolsDataForFilters() {
        // This function specifically gets and processes data for the filter UI
        if (Object.keys(schoolsData).length > 0) return schoolsData; // Return if already loaded

        const [schools, departments] = await Promise.all([fetchRawSchools(), fetchRawDepartments()]);
        const schoolsMap = {};
        schools.forEach(school => { schoolsMap[school.school_name] = []; });
        departments.forEach(dept => {
            const school = schools.find(s => s.unique_id === dept.school_id);
            if (school && schoolsMap[school.school_name]) {
                schoolsMap[school.school_name].push(dept.department_name);
            }
        });
        schoolsData = schoolsMap; // Cache it locally for this view
        return schoolsData;
    }

    async function fetchBookingHalls() {
        // CORRECTED: Fetch all three endpoints to correctly map names from IDs.
        const [rawHalls, schools, departments] = await Promise.all([
            fetchFromAPI(AppConfig.endpoints.allHall),
            fetchRawSchools(),
            fetchRawDepartments()
        ]);
        const schoolMap = new Map(schools.map(s => [s.unique_id, s.school_name]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d.department_name]));
        
        const allHalls = rawHalls.map(hall => ({
            id: hall.unique_id,
            name: hall.name,
            type: mapHallType(hall.type),
            location: `${schoolMap.get(hall.school_id) || 'N/A'}${departmentMap.has(hall.department_id) ? ' - ' + departmentMap.get(hall.department_id) : ''}`,
            capacity: hall.capacity,
            school: schoolMap.get(hall.school_id) || 'N/A',
            department: departmentMap.get(hall.department_id) || 'N/A',
            features: Array.isArray(hall.features) ? hall.features.map(formatTitleCase) : [],
            ...hall
        }));

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

    // --- UI Rendering & Filtering ---
    function populateFilters() {
        const schoolInput = document.getElementById('school-filter-input');
        const schoolOptions = document.getElementById('school-filter-options');
        const deptInput = document.getElementById('dept-filter-input');
        const deptOptions = document.getElementById('dept-filter-options');

        const populateSchools = (term = '') => {
            const filtered = Object.keys(schoolsData).filter(s => s.toLowerCase().includes(term.toLowerCase()));
            schoolOptions.innerHTML = '<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="All">All Schools</div>' + filtered.map(s => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${s}">${s}</div>`).join('');
        };
        const populateDepts = (school = 'All', term = '') => {
            const depts = (school === 'All') ? [...new Set(Object.values(schoolsData).flat())] : (schoolsData[school] || []);
            const filtered = depts.filter(d => d.toLowerCase().includes(term.toLowerCase()));
            deptOptions.innerHTML = '<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="All">All Departments</div>' + filtered.map(d => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${d}">${d}</div>`).join('');
        };
        
        populateSchools(schoolInput.value);
        populateDepts(document.getElementById('school-filter').value, deptInput.value);
    }
    
    function applyFiltersAndRender() {
        const { filters, hallType } = state;
        let hallsToDisplay = allBookingHalls[hallType] || [];

        if (filters.school !== 'All') hallsToDisplay = hallsToDisplay.filter(h => h.school === filters.school);
        if (filters.department !== 'All') hallsToDisplay = hallsToDisplay.filter(h => h.department === filters.department);
        if (filters.capacity) {
            const range = { 'less-50': [0, 49], '50-100': [50, 100], 'more-100': [101, Infinity] }[filters.capacity];
            if(range) hallsToDisplay = hallsToDisplay.filter(h => h.capacity >= range[0] && h.capacity <= range[1]);
        }
        if (filters.features.length > 0) {
            hallsToDisplay = hallsToDisplay.filter(h => filters.features.every(f => h.features.includes(f)));
        }
        
        renderFilteredResults(hallsToDisplay);
    }
    
    function renderFilteredResults(halls) {
        document.getElementById('hall-listing-title').textContent = `${state.hallType} (${halls.length})`;
        const cardsContainer = document.getElementById('hall-cards-container');
        const tableContainer = document.getElementById('hall-table-container');
        const renderCards = state.viewMode === 'with-image' || state.viewMode === 'no-image';
        
        cardsContainer.classList.toggle('hidden', !renderCards);
        tableContainer.classList.toggle('hidden', renderCards);

        if (halls.length === 0) {
            const emptyHtml = `<div class="col-span-full text-center py-10 text-slate-400">No halls match the selected criteria.</div>`;
            if (renderCards) cardsContainer.innerHTML = emptyHtml;
            else tableContainer.innerHTML = emptyHtml;
            return;
        }

        if (renderCards) {
            cardsContainer.innerHTML = halls.map(hall => `
                <div data-hall-id="${hall.id}" class="hall-card bg-slate-900/70 rounded-lg border border-slate-700 flex flex-col">
                    ${state.viewMode === 'with-image' ? `<img src="https://placehold.co/600x400/0f172a/93c5fd?text=${hall.name.replace(/\s/g,'+')}" alt="${hall.name}" class="w-full h-32 object-cover rounded-t-lg">` : ''}
                    <div class="p-4 flex flex-col flex-grow justify-between">
                        <div>
                            <h4 class="font-bold text-blue-400">${hall.name}</h4>
                            <p class="text-sm text-slate-300 mt-1">${hall.location}</p><p class="text-sm text-slate-400 mt-2">Capacity: ${hall.capacity}</p>
                        </div>
                        <div class="flex gap-2 mt-4">
                            <button data-action="view-details" class="flex-1 px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-lg">View</button>
                            <button data-action="book-now" class="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Book</button>
                        </div>
                    </div>
                </div>`).join('');
        } else {
             tableContainer.innerHTML = `<div class="overflow-auto"><table class="min-w-full divide-y divide-slate-700">
                <thead class="bg-slate-900/50"><tr>
                    <th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Hall</th><th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Location</th>
                    <th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Capacity</th><th class="px-3 py-3.5 text-left text-sm font-semibold text-white">Actions</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-800 bg-slate-900/30">${halls.map(hall => `
                    <tr data-hall-id="${hall.id}" class="hover:bg-slate-800/50">
                        <td class="px-3 py-4 text-sm"><div class="font-medium text-blue-400">${hall.name}</div></td>
                        <td class="px-3 py-4 text-sm text-slate-300">${hall.location}</td>
                        <td class="px-3 py-4 text-sm text-slate-300">${hall.capacity}</td>
                        <td class="px-3 py-4 text-sm"><div class="flex gap-2">
                            <button data-action="view-details" class="px-3 py-1 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-md">View</button>
                            <button data-action="book-now" class="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md">Book</button>
                        </div></td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
        }
    }

    // --- State & Event Handling ---
    function saveStateToSession() { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state)); }
    function loadStateFromSession() {
        const savedState = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedState) {
            const parsed = JSON.parse(savedState);
            state = { ...getDefaultState(), ...parsed, filters: { ...getDefaultState().filters, ...parsed.filters } };
        }
    }

    function handleFilterChange() {
        state.filters.school = document.getElementById('school-filter').value;
        state.filters.department = document.getElementById('dept-filter').value;
        state.viewMode = document.getElementById('view-mode-select').value;
        state.filters.capacity = document.querySelector('input[name="capacity"]:checked')?.value || null;
        state.filters.features = [...document.querySelectorAll('input[data-feature]:checked')].map(cb => cb.dataset.feature);
        state.filters.timeSlots = [...document.querySelectorAll('#time-slot-buttons button.selected')].map(btn => btn.dataset.time);
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

        const populateSchoolOptions = (term = '') => {
            const filtered = Object.keys(schoolsData).filter(s => s.toLowerCase().includes(term.toLowerCase()));
            schoolOptions.innerHTML = '<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="All">All Schools</div>' + filtered.map(s => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${s}">${s}</div>`).join('');
        };
        const populateDeptOptions = (school = 'All', term = '') => {
            const depts = (school === 'All') ? [...new Set(Object.values(schoolsData).flat())] : (schoolsData[school] || []);
            const filtered = depts.filter(d => d.toLowerCase().includes(term.toLowerCase()));
            deptOptions.innerHTML = '<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="All">All Departments</div>' + filtered.map(d => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${d}">${d}</div>`).join('');
        };

        schoolInput.addEventListener('focus', async () => {
            await getSchoolsDataForFilters(); // Lazy load data
            populateSchoolOptions(schoolInput.value);
            schoolOptions.classList.remove('hidden');
        });
        deptInput.addEventListener('focus', async () => {
            await getSchoolsDataForFilters(); // Lazy load data
            populateDeptOptions(schoolHidden.value, deptInput.value);
            deptOptions.classList.remove('hidden');
        });

        schoolInput.addEventListener('input', () => populateSchoolOptions(schoolInput.value));
        schoolOptions.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                schoolHidden.value = value;
                schoolInput.value = value === 'All' ? '' : value;
                deptHidden.value = 'All';
                deptInput.value = '';
                populateDeptOptions(value, '');
                handleFilterChange();
                schoolOptions.classList.add('hidden');
            }
        });
        deptInput.addEventListener('input', () => populateDeptOptions(schoolHidden.value, deptInput.value));
        deptOptions.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                deptHidden.value = value;
                deptInput.value = value === 'All' ? '' : value;
                handleFilterChange();
                deptOptions.classList.add('hidden');
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
            if (target.matches('.hall-type-btn')) {
                state = { ...getDefaultState(), hallType: target.dataset.hallType };
                applyFiltersAndRender();
                saveStateToSession();
            } else if (target.closest('#time-slot-buttons > button')) {
                target.closest('button').classList.toggle('selected');
                handleFilterChange();
            } else if (target.closest('[data-action]')) {
                 const button = target.closest('[data-action]');
                 const hallId = button.closest('[data-hall-id]').dataset.hallId;
                 if (button.dataset.action === 'view-details') window.location.hash = `#hall-booking-details-view?id=${hallId}`;
                 if (button.dataset.action === 'book-now') window.location.hash = `#final-booking-form-view?id=${hallId}`;
            }
        }, { signal });
        container.addEventListener('change', e => {
            if(e.target.matches('input[name="capacity"], input[data-feature], #view-mode-select')) handleFilterChange();
        }, { signal });
    }
    
    function cleanup() { if (abortController) abortController.abort(); }

    async function initialize() {
        loadStateFromSession();
        try {
            allBookingHalls = await fetchBookingHalls();
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error("Failed to initialize Browse & Book view:", error);
            document.getElementById('hall-cards-container').innerHTML = `<div class="col-span-full text-center py-10 text-red-400">Error loading view data.</div>`;
        }
    }

    return { initialize, cleanup };
})();
