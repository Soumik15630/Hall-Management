// Hall Details View Module
window.HallDetailsView = (function() {

    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        date: { from: '', to: '' },
        hall: { name: '', capacity: '' },
        belongsTo: { school: '', department: '' },
        features: [],
        incharge: { name: '' },
        status: '' // 'available', 'unavailable', or ''
    });

    let state = {
        allHalls: [],
        filteredHalls: [],
        selectedRows: [], // Stores hall codes of selected rows
        multiSelection: false,
        filters: defaultFilters()
    };

    let schoolsDataCache = null;
    let employeeDataCache = null;
    let abortController;

    // --- UTILITY FUNCTIONS ---
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

    async function getSchoolsAndDepartments() {
        if (schoolsDataCache) return schoolsDataCache;
        const [schools, departments] = await Promise.all([
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);
        schoolsDataCache = { schools, departments };
        return schoolsDataCache;
    }

    function getFeatures() {
        return [
            'AC', 'PROJECTOR', 'WIFI', 'SMART_BOARD', 'COMPUTER',
            'AUDIO_SYSTEM', 'PODIUM', 'WHITE_BOARD', 'BLACK_BOARD', 'LIFT', 'RAMP'
        ].sort();
    }

    async function fetchHallsForHOD() {
        const [rawHalls, { schools, departments }] = await Promise.all([
            ApiService.halls.getAll(),
            getSchoolsAndDepartments()
        ]);

        const schoolMap = new Map(schools.map(s => [s.unique_id, s]));
        const departmentMap = new Map(departments.map(d => [d.unique_id, d]));

        return rawHalls.map(hall => {
            const dept = departmentMap.get(hall.department_id);
            const school = schoolMap.get(hall.school_id) || schoolMap.get(dept?.school_id);

            let schoolName = 'N/A';
            let departmentName = 'N/A';
            let incharge = { name: 'N/A', role: 'N/A', email: 'N/A', phone: 'N/A' };

            if (hall.belongs_to === 'DEPARTMENT' && dept) {
                schoolName = school ? school.school_name : 'N/A';
                departmentName = dept.department_name;
                incharge = { name: dept.incharge_name, role: 'HOD', email: dept.incharge_email, phone: dept.incharge_contact_number };
            } else if (hall.belongs_to === 'SCHOOL' && school) {
                schoolName = school.school_name;
                incharge = { name: school.incharge_name, role: 'Dean', email: school.incharge_email, phone: school.incharge_contact_number };
            } else if (hall.belongs_to === 'ADMINISTRATION') {
                schoolName = 'Administration';
                departmentName = hall.section ? formatTitleCase(hall.section) : 'N/A';
            }

            return {
                ...hall,
                id: hall.unique_id,
                hallCode: hall.unique_id,
                hallName: hall.name,
                displayType: mapHallType(hall.type),
                displayFloor: formatTitleCase(hall.floor) + ' Floor',
                displayZone: formatTitleCase(hall.zone) + ' Zone',
                schoolName: schoolName,
                departmentName: departmentName,
                displayFeatures: Array.isArray(hall.features) ? hall.features.sort().map(formatTitleCase).join(', ') : '',
                inchargeName: incharge.name || 'N/A',
                inchargeRole: incharge.role || 'N/A',
                inchargeEmail: incharge.email || 'N/A',
                inchargePhone: incharge.phone || 'N/A',
                displayStatus: hall.availability,
                displayDate: new Date(hall.created_at).toLocaleDateString(),
            };
        });
    }

    // --- FILTERING LOGIC ---
    function applyFiltersAndRender() {
        const { date, hall, belongsTo, features, incharge, status } = state.filters;

        state.filteredHalls = state.allHalls.filter(h => {
            if (date.from && new Date(h.created_at) < new Date(date.from)) return false;
            if (date.to) {
                const toDate = new Date(date.to);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(h.created_at) > toDate) return false;
            }
            if (hall.name && h.hallName !== hall.name) return false;
            if (hall.capacity && h.capacity < parseInt(hall.capacity, 10)) return false;
            if (belongsTo.school && h.schoolName !== belongsTo.school) return false;
            if (belongsTo.department && h.departmentName !== belongsTo.department) return false;
            if (incharge.name && h.inchargeName !== incharge.name) return false;
            if (status && (status === 'available' ? !h.displayStatus : h.displayStatus)) return false;
            if (features.length > 0 && !features.every(feature => h.features.includes(feature))) return false;

            return true;
        });

        renderHallTable();
    }

    // --- RENDERING ---
    function renderHallTable() {
        const tableBody = document.getElementById('hall-details-body');
        if (!tableBody) return;

        if (state.filteredHalls.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No details match the current filters.</td></tr>`;
            return;
        }

        const tableHtml = state.filteredHalls.map(hall => {
            const isSelected = state.selectedRows.includes(hall.hallCode);
            const statusColor = hall.displayStatus ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-400';
            const statusText = hall.displayStatus ? 'Available' : 'Unavailable';

            return `
            <tr data-hall-code="${hall.hallCode}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50 transition-colors">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500 text-blue-500 focus:ring-blue-500" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-300">${hall.displayDate}</td>

                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.hallName}</div>
                    <div class="text-slate-400">${hall.hallCode}</div>
                    <div class="text-slate-400">Capacity: ${hall.capacity}</div>
                    <div class="text-slate-400">${hall.displayFloor}</div>
                    <div class="text-slate-400">${hall.displayZone}</div>
                </td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.schoolName}</div>
                    <div class="text-slate-400">${hall.departmentName}</div>
                </td>
                <td class="px-3 py-4 text-sm text-slate-300">${hall.displayFeatures}</td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.inchargeName}</div>
                    <div class="text-slate-400">${hall.inchargeRole}</div>
                    <div class="text-slate-400">${hall.inchargeEmail}</div>
                    <div class="text-slate-400">${hall.inchargePhone}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}">${statusText}</span>
                </td>
            </tr>
        `
        }).join('');

        tableBody.innerHTML = tableHtml;
        updateActionButtonsState();
        updateFilterIcons();
        if (window.lucide) lucide.createIcons();
    }

    function updateFilterIcons() {
        document.querySelectorAll('#hall-details-view .filter-icon').forEach(icon => {
            const column = icon.dataset.filterColumn;
            let isActive = false;
            switch(column) {
                case 'date': isActive = state.filters.date.from || state.filters.date.to; break;
                case 'hall': isActive = state.filters.hall.name || state.filters.hall.capacity; break;
                case 'belongsTo': isActive = state.filters.belongsTo.school || state.filters.belongsTo.department; break;
                case 'features': isActive = state.filters.features.length > 0; break;
                case 'incharge': isActive = state.filters.incharge.name; break;
                case 'status': isActive = !!state.filters.status; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    // --- UI & STATE UPDATES ---
    function updateActionButtonsState() {
        const selectedCount = state.selectedRows.length;
        const statusBtn = document.getElementById('status-btn');
        const featuresBtn = document.getElementById('features-btn');
        const selectAllCheckbox = document.getElementById('select-all-checkbox');

        if(statusBtn) statusBtn.disabled = selectedCount === 0;
        if(featuresBtn) featuresBtn.disabled = selectedCount !== 1;

        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = !state.multiSelection;
            selectAllCheckbox.checked = state.multiSelection && selectedCount > 0 && selectedCount === state.filteredHalls.length;
        }
    }

    function handleRowSelection(hallCode, isChecked) {
        if (!state.multiSelection) {
            state.selectedRows = isChecked ? [hallCode] : [];
        } else {
            if (isChecked && !state.selectedRows.includes(hallCode)) {
                state.selectedRows.push(hallCode);
            } else if (!isChecked) {
                state.selectedRows = state.selectedRows.filter(code => code !== hallCode);
            }
        }
        renderHallTable();
    }

    // --- MODAL HANDLING ---
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        const backdrop = document.getElementById('modal-backdrop');
        if (!modal || !backdrop) return;

        backdrop.classList.remove('hidden');
        backdrop.classList.remove('opacity-0');
        modal.classList.remove('hidden');
    }

    function closeModal() {
        const backdrop = document.getElementById('modal-backdrop');
        if(backdrop) {
            backdrop.classList.add('opacity-0');
            setTimeout(() => backdrop.classList.add('hidden'), 300);
        }
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.id.startsWith('filter-modal-')) {
                modal.remove();
            } else {
                modal.classList.add('hidden');
            }
        });
    }

    function populateFeaturesModal(hall) {
        const container = document.getElementById('features-checkbox-container');
        if (!container) return;

        const allFeatures = getFeatures();
        const currentFeatures = hall.features || [];

        container.innerHTML = allFeatures.map(feature => `
            <label class="flex items-center text-slate-300">
                <input type="checkbox" value="${feature}"
                       class="form-checkbox h-4 w-4 bg-slate-700 text-blue-500 border-slate-600 rounded focus:ring-blue-500 mr-2"
                       ${currentFeatures.includes(feature) ? 'checked' : ''}>
                ${formatTitleCase(feature)}
            </label>
        `).join('');
    }

    function createFilterModal(column, title, contentHtml) {
        const container = document.getElementById('filter-modal-container');
        if (!container) return;

        const modalId = `filter-modal-${column}`;
        const existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();

        const modalHtml = `
        <div id="${modalId}" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="modal-content relative bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all">
                <h3 class="text-lg font-bold text-white mb-4">${title}</h3>
                <div id="filter-form-${column}" class="space-y-4 text-slate-300">
                    ${contentHtml}
                </div>
                <div class="mt-6 flex justify-between gap-4">
                    <button data-action="clear-filter" data-column="${column}" class="px-4 py-2 text-sm font-semibold text-blue-400 hover:text-blue-300">Clear Filter</button>
                    <div class="flex gap-4">
                        <button class="modal-close-btn px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-600 hover:bg-slate-700 rounded-lg transition">Cancel</button>
                        <button data-action="apply-filter" data-column="${column}" class="glowing-btn px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Apply</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        container.insertAdjacentHTML('beforeend', modalHtml);
    }

    function setupSearchableDropdown(inputId, optionsId, hiddenId, data, onSelect = () => {}) {
        const input = document.getElementById(inputId);
        const optionsContainer = document.getElementById(optionsId);
        const hiddenInput = document.getElementById(hiddenId);

        if (!input || !optionsContainer || !hiddenInput) return;

        const populateOptions = (term = '', customData = data) => {
            const filteredData = customData.filter(item => item.toLowerCase().includes(term.toLowerCase()));
            optionsContainer.innerHTML = filteredData.map(item => `<div class="p-2 cursor-pointer hover:bg-slate-700" data-value="${item}">${item}</div>`).join('');
        };

        input.addEventListener('focus', () => {
            populateOptions(input.value);
            optionsContainer.classList.remove('hidden');
        });

        input.addEventListener('input', () => {
            populateOptions(input.value);
            if (!data.includes(input.value)) {
                hiddenInput.value = '';
            }
            onSelect(null);
        });

        optionsContainer.addEventListener('mousedown', e => {
            const { value } = e.target.dataset;
            if (value) {
                hiddenInput.value = value;
                input.value = value;
                optionsContainer.classList.add('hidden');
                onSelect(value);
            }
        });

        input.addEventListener('blur', () => setTimeout(() => optionsContainer.classList.add('hidden'), 150));

        if (hiddenInput.value) {
            input.value = hiddenInput.value;
        }

        return (newData) => {
            data = newData;
            populateOptions(input.value, newData);
        };
    }

    async function openFilterModalFor(column) {
        let title, contentHtml;
        switch (column) {
            case 'date':
                title = 'Filter by Date';
                contentHtml = `
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label for="filter-from-date" class="block text-sm font-medium mb-1">From</label>
                            <input type="date" id="filter-from-date" value="${state.filters.date.from}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        </div>
                        <div>
                            <label for="filter-to-date" class="block text-sm font-medium mb-1">To</label>
                            <input type="date" id="filter-to-date" value="${state.filters.date.to}" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                        </div>
                    </div>`;
                break;
            case 'hall':
                title = 'Filter by Hall Details';
                contentHtml = `
                    <div>
                        <label for="filter-hall-name-input" class="block text-sm font-medium mb-1">Hall Name</label>
                        <div class="relative">
                            <input type="text" id="filter-hall-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a hall..." autocomplete="off">
                            <div id="filter-hall-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-hall-name" value="${state.filters.hall.name}">
                    </div>
                    <div>
                        <label for="filter-hall-capacity" class="block text-sm font-medium mb-1">Minimum Capacity</label>
                        <input type="number" id="filter-hall-capacity" value="${state.filters.hall.capacity}" placeholder="e.g., 50" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white">
                    </div>`;
                break;
            case 'belongsTo':
                title = 'Filter by School/Department';
                contentHtml = `
                    <div>
                        <label for="filter-school-input" class="block text-sm font-medium mb-1">School</label>
                        <div class="relative">
                            <input type="text" id="filter-school-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a school..." autocomplete="off">
                            <div id="filter-school-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-school" value="${state.filters.belongsTo.school}">
                    </div>
                    <div>
                        <label for="filter-department-input" class="block text-sm font-medium mb-1">Department</label>
                        <div class="relative">
                            <input type="text" id="filter-department-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for a department..." autocomplete="off">
                            <div id="filter-department-options" class="absolute z-10 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-department" value="${state.filters.belongsTo.department}">
                    </div>`;
                break;
            case 'features':
                title = 'Filter by Features';
                const allFeatures = getFeatures();
                const featureCheckboxes = allFeatures.map(f => `
                    <label class="flex items-center">
                        <input type="checkbox" value="${f}" class="feature-filter-cb form-checkbox h-4 w-4 bg-slate-800 text-blue-500 border-slate-600 rounded focus:ring-blue-500 mr-2" ${state.filters.features.includes(f) ? 'checked' : ''}>
                        ${formatTitleCase(f)}
                    </label>`).join('');
                contentHtml = `<div class="grid grid-cols-2 gap-2">${featureCheckboxes}</div>`;
                break;
            case 'incharge':
                title = 'Filter by Incharge Name';
                contentHtml = `
                    <div>
                        <label for="filter-incharge-name-input" class="block text-sm font-medium mb-1">Incharge Name</label>
                        <div class="relative">
                            <input type="text" id="filter-incharge-name-input" class="glowing-input w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Search for an incharge..." autocomplete="off">
                            <div id="filter-incharge-name-options" class="absolute z-20 w-full bg-slate-900 border border-slate-600 rounded-lg mt-1 hidden max-h-48 overflow-y-auto"></div>
                        </div>
                        <input type="hidden" id="filter-incharge-name" value="${state.filters.incharge.name}">
                    </div>`;
                break;
            case 'status':
                title = 'Filter by Status';
                contentHtml = `
                    <fieldset class="flex gap-6">
                        <label class="flex items-center"><input type="radio" name="filter-status-option" value="" ${state.filters.status === '' ? 'checked' : ''} class="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500 mr-2">Any</label>
                        <label class="flex items-center"><input type="radio" name="filter-status-option" value="available" ${state.filters.status === 'available' ? 'checked' : ''} class="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500 mr-2">Available</label>
                        <label class="flex items-center"><input type="radio" name="filter-status-option" value="unavailable" ${state.filters.status === 'unavailable' ? 'checked' : ''} class="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-red-500 focus:ring-red-500 mr-2">Unavailable</label>
                    </fieldset>`;
                break;
            default: return;
        }
        createFilterModal(column, title, contentHtml);

        if (column === 'hall') {
            const hallNames = [...new Set(state.allHalls.map(h => h.hallName))].sort();
            setupSearchableDropdown('filter-hall-name-input', 'filter-hall-name-options', 'filter-hall-name', hallNames);
        }
        if (column === 'belongsTo') {
            const { schools, departments } = await getSchoolsAndDepartments();
            const schoolNames = schools.map(s => s.school_name).sort();
            const allDepartmentNames = departments.map(d => d.department_name).sort();

            const deptInput = document.getElementById('filter-department-input');
            const deptHidden = document.getElementById('filter-department');

            const updateDeptDropdown = setupSearchableDropdown('filter-department-input', 'filter-department-options', 'filter-department', allDepartmentNames);

            setupSearchableDropdown('filter-school-input', 'filter-school-options', 'filter-school', schoolNames, (selectedSchoolName) => {
                deptInput.value = '';
                deptHidden.value = '';

                if (selectedSchoolName) {
                    const selectedSchool = schools.find(s => s.school_name === selectedSchoolName);
                    if (selectedSchool) {
                        const relevantDepts = departments
                            .filter(d => d.school_id === selectedSchool.unique_id)
                            .map(d => d.department_name)
                            .sort();
                        updateDeptDropdown(relevantDepts);
                    }
                } else {
                    updateDeptDropdown(allDepartmentNames);
                }
            });

            const initialSchool = document.getElementById('filter-school').value;
            if(initialSchool) {
                 const selectedSchool = schools.find(s => s.school_name === initialSchool);
                 if(selectedSchool) {
                     const relevantDepts = departments
                        .filter(d => d.school_id === selectedSchool.unique_id)
                        .map(d => d.department_name)
                        .sort();
                     updateDeptDropdown(relevantDepts);
                 }
            }
        }
        if (column === 'incharge') {
            const inchargeNames = [...new Set(state.allHalls.map(h => h.inchargeName))].filter(name => name !== 'N/A').sort();
            setupSearchableDropdown('filter-incharge-name-input', 'filter-incharge-name-options', 'filter-incharge-name', inchargeNames);
        }

        openModal(`filter-modal-${column}`);
    }

    function handleApplyFilter(column) {
        const form = document.getElementById(`filter-form-${column}`);
        if (!form) return;

        switch (column) {
            case 'date':
                state.filters.date.from = form.querySelector('#filter-from-date').value;
                state.filters.date.to = form.querySelector('#filter-to-date').value;
                break;
            case 'hall':
                state.filters.hall.name = form.querySelector('#filter-hall-name').value;
                state.filters.hall.capacity = form.querySelector('#filter-hall-capacity').value;
                break;
            case 'belongsTo':
                state.filters.belongsTo.school = form.querySelector('#filter-school').value;
                state.filters.belongsTo.department = form.querySelector('#filter-department').value;
                break;
            case 'features':
                state.filters.features = Array.from(form.querySelectorAll('.feature-filter-cb:checked')).map(cb => cb.value);
                break;
            case 'incharge':
                state.filters.incharge.name = form.querySelector('#filter-incharge-name').value;
                break;
            case 'status':
                state.filters.status = form.querySelector('input[name="filter-status-option"]:checked').value;
                break;
        }
        applyFiltersAndRender();
        closeModal();
    }

    function handleClearFilter(column) {
        state.filters[column] = defaultFilters()[column];
        applyFiltersAndRender();
        closeModal();
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('hall-details-view');
        if (!view) return;

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
                return;
            }
            if (e.target.closest('#clear-hall-filters-btn')) {
                state.filters = defaultFilters();
                applyFiltersAndRender();
                return;
            }
            if (e.target.closest('#status-btn')) {
                 if (state.selectedRows.length > 0) {
                    openModal('update-status-modal');
                }
                return;
            }
            if (e.target.closest('#features-btn')) {
                if (state.selectedRows.length === 1) {
                    const selectedHall = state.allHalls.find(h => h.hallCode === state.selectedRows[0]);
                    if (selectedHall) {
                        populateFeaturesModal(selectedHall);
                        openModal('modify-features-modal');
                    }
                }
                return;
            }
        }, { signal });

        document.getElementById('filter-modal-container')?.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'apply-filter') handleApplyFilter(button.dataset.column);
            if (button.dataset.action === 'clear-filter') handleClearFilter(button.dataset.column);
        }, { signal });

        document.body.addEventListener('click', e => {
            if (e.target.closest('.modal-close-btn')) {
                closeModal();
            }
            if (e.target.id === 'clear-all-features') {
                const checkboxes = document.querySelectorAll('#features-checkbox-container input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = false);
            }
        }, { signal });

        document.getElementById('multiselect-toggle')?.addEventListener('change', e => {
            state.multiSelection = e.target.checked;
            if (!state.multiSelection) state.selectedRows = [];
            renderHallTable();
        }, { signal });

        document.getElementById('select-all-checkbox')?.addEventListener('change', e => {
            if (state.multiSelection) {
                state.selectedRows = e.target.checked ? state.filteredHalls.map(h => h.hallCode) : [];
                renderHallTable();
            }
        }, { signal });

        document.getElementById('hall-details-body')?.addEventListener('change', e => {
            if (e.target.classList.contains('row-checkbox')) {
                const hallCode = e.target.closest('tr').dataset.hallCode;
                handleRowSelection(hallCode, e.target.checked);
            }
        }, { signal });

        const statusModal = document.getElementById('update-status-modal');
        if (statusModal) {
            statusModal.addEventListener('change', e => {
                if (e.target.name === 'status-option') {
                    const reasonContainer = document.getElementById('status-reason-container');
                    const dateRangeContainer = document.getElementById('status-date-range');
                    if (e.target.value === 'false') {
                        reasonContainer.classList.remove('hidden');
                        dateRangeContainer.classList.remove('hidden');
                    } else {
                        reasonContainer.classList.add('hidden');
                        dateRangeContainer.classList.add('hidden');
                    }
                }
            }, { signal });
        }

        document.getElementById('submit-status-update')?.addEventListener('click', async () => {
            const newStatus = document.querySelector('input[name="status-option"]:checked').value === 'true';
            const payload = { availability: newStatus };

            if (!newStatus) {
                payload.unavailability_reason = document.getElementById('status-reason-select').value;
                const fromDate = document.getElementById('status-from-date').value;
                const toDate = document.getElementById('status-to-date').value;
                if (!payload.unavailability_reason || !fromDate || !toDate) {
                    alert("Reason and dates are required for unavailability.");
                    return;
                }
                // These date fields may or may not be in the API, add if they are
                // payload.unavailability_from_date = fromDate;
                // payload.unavailability_to_date = toDate;
            } else {
                 payload.unavailability_reason = null; // Explicitly clear reason when available
            }

            try {
                const updatePromises = state.selectedRows.map(hallId => 
                    ApiService.halls.update(hallId, payload)
                );

                await Promise.all(updatePromises);

                closeModal();
                await initialize();
                state.selectedRows = [];
                updateActionButtonsState();
            } catch (error) {
                console.error('Failed to update status:', error);
                alert(`Failed to update status: ${error.message}`);
            }
        }, { signal });

        document.getElementById('submit-features-update')?.addEventListener('click', async () => {
            const selectedHallCode = state.selectedRows[0];
            if (!selectedHallCode) return;

            const selectedFeatures = Array.from(document.querySelectorAll('#features-checkbox-container input:checked')).map(cb => cb.value);

            const payload = { features: selectedFeatures };

            try {
                await ApiService.halls.update(selectedHallCode, payload);
                closeModal();
                await initialize();
                state.selectedRows = [];
                updateActionButtonsState();
            } catch (error) {
                console.error('Failed to update features:', error);
                alert(`Failed to update features: ${error.message}`);
            }
        }, { signal });
    }

    function cleanup() {
        if(abortController) abortController.abort();
        state = {
            allHalls: [],
            filteredHalls: [],
            selectedRows: [],
            multiSelection: false,
            filters: defaultFilters()
        };
        const multiSelectToggle = document.getElementById('multiselect-toggle');
        if(multiSelectToggle) multiSelectToggle.checked = false;
        closeModal();
    }

    async function initialize() {
        try {
            const halls = await fetchHallsForHOD();
            state.allHalls = halls;
            applyFiltersAndRender();
            setupEventHandlers();
        } catch (error) {
            console.error('Error loading hall details:', error);
            const tableBody = document.getElementById('hall-details-body');
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load hall data. Please try again.</td></tr>`;
        }
    }

    return {
        initialize,
        cleanup
    };
})();
