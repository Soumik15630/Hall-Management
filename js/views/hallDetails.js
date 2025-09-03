// Hall Details View Module (Updated to use FilterManager)
window.HallDetailsView = (function() {

    // --- STATE MANAGEMENT ---
    const defaultFilters = () => ({
        date: { from: '', to: '' },
        hall: { name: '', capacity: '', type: '' },
        belongsTo: { school: '', department: '' },
        features: [],
        incharge: { name: '' },
        status: '' // 'available', 'unavailable', or ''
    });

    let state = {
        allHalls: [],
        filteredHalls: [],
        selectedRows: [],
        multiSelection: false,
        filters: defaultFilters(),
        schoolsDataCache: null,
    };
    let abortController;

    // --- UTILITY & DATA FUNCTIONS ---
    function formatTitleCase(str) {
        if (!str) return 'N/A';
        return str.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }

    async function getSchoolsAndDepartments() {
        if (state.schoolsDataCache) return state.schoolsDataCache;
        const [schools, departments] = await Promise.all([
            ApiService.organization.getSchools(),
            ApiService.organization.getDepartments()
        ]);
        state.schoolsDataCache = { schools, departments };
        return state.schoolsDataCache;
    }

    function getFeatures() {
        return ['AC', 'PROJECTOR', 'WIFI', 'SMART_BOARD', 'COMPUTER', 'AUDIO_SYSTEM', 'PODIUM', 'WHITE_BOARD', 'BLACK_BOARD', 'LIFT', 'RAMP'].sort();
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
            let schoolName = hall.belongs_to === 'ADMINISTRATION' ? 'Administration' : (school ? school.school_name : 'N/A');
            let departmentName = hall.belongs_to === 'ADMINISTRATION' ? formatTitleCase(hall.section) : (dept ? dept.department_name : 'N/A');
            let incharge = (dept && hall.belongs_to === 'DEPARTMENT') ? { name: dept.incharge_name, role: 'HOD' } :
                           (school && hall.belongs_to === 'SCHOOL') ? { name: school.incharge_name, role: 'Dean' } :
                           { name: 'N/A', role: 'N/A' };

            return {
                ...hall,
                id: hall.unique_id,
                hallCode: hall.unique_id,
                hallName: hall.name,
                schoolName: schoolName,
                departmentName: departmentName,
                displayFeatures: Array.isArray(hall.features) ? hall.features.sort().map(formatTitleCase).join(', ') : '',
                inchargeName: incharge.name || 'N/A',
                inchargeRole: incharge.role || 'N/A',
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
            if (hall.type && h.type !== hall.type) return false;
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
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400">No details match filters.</td></tr>`;
            return;
        }

        tableBody.innerHTML = state.filteredHalls.map(hall => {
            const isSelected = state.selectedRows.includes(hall.hallCode);
            const statusColor = hall.displayStatus ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-400';
            const statusText = hall.displayStatus ? 'Available' : 'Unavailable';
            return `
            <tr data-hall-code="${hall.hallCode}" class="${isSelected ? 'bg-blue-900/30' : ''} hover:bg-slate-800/50">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6"><input type="checkbox" class="row-checkbox rounded bg-slate-700 border-slate-500" ${isSelected ? 'checked' : ''}></td>
                <td class="px-3 py-4 text-sm text-slate-300">${hall.displayDate}</td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.hallName}</div>
                    <div class="text-slate-400">${hall.hallCode}</div>
                </td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.schoolName}</div>
                    <div class="text-slate-400">${hall.departmentName}</div>
                </td>
                <td class="px-3 py-4 text-sm text-slate-300">${hall.displayFeatures}</td>
                <td class="px-3 py-4 text-sm">
                    <div class="font-medium text-blue-400">${hall.inchargeName}</div>
                    <div class="text-slate-400">${hall.inchargeRole}</div>
                </td>
                <td class="px-3 py-4 text-sm"><span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}">${statusText}</span></td>
            </tr>`;
        }).join('');

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
                case 'hall': isActive = state.filters.hall.name || state.filters.hall.capacity || state.filters.hall.type; break;
                case 'belongsTo': isActive = state.filters.belongsTo.school || state.filters.belongsTo.department; break;
                case 'features': isActive = state.filters.features.length > 0; break;
                case 'incharge': isActive = !!state.filters.incharge.name; break;
                case 'status': isActive = !!state.filters.status; break;
            }
            icon.classList.toggle('text-blue-400', isActive);
            icon.classList.toggle('text-slate-400', !isActive);
        });
    }

    // --- UI & STATE UPDATES ---
    function updateActionButtonsState() {
        const selectedCount = state.selectedRows.length;
        document.getElementById('status-btn').disabled = selectedCount === 0;
        document.getElementById('features-btn').disabled = selectedCount !== 1;
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
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

    // --- MODAL HANDLING (FOR NON-FILTER MODALS) ---
    function openModal(modalId) {
        document.getElementById('modal-backdrop')?.classList.remove('hidden', 'opacity-0');
        document.getElementById(modalId)?.classList.remove('hidden');
    }

    function closeModal() {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
            backdrop.classList.add('opacity-0');
            setTimeout(() => backdrop.classList.add('hidden'), 300);
        }
        document.querySelectorAll('#update-status-modal, #modify-features-modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    function populateFeaturesModal(hall) {
        const container = document.getElementById('features-checkbox-container');
        if (!container) return;
        const allFeatures = getFeatures();
        const currentFeatures = hall.features || [];
        container.innerHTML = allFeatures.map(feature => `
            <label class="flex items-center text-slate-300">
                <input type="checkbox" value="${feature}" class="form-checkbox" ${currentFeatures.includes(feature) ? 'checked' : ''}>
                ${formatTitleCase(feature)}
            </label>`).join('');
    }

    // --- FILTER MANAGER INTEGRATION ---
    async function openFilterModalFor(column) {
        const context = {
            currentFilters: state.filters,
            allData: {
                halls: state.allHalls,
                schools: state.schoolsDataCache ? state.schoolsDataCache.schools : [],
                departments: state.schoolsDataCache ? state.schoolsDataCache.departments : [],
            }
        };
        FilterManager.openFilterModalFor(column, context);
    }

    function handleApplyFilter(newValues) {
        state.filters = { ...state.filters, ...newValues };
        applyFiltersAndRender();
    }

    function handleClearFilter(column) {
        if (state.filters.hasOwnProperty(column)) {
            state.filters[column] = defaultFilters()[column];
            applyFiltersAndRender();
        }
    }

    // --- EVENT HANDLERS ---
    function setupEventHandlers() {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        const view = document.getElementById('hall-details-view');
        if (!view) return;

        // Initialize the centralized filter manager for this view
        FilterManager.initialize({
            onApply: handleApplyFilter,
            onClear: handleClearFilter,
        });

        view.addEventListener('click', e => {
            const filterIcon = e.target.closest('.filter-icon');
            if (filterIcon) {
                openFilterModalFor(filterIcon.dataset.filterColumn);
                return;
            }
            
            const targetId = e.target.closest('button')?.id;
            if (targetId === 'clear-hall-filters-btn') {
                state.filters = defaultFilters();
                applyFiltersAndRender();
            } else if (targetId === 'status-btn' && state.selectedRows.length > 0) {
                openModal('update-status-modal');
            } else if (targetId === 'features-btn' && state.selectedRows.length === 1) {
                const selectedHall = state.allHalls.find(h => h.hallCode === state.selectedRows[0]);
                if (selectedHall) {
                    populateFeaturesModal(selectedHall);
                    openModal('modify-features-modal');
                }
            }
        }, { signal });

        document.body.addEventListener('click', e => {
            if (e.target.closest('.modal-close-btn')) closeModal();
            if (e.target.id === 'clear-all-features') {
                document.querySelectorAll('#features-checkbox-container input').forEach(cb => cb.checked = false);
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

        document.getElementById('update-status-modal')?.addEventListener('change', e => {
            if (e.target.name === 'status-option') {
                const reasonContainer = document.getElementById('status-reason-container');
                const dateRangeContainer = document.getElementById('status-date-range');
                const isUnavailable = e.target.value === 'false';
                reasonContainer.classList.toggle('hidden', !isUnavailable);
                dateRangeContainer.classList.toggle('hidden', !isUnavailable);
            }
        }, { signal });

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
            } else {
                 payload.unavailability_reason = null;
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
            try {
                await ApiService.halls.update(selectedHallCode, { features: selectedFeatures });
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
        state = { allHalls: [], filteredHalls: [], selectedRows: [], multiSelection: false, filters: defaultFilters(), schoolsDataCache: null };
        const multiSelectToggle = document.getElementById('multiselect-toggle');
        if(multiSelectToggle) multiSelectToggle.checked = false;
        FilterManager.close();
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
            if(tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-red-400">Failed to load data.</td></tr>`;
        }
    }

    return { initialize, cleanup };
})();

